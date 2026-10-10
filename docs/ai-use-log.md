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
| **10/10/2026** | Đặng Xuân Phát | Gemini 3.6 Flash | Structure UI architecture & sitemap for `ui/README.md` | Adapted sitemap to HCMUS Q5 context; refined 6 screen wireframe specs | Manually checked against `Promptational Thinking.md` functional requirements |
| **10/10/2026** | Đặng Xuân Phát | Gemini 3.6 Flash | Draft setup failure recovery log `setup_failure_log.md` | Formatted error tracebacks for PowerShell & Python venv | Tested recovery script commands locally via terminal |

---

## 3. Human Inspection Protocol
Every AI-assisted contribution in this repository undergoes the following 3-step verification before committing:
1. **Inspect (`git diff`):** Verify every line of code generated to ensure no hallucinated packages, invalid API calls, or hidden security vulnerabilities exist.
2. **Verify (`pytest -q`):** Execute full test suite to guarantee that existing functionality remains unbroken.
3. **Disclose (`PR Description & AI Log`):** Document the tool used, prompt objective, and human modifications in the Pull Request body and this log file.
