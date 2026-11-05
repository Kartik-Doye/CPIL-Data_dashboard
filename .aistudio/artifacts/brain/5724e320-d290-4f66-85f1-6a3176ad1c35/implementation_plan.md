# GO Gas Executive Suite: Proactive 48-Hour Inventory Burn Alert System, Reports Side Drawer & Full Suite Enhancements

Implementation blueprint for adding a **48-Hour Low Inventory Burn Prediction Alert System** on the MasterDashboard, a **Collapsible Reports Side Drawer Navigation**, and executing a **Full Suite Upgrade** across existing modules (RSP Disparity Alerts, Free Sale Leakage Audit, TM Performance Leaderboard, and Churn Risk Model).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the Phase 1 interview:

* **Confirmed Choice 1 (48-Hour Inventory Alerts)**: Dedicated **48-Hour Critical Low Stock Panel** positioned on the MasterDashboard featuring real-time burn countdown timers, stockout hours left, and 1-click AutoLPG Tanker Dispatch CTA.
* **Confirmed Choice 2 (Reports Navigation)**: **Collapsible Left Sidebar Drawer** with quick search bar, category grouping (Executive, Operations, Analytics, Forecasting), unboxed metadata badges, and smooth slide animation.
* **Confirmed Choice 3 (Full Suite Feature Upgrade)**: Implementing all 4 core enhancements across existing report modules:
  1. *RSP Disparity Alerts* (Price gap detection vs state baseline).
  2. *Free Sale Leakage Audit* (Testing gas exceeding 0.5% threshold).
  3. *TM & Field Coordinator Leaderboard* (Volume, efficiency & recovery scoring).
  4. *Commercial Fleet Churn Predictor* (3-day consecutive volume drop model).

---

## 1. Overview & Core Concept

The **GO Gas Executive Suite** operational dashboard is being expanded with proactive supply chain predictive intelligence and executive navigation.

### Key Value Delivered:
1. **Predictive Supply Chain Safety**: Prevents dry-outs by flagging stations whose 3-day burn rate will deplete closing tank stock within 48 hours.
2. **Instant Executive Navigation**: Slide-out reports drawer enables 1-click navigation across all 32 reports without sacrificing screen real estate.
3. **Revenue Protection**: Audits Free Sale calibration gas, identifies RSP pricing disparities, and detects fleet customer churn before revenue is lost.

---

## 2. User Experience & Visual Design

### Visual Identity & Theme Discipline:
* **Dual-Theme Integrity**: Crisp Corporate Light mode default (`Slate-50` background, high-contrast text, `indigo-600`/`orange-600` accents) with seamless Dark Mode toggle (`.dark` class on root HTML).
* **Zero-Pill Discipline**: Metadata rendered as clean unboxed text separated by typographic dots (`·`) or subtle hairline borders; filter buttons styled as structured segmented tabs.
* **Tabular Figures**: All litres (`L`), rupee collections (`₹`), hours left (`h`), and drop percentages (`%`) enforce `font-mono tabular-nums` to ensure decimal alignment.

### Key Interactive Flows:
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ GO Gas Top Navbar (Theme Toggle, Live Telemetry Status, Load File, Quick CSV)           │
├──────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Reports      │ 🚨 48-HOUR CRITICAL INVENTORY BURN ALERT PANEL                          │
│ Drawer Toggle│ • Station AY046: 28.5h Stock Left (12-Ton Tanker Required) -> Dispatch │
│              │ • Station MH012: 36.0h Stock Left (18-Ton Tanker Required) -> Dispatch │
│ ┌──────────┐ │─────────────────────────────────────────────────────────────────────────│
│ │ 🔍 Search│ │ 📊 MASTER DASHBOARD METRICS                                             │
│ │ EXECUTIVE│ │ • 30-Day Sales Run-Rate Curve                                           │
│ │ • Master │ │ • 3-Month Top Performers Trend Line Chart                               │
│ │ • Briefing│ │ • 3-Month Rolling Average Sales Drop Alerts (>20% Drop Threshold)       │
│ │OPERATIONS │ ├─────────────────────────────────────────────────────────────────────────┤
│ │ • Tanker │ │ 🔍 FULL SUITE ENHANCEMENT TABS                                           │
│ │ • RSP Gap│ │ • RSP Disparity Audit (State Price Variance)                            │
│ │ • FreeSale│ │ • Free Sale Leakage Tracker (Calibration >0.5%)                         │
│ │ • TM Team│ │ • TM Leaderboard & Commission Tracker                                   │
│ │ • Churn  │ │ • Commercial Fleet Churn Risk Predictor AI                             │
│ └──────────┘ │                                                                         │
└──────────────┴─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Architecture & Data Strategy

### System Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             EXECUTIVE TELEMETRY ENGINE                           │
│                      (SQLite / JSON Data Store - T-1 Lagged Data)                │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              APP STATE ROUTER (App.tsx)                          │
│        • Active Tab Routing  • Theme State (Light/Dark)  • Compact View Toggle    │
└────────┬───────────────────────────────┬────────────────────────────────┬────────┘
         │                               │                                │
         ▼                               ▼                                ▼
┌──────────────────┐           ┌──────────────────┐            ┌───────────────────┐
│  REPORTS SIDE    │           │  MASTER          │            │ FULL SUITE        │
│  DRAWER COMPONENT│           │  DASHBOARD       │            │ ENHANCEMENTS      │
│  (Drawer.tsx)    │           │  (Master.tsx)    │            │ (New Components)  │
└──────────────────┘           └────────┬─────────┘            └─────────┬─────────┘
                                        │                                │
                       ┌────────────────┴──────────────┐       ┌─────────┴─────────┐
                       │                               │       │                   │
                       ▼                               ▼       ▼                   ▼
             ┌──────────────────┐            ┌──────────────────┐ ┌────────────────┐ ┌────────────────┐
             │ 48-HOUR BURN     │            │ 3-MONTH SALES    │ │ RSP DISPARITY  │ │ FREE SALE      │
             │ PREDICTION PANEL │            │ DROP ALERTS (>20%)│ │ AUDIT PANEL    │ │ LEAKAGE AUDIT  │
             └──────────────────┘            └──────────────────┘ └────────────────┘ └────────────────┘
```

### New & Enhanced Components Mapping:
1. **`CriticalBurnPredictionAlert.tsx`** (*MasterDashboard integration*):
   - Calculates exact hours of fuel remaining: $\text{Hours Left} = (\text{Closing Dip Litres} / \text{Daily Burn Rate}) \times 24$.
   - Highlights stations where $\text{Hours Left} \le 48.0$.
   - Displays 48h countdown badge, recommended tanker size, and 1-click dispatch trigger.

2. **`ReportsSideDrawer.tsx`** (*Global Sidebar Drawer*):
   - Collapsible drawer triggered by a side toggle icon in the Top Bar.
   - Quick search input to filter 15+ dashboard report modules.
   - Unboxed category sections with report status counters.

3. **`RSPDisparityReport.tsx`** (*Report Module*):
   - Audits station pricing vs state nominal rates, flagging revenue loss per litre due to local price gaps.

4. **`FreeSaleLeakageAudit.tsx`** (*Report Module*):
   - Identifies stations exceeding the 0.5% Free Sale / Return Calibration threshold.

5. **`TMLeaderboard.tsx`** (*Report Module*):
   - Territory Manager performance scoring based on total volume, zero-sale recovery, and collection efficiency.

6. **`CustomerChurnPredictor.tsx`** (*Report Module*):
   - Predicts commercial fleet churn by analyzing consecutive multi-day volume declines.

---

## 4. Verification & Quality Plan

1. **Build & Type Check**:
   - Execute `compile_applet` and `lint_applet` together to verify 0 errors.
2. **Theme & Density Verification**:
   - Verify all new panels render with crisp contrast in both Light Mode (default) and Dark Mode.
   - Ensure Compact View toggle dynamically adjusts table row padding across all new components.
3. **Data Integrity Check**:
   - Confirm burn rate calculations accurately reflect T-1 lagged telemetry metrics.
