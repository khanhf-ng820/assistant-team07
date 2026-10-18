# User Interface Architecture & Design Specification

**Project Name:** Smart Virtual Assistant (FIT HCMUS)  
**Document Owner:** Đặng Xuân Phát (UI/UX Lead, Team 07)  
**Target Repository:** `assistant-team07/ui/README.md`  
**Status:** Approved Specification (v0.1-setup / Milestone M7 Roadmap)  

---

## 1. Executive Summary & Design Philosophy

The **Smart Virtual Assistant** interface is engineered specifically for VNU-HCMUS students to query campus locations, academic regulations, tuition fees, and administrative procedures. Operating on a hybrid architecture (Deterministic Rules + RAG LLM Engine), the UI acts as a **transparent conversational decision-support interface** that provides instant, accurate answers with verifiable source attribution.

### Core UI Design Principles
1. **Clarity & Factuality First:** Highlight authoritative sources (e.g., `data/offices.csv`, Student Handbooks) directly below generated answers to maintain high trust.
2. **Deterministic & AI Hybrid Visibility:** Clearly indicate whether a response was generated via exact database lookup (Rule-based) or natural language synthesis (RAG/LLM).
3. **Frictionless Querying:** Provide quick-prompt cards for frequent student queries (e.g., *Office hours*, *Retake fee calculation*, *Library location*).
4. **Rich & Modern Aesthetics:** Utilize a clean Streamlit layout with HSL-tailored accents, structured markdown rendering, and interactive feedback widgets.

---

## 2. Technology Stack & Integration Architecture

- **UI Framework:** [Streamlit](https://streamlit.io/) (Python-native UI framework, fully integrated with the project's `.venv`).
- **Backend Bridge:** Direct Python module imports from `src/assistant/` (`rules.py`, `router.py`, `rag.py`).
- **State Management:** `streamlit.session_state` for maintaining multi-turn chat history and feedback logs.

---

## 3. Detailed Screen Specifications & Components

### 3.1. Main Chat Interface (`ChatWindow`)
- **Objective:** Provide a seamless messaging environment for student queries.
- **Key Components:**
  - `ChatMessageList`: Chronological display of user prompts and assistant responses using Streamlit chat elements (`st.chat_message`).
  - `QueryInputBox`: Fixed bottom input bar with auto-submit on Enter (`st.chat_input`).
  - `StatusIndicator`: Visual spinner indicating pipeline processing stage (Intent Routing -> Vector Search -> Response Generation).

### 3.2. Source Attribution & Citation Panel (`SourceBadge`)
- **Objective:** Prevent hallucination confusion by displaying exact data origins.
- **Key Components:**
  - `DataOriginTag`: Badge showing the underlying data file (e.g., `📌 Source: data/offices.csv [Room I.101]`).
  - `ConfidenceScore`: Visual indicator for RAG retrieval confidence[cite: 82].

### 3.3. Interactive Feedback & Evaluation Widget (`FeedbackPanel`)
- **Objective:** Collect user reaction data for system evaluation benchmarks (`eval/`).
- **Key Components:**
  - `ThumbRating`: One-click 👍 / 👎 buttons below each response[cite: 34].
  - `CorrectionModal`: Optional text area for users to report incorrect office hours or room numbers.

### 3.4. Sidebar Configuration (`SidebarControl`)
- **Objective:** Allow administrative testing and system mode selection.
- **Key Components:**
  - `ModeSelector`: Toggle between **Auto-Router**, **Rule-Only**, and **RAG-Only** modes.
  - `ClearHistoryButton`: Resets `session_state` chat context.
  - `TeamMetadataCard`: Displays current release version (`v0.1-setup`) and team member roles].



## 4. UI Layout Blueprint (Streamlit ASCII Wireframe)
```
+-----------------------------------------------------------------------+
|  Smart Virtual Assistant - Faculty of Information Technology HCMUS    |
+---------------------+-------------------------------------------------+
| SIDEBAR CONTROL     | MAIN CHAT DISPLAY                               |
|                     |                                                 |
| [System Mode]       | [Assistant]: Xin chào! Tôi là Trợ lý ảo HCMUS.  |
| (o) Auto-Router     |              Bạn cần tra cứu thông tin gì?      |
| ( ) Rule-Based      |                                                 |
| ( ) RAG Engine      | [User]: Phòng Đào tạo ở đâu và làm việc khi nào?|
|                     |                                                 |
| [Actions]           | [Assistant]: Phòng Đào tạo ở phòng I.101,       |
| [ Clear Chat ]      |              mở cửa T2-T6 (07:30 - 16:30).      |
|                     |              📌 Nguồn: data/offices.csv         |
| [Team 07 Meta]      |              [ 👍 Hữu ích ]  [ 👎 Báo lỗi ]    |
| Version: v0.1-setup |                                                 |
| Status: Healthy     | [ Input: Nhập câu hỏi (ví dụ: Phòng CTTT)...  ] |
+---------------------+-------------------------------------------------+
```



## 5. How to Run (Development & Execution Guide)

### Prerequisites
Ensure your Python virtual environment is activated and dependencies are installed:
```bash
# Activate virtual environment
source .venv/bin/activate       # macOS / Linux / Git Bash
# .venv\Scripts\Activate.ps1    # Windows PowerShell

# Install project in editable mode
pip install -e .
Running the UI Application
Bash
# Launch Streamlit interface
streamlit run ui/app.py
```
---
## 6. Design System & UI Tokens
Primary Accent: hsl(217, 91%, 60%) (HCMUS Academic Blue)

Secondary Accent: hsl(158, 64%, 52%) (Success & Verified Source Green)

Warning / Alert: hsl(38, 92%, 50%) (Ambiguous Query / Clarification Needed)

Background Base: Streamlit Dark / Light Adaptive Theme

Typography: Inter, Roboto, sans-serif

## 7. Academic AI Disclosure & Compliance Declaration
### 7.1. Formal Statement of AI Assistance
This User Interface specification and design architecture was developed with the assistance of Generative AI tools (Google Gemini / Advanced AI Coding Assistant) under strict human oversight, adhering to the academic integrity guidelines of course CSC10014: Computational Thinking (2026).   


### 7.2. Methodology & Verification Protocol
Structuring: Generative AI was utilized to format requirements into standard IEEE/ISO-compliant software interface design documentation templates.

Human Inspection & Domain Adaptation: The generated layout structures were manually audited, refined, and customized by Đặng Xuân Phát to reflect the functional specifications of the assistant-team07 project (e.g., HCMUS campus office lookups, data/offices.csv integration).

Verification Checklist:

[x] All screen definitions strictly map to the functional specifications in src/assistant/.

[x] Component names align with system layout rules in Lab 01 guidelines.

[x] No sensitive or personal student data was inputted or generated.   


Declared by: Đặng Xuân Phát (UI/UX Lead, Team 07)

Date: October 18, 2026
