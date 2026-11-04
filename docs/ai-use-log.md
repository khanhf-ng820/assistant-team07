# Academic AI Use Log & Integrity Disclosure

**Course:** CSC10014 - Computational Thinking (2026)  
**Team:** Team 07 (`assistant-team07`)  
**Document Maintenance:** All Team Members  

---

## 1. Academic AI Policy Compliance Statement

In accordance with the course policy for CSC10014, artificial intelligence tools (such as Copilot, Gemini, ChatGPT, Claude) are permitted as cognitive assistants provided their usage is **transparently disclosed**, **strictly audited by human authors**, and **thoroughly verified through unit tests**.

Undisclosed AI code generation is considered an academic integrity violation. Disclosed and human-verified AI assistance is welcome as part of modern developer workflows.

---

## 2. AI Usage Registry

| Date | Author | AI Tool | Task / Prompt Goal | Kept / Modified Code | Human Verification Method |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **31/10/2026** | Team 07 — publication for issue #30; human author/reviewer pending | OpenAI Codex | Publish the implementation plan through the repository contribution workflow | Prepared the plan, documentation index, and AI-use log on `docs/30-carenta-implementation-plan` from the fetched `origin/main`; replaced local-only source links with explicit file references and recorded publication status. Only three Markdown files are included; PDFs and other local references remain untracked. | Codex checked Markdown links/fences and diff whitespace. `.venv/bin/python -m pytest -q` exited with two collection errors in `tests/test_eval.py` and `tests/test_smoke.py`, both `ModuleNotFoundError: No module named 'assistant'`, matching the documented existing import blocker. No application code changed. Human inspection and approval remain pending; no passing CI result is claimed. |
| **31/10/2026** | Team 07 — planning revision; human author/reviewer pending | OpenAI Codex | Inspect the exported `Figma.pdf` and reconcile the implementation plan with its screens and the owner's clarification | Updated `docs/carenta-implementation-plan.md` and its index entry with all 19 page references, declared design tokens, proposed navigation, state/copy corrections, read-only goal balance, savings history/API contracts, and acceptance gates. Replaced the visual-review blocker with export-based evidence. No application code or PDF files changed. | Codex text-extracted, rendered, and visually inspected all 19 pages. Independently checked July's 7,640,000 ₫ daily sum against the inconsistent 4,850,000 ₫ mock summary, the 290,000 ₫ day total, and the 30-day/25,000 ₫ goal example. Local links, all 19 page mappings, source hash, six member names, Markdown fences/whitespace, preview arithmetic, and the 144-hour total passed checks; runtime tests not run. Human inspection pending. |
| **31/10/2026** | Team 07 — planning draft; human author/reviewer pending | OpenAI Codex | Read the CARENTA proposal, supporting project notes, and member image; interview the project owner; prepare the mobile architecture and delivery plan | Added `docs/carenta-implementation-plan.md` and its documentation index entry. Recorded nine user-confirmed constraints, proposed stack/data/API design, UI evidence, ownership, schedule, and acceptance gates. Figma MCP connected, but design inspection and the post-installation retry were blocked by its Starter-plan call limit. No application code changed. | Codex extracted both PDFs, visually inspected the member image and key proposal UI pages, and checked official technology documentation. The Figma account check confirmed Starter/View access; official quota documentation was checked. Local-link, UTF-8, fence, member-name, and diff-whitespace checks passed. Runtime tests were not run; the existing package import blocker remains unresolved. Human inspection pending. |
| **18/10/2026** | Trần Phúc Khánh (issue #9) | OpenAI Codex | Specify the future LLM interface without provider calls | Drafted `docs/ai-interface.md` with typed signatures, input/output contracts, errors, fallback, and local examples; added the docs index link | Codex executed the examples and regression suite; human author and reviewer inspection pending |
| **10/10/2026** | Đặng Xuân Phát | Gemini 3.6 Flash | Structure UI architecture & sitemap for `ui/README.md` | Adapted sitemap to HCMUS Q5 context; refined 6 screen wireframe specs | Manually checked against `Promptational Thinking.md` functional requirements |
| **10/10/2026** | Đặng Xuân Phát | Gemini 3.6 Flash | Draft setup failure recovery log `setup_failure_log.md` | Formatted error tracebacks for PowerShell & Python venv | Tested recovery script commands locally via terminal |
| **10/10/2026** | Đặng Xuân Phát | Gemini 3.6 Flash | Refactor Python Bootcamp W1 functions (`grades`, `text_tools`, `rules`, `translate`, `timetable`) | Added strict type hints, docstrings, and edge-case guards | Executed `pytest` suite locally; 24/24 unit tests passed (100% pass rate) |
| **18/10/2026** | Trần Phúc Khánh (issue #8) | OpenAI Codex | Document data sources, owners, and update frequency | Added a file inventory to `data/README.md`; retained sample-data status and existing security guidance | Codex checked the tracked inventory, CSV, loader, and regression suite; human author and reviewer inspection pending |
| **18/10/2026** | Lý Tuấn Kiệt | Gemini 3.8 Flash | Support partial office name lookup in backend (`rules.py`) | Implemented clean name and substring partial matching logic in `rules.py`; added unit tests in `test_smoke.py` | Ran pytest suite (15/15 passed), check_env.py, and manual CLI verification |
| **18/10/2026** | Lý Tuấn Kiệt | Gemini 3.8 Flash | Design how citations appear under answers (`docs/ui-sources.md`) | Drafted citation data schema, ASCII wireframes, Markdown mockups with 2 examples, and Streamlit implementation code | Verified Markdown rendering, reviewed alignment with Lab 02 acceptance criteria and DoD |



---

## 3. Human Inspection Protocol
Every AI-assisted contribution in this repository undergoes the following 3-step verification before committing:
1. **Inspect (`git diff`):** Verify every line of code generated to ensure no hallucinated packages, invalid API calls, or hidden security vulnerabilities exist.
2. **Verify (`pytest -q`):** Execute full test suite to guarantee that existing functionality remains unbroken.
3. **Disclose (`PR Description & AI Log`):** Document the tool used, prompt objective, and human modifications in the Pull Request body and this log file.
