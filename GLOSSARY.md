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

**Capture Draft**:
An unsaved, user-editable expense proposal produced by OCR or Voice Capture that never alters cash balances or Safe-to-Spend until explicitly confirmed by the Student Identity.
_Avoid_: AI transaction, Parsed transaction, Auto-saved expense

**Voice Capture**:
A bounded, single-purchase Vietnamese audio recording (at most 30 seconds) converted into a recognized transcript and Capture Draft.
_Avoid_: Voice note, Voice transaction, Itemized voice split
