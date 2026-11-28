# Coding Standards

Judgement-call standards enforced during `/code-review` alongside [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md). Mechanical checks (syntax, types, imports, OpenAPI fields) belong in `ruff`, `eslint`, `tsc`, and `scripts/check_openapi_contracts.py` rather than here.

## Reliability & Fail-Closed Boundaries

- **Fail closed on storage and auth reads:** Propagate typed errors (`STORAGE_READ_FAILED`, `STORAGE_WRITE_FAILED`, `401`/`503`) rather than swallowing read errors and falling back to default or initial state (for example, never fall back to generation `1` when reading a persistence manifest fails).
- **Commit before sweeping:** For multi-key or multi-step persistence writes, write and verify the new payload before updating the pointer/manifest, and delete superseded state only after the new pointer is committed.

## Consistency & Documentation

- **Match domain seams:** Follow the terminology in `GLOSSARY.md` and boundaries in `docs/adr/`. Avoid duplicating non-trivial key builders or encoding helpers across source and tests when exporting one shared helper prevents drift.
- **Document skipped security checks:** Whenever a configuration mode omits a validation check (such as `iss` validation when `SUPABASE_URL` is unset), document that tradeoff in the service `README.md`.
