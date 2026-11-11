from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["carenta-api"] = "carenta-api"


def create_app() -> FastAPI:
    application = FastAPI(title="CARENTA placeholder API", version="0.1.0")

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    return application


app = create_app()
