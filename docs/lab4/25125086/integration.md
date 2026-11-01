# Lab 4 team integration preparation

This is a preparation checklist, not evidence that teammates completed or
reviewed their tasks. Personal implementation issue: [#32](https://github.com/khanhf-ng820/assistant-team07/issues/32).

## Prepared issue briefs

Before publishing additional issues, check the board and reuse matching issues.
Each brief below supplies a title, owner, reviewer, and acceptance criteria;
these additional issues have not been created or assigned.

| Task title | Primary owner | Reviewer | Acceptance criteria |
| --- | --- | --- | --- |
| Verify T1 chat contract and prepare API integration | Nguyễn Phúc Khánh | Nguyễn Minh Khang | Forward message/session, preserve service fields, fresh 12-hex ID; chat 200/422; choose one API implementation after review. |
| Verify T2 feedback creation and API runbook | Lý Tuấn Kiệt | Trần Thành Lợi | Persist feedback in memory with incrementing ID and UTC timestamp; 201 for valid input, 422 for invalid rating; reproducible setup/run instructions. |
| Verify T3 admin access and security | Trần Phúc Khánh | Đặng Xuân Phát | Missing/wrong key gives 401; correct key lists feedback with 200; no credentials in repository/evidence; optional rate limit remains separate. |
| Verify T4 weather and fallback behavior | Trần Thành Lợi | Lý Tuấn Kiệt | Weather schema on success, 503 without cache on failure, stale cache on failed refresh; deterministic mocked tests. |
| Collect integrated API test and demo evidence | Nguyễn Minh Khang | Trần Phúc Khánh | Warm-up/starter results with actual counts; inspect curl statuses; successful Swagger chat screenshot; record integrated commit. |
| Add sorted offices endpoint with two tests | Đặng Xuân Phát | Nguyễn Phúc Khánh | `OfficeDirectory.all()` sorts Office objects by name; GET `/v1/offices` exposes name/room/hours; at least two tests for 200 and Library, with sort verification. |

Every member still completes P1–P5 and T1–T4 independently, opens a personal
PR, and writes their own H2 reflection. Primary ownership does not replace this.

## Review and integration gate

- [ ] All personal PRs link issues, disclose AI use, and contain real evidence.
- [ ] Assigned reviewers inspect code using `REVIEW_CHECKLIST.md`.
- [ ] Choose one clear T1–T4 implementation; avoid merging six overlapping APIs.
- [ ] Obtain teammate approval for the selected PR before merging.
- [ ] Incorporate H1 and any missing documentation/tests through reviewed PRs.
- [ ] Rerun warm-up and complete starter tests on the integrated revision.
- [ ] Inspect integrated curl results and refresh Swagger evidence if needed.
- [ ] Confirm H1 is sorted, includes Library, and has at least two tests.
- [ ] Review staged paths for credentials, PDFs, and unrelated local files.
- [ ] Record that CI is unavailable; do not mark a nonexistent workflow green.
- [ ] Create and publish `v0.4-api` only after integration checks and approval.
- [ ] Submit PR/evidence links and each member's reflection; submit the tag link.

## Submission timing

The personal PR and Swagger screenshot are due at the end of Lab 4 (draft PR
accepted). The integrated tag, H1, and H2 are due at 23:59 the day before Lab 5.
Confirm the actual calendar date in the LMS; the tutorial supplies no date.
