# CARENTA

Vietnamese student personal finance mobile app and FastAPI backend focused on deterministic budgeting, savings goals, and low-friction expense capture.

## Language

**Student Identity**:
The authenticated owner of CARENTA financial records, derived exclusively from a verified Supabase JWT (`auth.uid()`) and never from a client-supplied user ID.
_Avoid_: Account, Login

**Auth Session**:
The device-persisted access and refresh token pair paired with Student Identity metadata stored in encrypted device storage.
_Avoid_: Token, Credentials

**Local Dev Mode**:
An explicit, opt-in unauthenticated LAN development state active only when Supabase configuration is absent; it never bypasses row-level security against a configured Supabase project.
_Avoid_: Guest mode, Demo user

**Offline Fallback**:
Read-only display of a Student Identity's last-known cached financial snapshot (cleared on sign-out) combined with retryable connection errors; financial writes never queue offline.
_Avoid_: Offline mode, Offline sync

**Safe-to-Spend**:
Integer VND discretionary funds available for the current planning period after subtracting Protected Funds from net cash.
_Avoid_: Balance, Free cash

**Protected Funds**:
The integer VND sum of unpaid commitments, allocated piggy-bank savings, and reserved period savings shielded from daily spending.
_Avoid_: Locked balance, Reserve pool

**Assistant Snapshot**:
A read-only, server-assembled view for one Student Identity combining their current budget state, revision-scoped coaching insight, recurring habit candidate, and active Proactive Triggers.
_Avoid_: API gateway payload, Chatbot response

**Proactive Trigger**:
A server-evaluated, non-mutating prompt alerting a Student Identity to today's overspending, a missing evening expense entry, or a recurring spending habit, paired with an allowlisted in-app action; it never records a transaction automatically.
_Avoid_: Push notification, Auto-action

**Scheduled Job Run**:
An idempotent execution record for a periodic backend check (evening check-in or daily habit analysis) deduplicated per Student Identity and Asia/Ho_Chi_Minh local date.
_Avoid_: Cron ping, Worker task
