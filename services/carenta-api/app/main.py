"""CARENTA FastAPI entrypoint."""

from __future__ import annotations

import datetime as dt
import hmac
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, SecretStr

from app.assistant_schemas import (
    AssistantSnapshotResponse,
    JobName,
    JobStatusResponse,
    ProactiveTriggerListResponse,
    ReadinessResponse,
    ScheduledJobRunResponse,
    TriggerDismissResponse,
)
from app.auth import (
    AuthConfig,
    AuthIdentity,
    TokenVerifier,
    load_auth_config,
    make_current_identity_dependency,
)
from app.errors import ApiHttpError, register_error_handlers
from app.orchestrator import AssistantOrchestrator, InsightProviderProtocol
from app.repository import (
    ActiveGoalExistsError,
    IdempotencyConflictError,
    InMemoryRepository,
    repository as default_repository,
)
from app.scheduler import (
    AssistantStateStore,
    BackgroundJobScheduler,
    Clock,
    HabitAnalyzerProtocol,
)
from app.schemas import (
    BudgetSummaryResponse,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
)
from app.settings import SchedulerSettings, load_scheduler_settings


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["carenta-api"] = "carenta-api"


class BudgetConfigRequest(BaseModel):
    opening_balance: Optional[int] = Field(default=None, ge=0)
    unpaid_commitments: Optional[int] = Field(default=None, ge=0)
    savings_reserved: Optional[int] = Field(default=None, ge=0)


class GoalAllocationRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in integer VND to allocate into savings")


def _verify_scheduler_secret(
    configured_secret: SecretStr | None,
    provided_secret: str | None,
) -> None:
    if configured_secret is None:
        raise ApiHttpError(
            503,
            "SCHEDULER_SECRET_UNCONFIGURED",
            "Internal scheduler secret is not configured.",
        )
    expected = configured_secret.get_secret_value()
    candidate = (provided_secret or "").strip()
    if not candidate or not hmac.compare_digest(candidate, expected):
        raise ApiHttpError(
            403,
            "SCHEDULER_FORBIDDEN",
            "Invalid or missing scheduler secret.",
        )


def create_router(
    get_current_identity: Callable[..., AuthIdentity],
    repo: InMemoryRepository,
    scheduler: BackgroundJobScheduler | None = None,
    orchestrator: AssistantOrchestrator | None = None,
) -> APIRouter:
    router = APIRouter()
    if scheduler is not None:
        active_scheduler = scheduler
    else:
        active_scheduler = BackgroundJobScheduler(
            repo=repo, state_store=AssistantStateStore()
        )
    active_orchestrator = orchestrator or AssistantOrchestrator(
        repo=repo,
        state_store=active_scheduler.state_store,
        scheduler=active_scheduler,
    )

    def _create_active_goal(
        user_id: str, payload: GoalCreate, today: Optional[dt.date]
    ) -> GoalResponse:
        try:
            goal = repo.set_active_goal(user_id, payload, today=today)
        except ActiveGoalExistsError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        active_orchestrator.on_ledger_mutated(user_id)
        return goal

    # --- Transactions ---

    @router.get("/transactions", response_model=TransactionListResponse)
    def list_transactions(
        start_date: Optional[dt.date] = Query(None, description="Filter transactions on or after this date"),
        end_date: Optional[dt.date] = Query(None, description="Filter transactions on or before this date"),
        kind: Optional[Literal["income", "expense"]] = Query(None, description="Filter by transaction type"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionListResponse:
        items = repo.list_transactions(identity.user_id, start_date=start_date, end_date=end_date, kind=kind)
        total_income = sum(t.amount for t in items if t.kind == "income")
        total_expense = sum(t.amount for t in items if t.kind == "expense")
        return TransactionListResponse(
            items=items,
            total=len(items),
            total_income=total_income,
            total_expense=total_expense,
        )

    @router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
    def create_transaction(
        payload: TransactionCreate,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionResponse:
        try:
            created = repo.create_transaction(identity.user_id, payload)
        except IdempotencyConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        active_orchestrator.on_transaction_recorded(identity.user_id, created)
        return created

    @router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
    def get_transaction(
        transaction_id: str,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionResponse:
        item = repo.get_transaction(identity.user_id, transaction_id)
        if not item:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return item

    # --- Budget Summary (Safe-to-Spend & Recovery) ---

    @router.get("/budget/summary", response_model=BudgetSummaryResponse)
    def get_budget_summary(
        today: Optional[dt.date] = Query(None, description="Calculation reference date (defaults to today)"),
        days_remaining: Optional[int] = Query(None, gt=0, description="Override remaining days in planning period"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> BudgetSummaryResponse:
        return repo.get_budget_summary(identity.user_id, today=today, days_remaining=days_remaining)

    @router.post("/budget/config", status_code=status.HTTP_200_OK)
    def configure_budget(
        payload: BudgetConfigRequest,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> dict[str, str]:
        repo.configure_budget(
            identity.user_id,
            opening_balance=payload.opening_balance,
            unpaid_commitments=payload.unpaid_commitments,
            savings_reserved=payload.savings_reserved,
        )
        active_orchestrator.on_ledger_mutated(identity.user_id)
        return {"status": "ok", "message": "Budget parameters updated"}

    # --- Saving Goals ---

    @router.get("/goals", response_model=list[GoalResponse])
    def list_goals(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> list[GoalResponse]:
        return repo.list_goals(identity.user_id, today=today)

    @router.post("/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def create_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        return _create_active_goal(identity.user_id, payload, today)

    @router.get("/goal", response_model=GoalResponse)
    def get_active_goal(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.get_active_goal(identity.user_id, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal found")
        return goal

    @router.post("/goal", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def set_active_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        return _create_active_goal(identity.user_id, payload, today)

    @router.patch("/goal", response_model=GoalResponse)
    def update_active_goal(
        payload: GoalUpdate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.update_active_goal(identity.user_id, payload, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to update")
        active_orchestrator.on_ledger_mutated(identity.user_id)
        return goal

    @router.post("/goal/allocate", response_model=GoalResponse)
    def allocate_savings(
        payload: GoalAllocationRequest,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.allocate_to_active_goal(identity.user_id, payload.amount, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to allocate savings to")
        active_orchestrator.on_ledger_mutated(identity.user_id)
        return goal

    # --- Assistant Orchestration ---

    @router.get("/assistant/snapshot", response_model=AssistantSnapshotResponse)
    def get_assistant_snapshot(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> AssistantSnapshotResponse:
        return active_orchestrator.get_snapshot(identity.user_id)

    @router.get("/assistant/triggers", response_model=ProactiveTriggerListResponse)
    def list_proactive_triggers(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> ProactiveTriggerListResponse:
        return active_orchestrator.list_triggers(identity.user_id)

    @router.post(
        "/assistant/triggers/{trigger_id}/dismiss",
        response_model=TriggerDismissResponse,
    )
    def dismiss_proactive_trigger(
        trigger_id: str,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TriggerDismissResponse:
        return active_orchestrator.dismiss_trigger(identity.user_id, trigger_id)

    # --- Background Scheduler & Jobs ---

    @router.post("/jobs/{job_name}/run", response_model=ScheduledJobRunResponse)
    def run_user_job(
        job_name: JobName,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> ScheduledJobRunResponse:
        return active_scheduler.run_job_for_owner(identity.user_id, job_name)

    @router.get("/jobs/status", response_model=JobStatusResponse)
    def get_job_status(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> JobStatusResponse:
        return active_scheduler.get_status(identity.user_id)

    @router.post("/internal/jobs/{job_name}/run", response_model=ScheduledJobRunResponse)
    def run_internal_job(
        job_name: JobName,
        x_scheduler_secret: str | None = Header(default=None, alias="X-Scheduler-Secret"),
    ) -> ScheduledJobRunResponse:
        _verify_scheduler_secret(
            active_scheduler.settings.scheduler_secret,
            x_scheduler_secret,
        )
        return active_scheduler.run_job_for_all_owners(job_name)

    return router


def create_app(
    auth_config: AuthConfig | None = None,
    token_verifier: TokenVerifier | None = None,
    repository: InMemoryRepository | None = None,
    clock: Clock | None = None,
    scheduler_config: SchedulerSettings | None = None,
    scheduler_settings: SchedulerSettings | None = None,
    habit_analyzer: HabitAnalyzerProtocol | None = None,
    scheduler_secret: str | None = None,
    insight_provider: InsightProviderProtocol | None = None,
) -> FastAPI:
    resolved_config = auth_config or load_auth_config()
    get_current_identity = make_current_identity_dependency(
        resolved_config, verifier=token_verifier
    )
    active_repo = default_repository if repository is None else repository
    resolved_scheduler = (
        scheduler_config or scheduler_settings or load_scheduler_settings()
    )
    if scheduler_secret is not None:
        cleaned_secret = scheduler_secret.strip()
        resolved_scheduler = SchedulerSettings(
            enabled=resolved_scheduler.enabled,
            poll_interval_seconds=resolved_scheduler.poll_interval_seconds,
            evening_reminder_time=resolved_scheduler.evening_reminder_time,
            habit_analysis_time=resolved_scheduler.habit_analysis_time,
            scheduler_secret=SecretStr(cleaned_secret) if cleaned_secret else None,
        )
    state_store = AssistantStateStore()
    active_scheduler = BackgroundJobScheduler(
        repo=active_repo,
        state_store=state_store,
        settings=resolved_scheduler,
        clock=clock,
        habit_analyzer=habit_analyzer,
    )
    active_orchestrator = AssistantOrchestrator(
        repo=active_repo,
        state_store=state_store,
        scheduler=active_scheduler,
        clock=clock,
        insight_provider=insight_provider,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        await active_scheduler.start()
        try:
            yield
        finally:
            await active_scheduler.stop()

    application = FastAPI(
        title="CARENTA Financial API",
        version="0.1.0",
        description="Deterministic budget calculation engine & FastAPI CRUD endpoints",
        lifespan=lifespan,
    )
    register_error_handlers(application)

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @application.get("/ready", response_model=ReadinessResponse)
    def ready() -> ReadinessResponse:
        return active_orchestrator.build_readiness(resolved_config)

    auth_router = APIRouter()

    @auth_router.get("/auth/me", response_model=AuthIdentity)
    def auth_me(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> AuthIdentity:
        return identity

    # Mount v1 routers at both /api/v1 and /v1 for full interoperability
    api_v1_router = create_router(
        get_current_identity,
        active_repo,
        scheduler=active_scheduler,
        orchestrator=active_orchestrator,
    )
    application.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    application.include_router(auth_router, prefix="/v1", tags=["auth"])
    application.include_router(api_v1_router, prefix="/api/v1", tags=["API v1"])
    application.include_router(api_v1_router, prefix="/v1", tags=["v1"])

    return application


app = create_app()
