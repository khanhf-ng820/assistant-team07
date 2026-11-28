"""Static checks on the #52 capture_media migration (no live Postgres in CI yet).

These pin the security-relevant rules reviewers asked for; they parse the SQL
text rather than executing it, so a live Supabase run is still needed.
"""

from __future__ import annotations

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20261126000000_capture_media.sql"
).read_text(encoding="utf-8")
SQL = re.sub(r"--[^\n]*", "", MIGRATION).lower()
FUNCTION = SQL[SQL.index("create or replace function public.confirm_expense_with_media") :]


def test_students_cannot_insert_update_or_delete_capture_media():
    assert "revoke all on public.capture_media from anon, authenticated" in SQL
    assert "grant select on public.capture_media to authenticated" in SQL
    policies = re.findall(r'create policy "[^"]*" on public\.capture_media\s+for (\w+)', SQL)
    assert policies == ["select"]


def test_confirm_rejects_null_ids_and_purged_or_expired_media():
    assert "array_position(p_media_ids, null) is not null" in FUNCTION
    assert "purged_at is not null" in FUNCTION


def test_retry_compares_source_and_exact_media_set():
    assert "source = p_source" in FUNCTION
    assert "coalesce(transaction_id = v_tx_id, false) <> (id = any (p_media_ids))" in FUNCTION


def test_linked_media_becomes_due_for_deletion():
    link = FUNCTION[FUNCTION.index("update public.capture_media") :]
    assert "expires_at = now()" in link
    assert "then null" not in link
