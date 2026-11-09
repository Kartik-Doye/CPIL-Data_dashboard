# Product Requirements Document (PRD) — GO Gas Executive Suite

**Document Version:** 2.4.0  
**Status:** Approved & Implemented  
**Target Audience:** Engineering, Product Leadership, Operations, Logistics, Executive Management  
**Product Category:** Fuel Retail Enterprise Telemetry & Supply Chain Intelligence  

---

## 1. Executive Summary & Product Vision

### 1.1 Vision Statement
To provide executive leadership, state operations directors, and logistics dispatchers of GO Gas with an authoritative, real-time command center that eliminates manual spreadsheet reporting, optimizes multi-crore Auto LPG supply chain decisions, halts revenue leakage, and automates daily executive briefings across email and WhatsApp at zero external SaaS cost.

### 1.2 Core Value Propositions
1. **Unified Operational Truth**: Consolidates daily telemetry across 316+ Auto LPG Dispensing Stations (ALDS) into a single PostgreSQL-backed dashboard with sub-second responsiveness.
2. **Predictive Supply Chain Dispatch**: Eliminates costly station dry-outs through 7-day and 30-day demand forecasts powered by an adaptive 10-model walk-forward ML ensemble.
3. **Revenue Protection**: Audits nozzle-level price disparities (Nominal RSP vs Realized RSP) and unbilled "free sale" calibration losses to protect company EBITDA.
4. **Autonomous Communication**: Executes 11:00 AM and 7:00 PM WhatsApp dispatches and executive email briefings autonomously, delivering critical KPIs directly to mobile devices without manual intervention.
5. **Operational Resilience**: Proactively monitors local PostgreSQL database health and provides fail-soft diagnostic tooling directly within the executive user interface.

---

## 2. Target Personas & Stakeholder Matrix

| Persona | Role & Responsibilities | Key Pain Points | Primary Product Features Used |
| :--- | :--- | :--- | :--- |
| **P-1: CMD / Managing Director** | Corporate strategy, P&L stewardship, capital allocation across 316 retail outlets. | Late evening reports, unverified revenue figures, inability to spot state-level demand shifts. | Master Dashboard, Daily Executive Email Briefing, WhatsApp Flash Report, What-If Simulator. |
| **P-2: Head of Operations (VP/GM)** | Network sales targets, station uptime, zero-sale station remediation. | Dormant stations going unnoticed for days, territory manager accountability gaps. | Zero-Sale Audit Drawer, TM Leaderboard, State Analysis, Critical Burn Prediction Alert. |
| **P-3: Supply Chain & Logistics Head** | Refinery terminal allocations, road tanker dispatch planning (12 KL, 18 KL, 20 KL). | Stations running dry, emergency tanker diversions, inefficient partial refills. | Tanker Dispatch Manifest, Stockout Risk Countdown, Buffer Days Heatmap. |
| **P-4: Pricing & Finance Controller** | Margin realization, cash collection reconciliation, nozzle price programming. | Station-level discounting, collection deficits, untracked free-sale calibration fuel. | RSP Disparity Report, Free Sale Leakage Audit, Net Cash Collection Tracker. |
| **P-5: Territory Manager (TM)** | Field station support, dealer relations, daily Excel sales submission. | Tedious reporting, lack of clear visibility into peer benchmark rankings. | Station Directory, TM Performance Scorecard, Ad-Hoc Explorer. |

---

## 3. Product Scope & Functional Requirements

### 3.1 FR-1: High-Integrity Sales & Telemetry Ingestion (ETL)
- **FR-1.1**: Support ingestion of daily sales data from standardized `.xlsx` workbooks via both automated CLI (`npm run load-sales`) and interactive UI upload drawer.
- **FR-1.2**: Provide strict validation of required columns: Cost Code (ERP Code), Station Name, State, TM, Sale Quantity, Collections, Rates, and Closing Dip.
- **FR-1.3**: Detect and prevent duplicate primary keys (Cost Codes) within the same file.
- **FR-1.4**: Enforce single-date integrity per file (reject multi-date files to preserve operational cutoffs).
- **FR-1.5**: Execute inserts inside an atomic database transaction (`BEGIN ... COMMIT`) to guarantee all-or-nothing persistence.
- **FR-1.6**: Prevent accidental double-loading of existing dates with clear skip warnings.

### 3.2 FR-2: Real-Time Executive Master Dashboard
- **FR-2.1**: Display primary operational KPIs:
  - Total Daily Volume Sold (Litres) with day-over-day trend indicators.
  - Gross Daily Collections (₹ and ₹ Lakh/Crore formatting).
  - Effective Realized RSP (₹/L) vs Corporate Average Nominal RSP.
  - Active Reporting Stations count vs Total Station Network count.
  - Zero-Sale Station count and flagged critical stockouts.
- **FR-2.2**: Render interactive daily volume and revenue trend charts over rolling 30-day, 60-day, and 90-day horizons.
- **FR-2.3**: Provide state-level breakdown cards with volume distribution, average collection, and active station percentages.

### 3.3 FR-3: Leak-Free AI/ML Demand Forecasting Engine
- **FR-3.1**: Compute 7-day and 30-day projected sales demand for the entire network and individual stations.
- **FR-3.2**: Execute a 10-model walk-forward cross-validation algorithm without look-ahead bias:
  1. Adaptive Weighted Ensemble
  2. Holt-Winters Triple Exponential Smoothing
  3. Gradient Boosting Regressor (Quantile / Huber Loss)
  4. Linear Trend OLS Regression
  5. Day-of-Week Seasonality Multiplier
  6. 7-Day Rolling Moving Average
  7. 14-Day Rolling Moving Average
  8. Exponential Moving Average ($\alpha = 0.35$)
  9. Naive Previous Day Benchmark
  10. Historical Weekday Matching
- **FR-3.3**: Evaluate and display historical walk-forward metrics: Mean Absolute Percentage Error (MAPE), Root Mean Square Error (RMSE), and Directional Accuracy.
- **FR-3.4**: Integrate dynamic bias correction: store actual outcomes in `forecast_feedback` and automatically damp overprediction optimism.

### 3.4 FR-4: Automated Supply Chain Logistics & Tanker Dispatch
- **FR-4.1**: Continuously compute days of fuel remaining for each station based on closing tank dip and rolling 7-day burn rate.
- **FR-4.2**: Categorize stations into risk tiers:
  - **Critical Stockout Risk**: $< 1.5$ days buffer (Immediate dispatch required).
  - **Warning Buffer**: $1.5$ to $3.0$ days buffer (Schedule refill within 24h).
  - **Healthy Buffer**: $> 3.0$ days buffer (Normal operations).
- **FR-4.3**: Calculate optimal refill quantities and match against standard tanker compartment capacities:
  - Small refill: `12 KL` tanker.
  - Standard highway refill: `18 KL` tanker.
  - High-throughput urban refill: `20 KL` tanker.
  - Deficit $> 20$ KL: Split into multiple sequential tanker orders.
- **FR-4.4**: Generate exportable Tanker Dispatch Manifest with station address, state, TM contact, and recommended tanker capacity.

### 3.5 FR-5: Revenue Leakage, RSP Disparity, and Free Sale Audit
- **FR-5.1**: Identify pricing discrepancies where dispenser nozzle rate differs from the ERP benchmark rate.
- **FR-5.2**: Calculate collection gaps ($\text{Nominal Collections} - \text{Actual Realized Collections}$) on station and state levels.
- **FR-5.3**: Track and audit all testing volume ("Free Sale Litres" and "Free Sale Rupees") used for dispenser calibration. Flag stations where free sale exceeds $0.25\%$ of total volume.
- **FR-5.4**: Reconcile cash, digital payments (Paytm/UPI), and corporate scheme deductions against reported net collections.

### 3.6 FR-6: Automated Zero-Cost Daily Morning Email Briefing
- **FR-6.1**: Dispatch an automated executive briefing daily at 11:00 AM and 07:00 PM via Gmail SMTP (port 465 SSL/TLS).
- **FR-6.2**: Deliver rich HTML and plain-text fallback content containing:
  - Executive KPI summary table.
  - Tomorrow's predicted volume and 7-day demand outlook.
  - Top 8 prioritized critical stockout stations with days-left countdown.
  - Zero-sale stations summary with TM attribution and remarks.
- **FR-6.3**: Support multi-recipient distribution (`REPORT_RECIPIENT_EMAILS` or `SMTP_TO`).
- **FR-6.4**: Support on-demand test dispatch via UI button and command line (`node send_morning_mail.cjs`).

### 3.7 FR-7: Real-Time WhatsApp Automation Center
- **FR-7.1**: Maintain an in-browser WhatsApp session monitor with real-time Socket.IO communication.
- **FR-7.2**: Render dynamic QR code for instant mobile pairing (`WhatsApp > Linked Devices > Link a Device`).
- **FR-7.3**: Disseminate 11:00 AM and 07:00 PM automated daily executive flash messages via scheduled Node-Cron.
- **FR-7.4**: Provide on-demand "Broadcast Now" button to send either:
  - **Executive Daily Flash**: Volume, revenue, realized RSP, and tomorrow's forecast.
  - **Tanker Dispatch Manifest**: Prioritized list of stations requiring urgent fuel replenishment.
- **FR-7.5**: Maintain an in-memory and persistent audit trail of dispatched WhatsApp messages with delivery timestamps.

### 3.8 FR-8: Database Health Probing & Fail-Soft Resilience
- **FR-8.1**: Navbar must render a continuous 3px top health stripe indicating PostgreSQL status:
  - Emerald Green: Healthy connection with verified data.
  - Amber Yellow: Warning (empty table or partial discrepancy).
  - Rose Red: Offline (PostgreSQL service stopped or authentication failure).
  - Blue: Probing / verifying.
- **FR-8.2**: Render an interactive health status badge in the Navbar that displays host, port, active database, and latency.
- **FR-8.3**: Clicking the badge opens the **Database Inspector Modal**, providing detailed error diagnostics and one-click copyable Windows service restart commands.
- **FR-8.4**: If the database returns 503, the UI must gracefully display diagnostic guidance without crashing.

---

## 4. Non-Functional Requirements (NFR)

### 4.1 Performance & Responsiveness
- **NFR-1.1**: Server API responses (`/api/telemetry`, `/api/forecast`, `/api/db-verify`) must complete in $< 150\text{ ms}$ under local execution.
- **NFR-1.2**: Client-side filtering, sorting, and search across all 316 stations must complete in $< 16\text{ ms}$ (maintaining 60 FPS UI transitions).
- **NFR-1.3**: In-memory caching layer must serve repetitive telemetry requests within $< 10\text{ ms}$ while invalidating upon new data loads.

### 4.2 Cost & Resource Efficiency
- **NFR-2.1 Zero SaaS Subscriptions**: Zero recurring cost for external email APIs (SendGrid/Mailgun) by utilizing native Gmail SMTP with Google App Passwords.
- **NFR-2.2 Zero WhatsApp API Fees**: Zero per-message billing by utilizing headless WhatsApp Web pairing with session caching.

### 4.3 Data Security & Confidentiality
- **NFR-3.1 Separation of Database Privileges**:
  - `bot_reader`: Strictly limited to `SELECT` queries with a 15-second statement timeout.
  - `bot_loader`: Scoped to transactional bulk loading operations.
- **NFR-3.2 Zero UI Secret Exposure**: Passwords, tokens, and credentials must never be passed to the React client bundle or displayed in raw UI inputs.

### 4.4 Reliability & Maintainability
- **NFR-4.1 Code Quality**: 100% TypeScript type safety across both frontend and backend modules with zero lint or compilation errors.
- **NFR-4.2 Automated Testing**: Comprehensive unit test suite covering forecasting mathematics, database health evaluators, tanker sizing logic, Excel parsing, and email/WhatsApp message builders.

---

## 5. Database Schema & Data Models

### 5.1 Table: `sale_tracker`
Primary relational repository for daily station sales, pricing, and dip readings.
```sql
CREATE TABLE IF NOT EXISTS sale_tracker (
  id SERIAL PRIMARY KEY,
  erp_code VARCHAR(32) NOT NULL,
  alds_name VARCHAR(128) NOT NULL,
  state VARCHAR(64) NOT NULL,
  tm VARCHAR(64) DEFAULT 'No TM',
  coordinator VARCHAR(64) DEFAULT 'Unassigned',
  type VARCHAR(32) DEFAULT 'LOCO',
  tank_cap VARCHAR(32),
  sale_qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  collection NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  new_rate NUMERIC(8, 2) DEFAULT 0.00,
  other NUMERIC(12, 2) DEFAULT 0.00,
  diff NUMERIC(12, 2) DEFAULT 0.00,
  erp_rate NUMERIC(8, 2) DEFAULT 0.00,
  ret_test_cal NUMERIC(12, 2) DEFAULT 0.00,
  free_sale_litres NUMERIC(12, 2) DEFAULT 0.00,
  free_sale_rupees NUMERIC(14, 2) DEFAULT 0.00,
  scheme NUMERIC(12, 2) DEFAULT 0.00,
  paytm NUMERIC(14, 2) DEFAULT 0.00,
  net_cash_collection NUMERIC(14, 2) DEFAULT 0.00,
  closing_dip_in_ltr NUMERIC(12, 2) DEFAULT 0.00,
  remark TEXT,
  sale_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_station_date UNIQUE (erp_code, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_sale_tracker_date ON sale_tracker (sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_tracker_state ON sale_tracker (state);
CREATE INDEX IF NOT EXISTS idx_sale_tracker_erp ON sale_tracker (erp_code);
```

### 5.2 Table: `state_map`
Normalizes raw state spelling variations into canonical state representations.
```sql
CREATE TABLE IF NOT EXISTS state_map (
  from_state VARCHAR(64) PRIMARY KEY,
  to_state VARCHAR(64) NOT NULL
);
```

### 5.3 Table: `forecast_feedback`
Persists actual operational outcomes against model predictions to fuel machine learning self-calibration.
```sql
CREATE TABLE IF NOT EXISTS forecast_feedback (
  id SERIAL PRIMARY KEY,
  forecast_date DATE NOT NULL,
  horizon_days INT NOT NULL,
  model_name VARCHAR(64) NOT NULL,
  predicted_qty NUMERIC(12, 2) NOT NULL,
  actual_qty NUMERIC(12, 2),
  error_qty NUMERIC(12, 2),
  error_pct NUMERIC(6, 2),
  feedback_notes TEXT,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```
