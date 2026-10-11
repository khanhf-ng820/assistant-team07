# User Interface Architecture & Design Specification

**Project Name:** AI Student Budget & Food Planner  
**Document Owner:** Đặng Xuân Phát (UI/UX Lead)  
**Target Repository:** `assistant-team07/ui/README.md`  
**Status:** Approved Specification (v0.1-setup)  

---

## 1. Executive Summary & Design Philosophy

The **AI Student Budget & Food Planner** interface is engineered specifically for Vietnamese university students residing in dormitories or rented apartments with tight living budgets. Unlike conventional expense-tracking applications that merely record past expenditures, this UI acts as a **predictive decision-support system**. It seamlessly bridges financial constraints with daily dietary decisions.

### Core UI Design Principles
1. **Clarity & Financial Hygiene:** Display actionable figures (*Safe-to-Spend* and *Daily Budget*) prominently to eliminate cognitive fatigue.
2. **Context-Aware Personalization:** Adapt interface elements dynamically based on user living conditions (e.g., cooking equipment available, dietary preferences, schedule density).
3. **Frictionless Data Entry:** Minimize input steps using quick-action cards, OCR receipt scanning placeholders, and smart presets.
4. **Rich & Modern Aesthetics:** Utilize sleek dark mode, HSL-tailored vibrant accents, subtle glassmorphism, and responsive micro-animations to deliver a state-of-the-art user experience.

---

## 2. Information Architecture (Sitemap)

```
[ Root View Controller ]
   │
   ├── 1. HomeScreen (Personalized Dashboard)
   │     ├── Safe-to-Spend Banner & Daily Budget Gauge
   │     ├── Quick Meal Recommendation Card
   │     ├── Savings Goal Tracker
   │     └── Event Alert & Recovery Notification
   │
   ├── 2. BudgetScreen (Smart Budget Management)
   │     ├── Income & Expense Entry Form
   │     ├── Categorical Expenditure Chart (Recharts / D3)
   │     ├── Event Budget Allocator
   │     └── Budget Recovery Adjustment Modal
   │
   ├── 3. RecipeScreen (AI Food & Meal Recommendation)
   │     ├── Pantry-Matched Cooking Suggestions
   │     ├── Cost-per-Meal & Cooking Time Indicator
   │     ├── Step-by-Step Cooking Guide
   │     └── Smart Grocery Checklist Generator
   │
   ├── 4. RestaurantScreen (HCMUS Q5 Localized Dining)
   │     ├── Nearby Budget-Friendly Eateries
   │     ├── Price Tier & Distance Filter
   │     └── Student Discount & Rating Badge
   │
   ├── 5. PantryScreen (Food & Inventory Tracker)
   │     ├── Fridge & Dry Pantry Inventory List
   │     ├── Expiry Date Countdown & Color Alerts
   │     └── Quick Add via Barcode / Text Input
   │
   └── 6. ProfileScreen (Personalization Engine Setup)
         ├── Monthly Income & Saving Goals Setup
         ├── Culinary Preferences & Allergies
         ├── Kitchen Equipment Profile (Air Fryer, Electric Cooker, etc.)
         └── Campus Location & Dormitory Profile
```

---

## 3. Detailed Screen Specifications & Wireframe Layouts

### 3.1. HomeScreen (Personalized Dashboard)
* **Objective:** Give students an instant 5-second snapshot of their financial health and today's meal guidance.
* **Key Components:**
  - `SafeToSpendCard`: Highlights net spendable balance after fixed costs and savings reserves.
  - `DailyBudgetGauge`: Circular animated progress indicator displaying remaining budget for the day.
  - `MealSuggestionWidget`: Dynamic card suggesting *Cook at Home* or *Eat Out* based on time and remaining funds.
  - `RecoveryBanner`: Appears conditionally if yesterday's budget was exceeded, displaying the automated daily budget adjustment.

### 3.2. BudgetScreen (Smart Budget Management)
* **Objective:** Manage income sources (family allowance, part-time jobs, scholarships) and daily expenses.
* **Key Components:**
  - `TransactionList`: Chronological list with category badges (Food, Study, Transit, Entertainment).
  - `CategoryPieChart`: Interactive visual breakdown of spending patterns.
  - `EventPlannerWidget`: Input form for upcoming events (birthdays, club outings) to reserve funds in advance.

### 3.3. RecipeScreen (AI Meal Recommendation)
* **Objective:** Recommend affordable, healthy recipes tailored to existing pantry items and student constraints.
* **Key Components:**
  - `RecipeCardGrid`: Filterable grid showing recipe title, estimated cost (VND), prep time, and matching percentage with pantry ingredients.
  - `PantryMatchBadge`: Shows ingredients available vs. ingredients needed.
  - `GroceryExportButton`: One-tap export of missing ingredients to the Smart Grocery List.

### 3.4. RestaurantScreen (HCMUS Q5 Localized Dining)
* **Objective:** Help students eat out affordably near HCMUS Campus 1 (District 5).
* **Key Components:**
  - `EateryListView`: Distance-sorted cards showing dish recommendations under 35,000 VND / 50,000 VND.
  - `DistanceBadge`: Walking distance indicator (e.g., "300m from I-building").
  - `BudgetFitIndicator`: Visual tag indicating whether the meal fits within the remaining *Meal Budget*.

### 3.5. PantryScreen (Inventory Tracker)
* **Objective:** Prevent food waste and optimize ingredient usage.
* **Key Components:**
  - `IngredientItemTile`: Tile displaying item name, quantity, and freshness status.
  - `ExpiryBadge`: Color-coded indicator (Green: Fresh, Yellow: Use Soon within 2 days, Red: Expiring Today).

### 3.6. ProfileScreen (Personalization Setup)
* **Objective:** Train the `AI Personalization Engine` with individual constraints.
* **Key Inputs:**
  - Kitchen appliances checklist: `[x] Electric Rice Cooker`, `[x] Mini Fridge`, `[ ] Air Fryer`, `[ ] Gas Stove`.
  - Dietary constraints: Vegetarian, Peanut Allergy, No Seafood.
  - Target monthly saving goal (e.g., 500,000 VND).

---

## 4. Design System & UI Tokens

### 4.1. Color Palette (Dark Mode Base)
- **Primary Accent:** `hsl(158, 64%, 52%)` (Emerald Green - Financial Growth & Fresh Food)
- **Secondary Accent:** `hsl(217, 91%, 60%)` (Electric Blue - AI Intelligence)
- **Warning / Alert:** `hsl(38, 92%, 50%)` (Amber Yellow - Expiry Warning / Budget Recovery)
- **Background Dark:** `hsl(222, 47%, 11%)` (Deep Slate)
- **Surface Card:** `hsl(217, 33%, 17%)` (Glassmorphic Surface with `backdrop-filter: blur(12px)`)

### 4.2. Typography & Layout
- **Font Family:** `Inter`, `Roboto`, `system-ui`, sans-serif.
- **Grid System:** 12-column responsive grid for Desktop/Web, 4-column responsive grid for Mobile Viewport.
- **Transitions:** `transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)`.

---

## 5. Academic AI Disclosure & Compliance Declaration

### 5.1. Formal Statement of AI Assistance
This User Interface specification and design architecture was developed with the assistance of Generative AI tools (Google Gemini 3.6 Flash / Advanced AI Coding Assistant) under strict human oversight and academic oversight, adhering to the guidelines of course **CSC10014: Computational Thinking (2026)**.

### 5.2. Methodology & Verification Protocol
1. **Inspiration & Structuring:** Generative AI was prompted to synthesize raw project requirements from `Promptational Thinking.md` into standard IEEE/ISO-compliant software interface design documentation templates.
2. **Human Inspection & Domain Adaptation:** The generated layout structures were manually audited, refined, and customized by **Đặng Xuân Phát** to reflect the specific socioeconomic context of HCMUS students (e.g., District 5 dining localization, dormitory appliance limitations).
3. **Verification Checklist:**
   - [x] All screen definitions strictly map to the functional specifications in `Promptational Thinking.md`.
   - [x] Component names align with the system layout rules in Lab 01 guidelines.
   - [x] No sensitive or personal student data was inputted or generated.

*Declared by:* **Đặng Xuân Phát** (UI/UX Lead, Team 07)  
*Date:* October 10, 2026  
