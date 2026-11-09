# GO Gas Executive Suite — Master Knowledge Brain (`brain.md`)

## 1. Executive Overview & Product Genesis

The **GO Gas Executive Suite** is an enterprise-grade operational intelligence, automated supply chain dispatch, and predictive analytics platform engineered specifically for **Auto LPG Dispensing Stations (ALDS)** networks across India.

### 1.1 The Industry Context: Auto LPG (ALDS) Operations
Auto LPG (Liquefied Petroleum Gas) is an eco-friendly, high-octane automotive fuel dispensed under pressure (typically 7–12 bar) across licensed retail fuel stations. In high-volume commercial corridors and urban metropolitan clusters, ALDS stations serve fleets of auto-rickshaws, commercial taxis, and light commercial vehicles (LCVs).

Operating an extensive retail network (316+ stations across states including Maharashtra, Gujarat, Madhya Pradesh, Karnataka, Tamil Nadu, Andhra Pradesh, Telangana, Uttar Pradesh, and Rajasthan) introduces complex operational challenges:
1. **Perishable Daily Revenue & Cash Velocity**: Stations handle substantial daily cash and digital collections. Discrepancies between physical pump readings, dispenser rates, and ERP credit balances can create significant revenue leakage if unmonitored.
2. **Volatile Local Pricing (RSP Disparity)**: Retail Selling Prices (RSP) fluctuate across municipal tax boundaries, state VAT structures, and regional depot transportation differentials. Inconsistencies between the nominal rate set at head office and the actual realized rate at dispensing nozzles lead to collection deficits.
3. **Supply Chain Lead Times & Tanker Logistics**: Auto LPG must be transported from major refinery terminals (e.g., BPCL, IOCL, HPCL, or private import terminals) via specialized pressurized road tankers (12 KL, 18 KL, and 20 KL capacities). If a station's underground bullet tank drops below safe pump suction levels (the critical closing dip), dispensing stops, leading to immediate dry-outs, customer churn, and thousands of rupees in lost margin per hour.
4. **Free Sale / Testing Leakage**: During periodic dispenser nozzle calibrations and weights & measures inspections, LPG is dispensed into testing vessels. If not rigorously cross-tallied against cash and ERP reconciliations, untracked "free sale" becomes a major source of shrinkage.
5. **Operational Latency**: Traditionally, network status was trapped in cumbersome daily spreadsheets manually submitted by territory managers, taking until late evening to compile.

### 1.2 The Solution
The GO Gas Executive Suite replaces manual compilation with an automated, real-time command center:
- **Instant PostgreSQL Telemetry**: Ingests, normalizes, and aggregates daily operational data across all 316 stations in milliseconds.
- **Walk-Forward AI/ML Forecasting Engine**: Generates 7-day and 30-day demand predictions using a 10-model ensemble with dynamic error feedback loops that learn from historical prediction misses.
- **Automated Tanker Dispatch Optimizer**: Evaluates current tank dip levels, daily burn rates, safety buffer days, and supplier lead times to prioritize urgent tanker dispatches with optimized compartment sizing.
- **Zero-Cost Multi-Channel Automated Dispatches**:
  - **11:00 AM & 7:00 PM Automated Executive Email Briefing**: Dispatches high-fidelity HTML and text summaries to CMD, Managing Directors, and State Heads via secure Gmail SMTP with zero external SaaS fees.
  - **11:00 AM & 7:00 PM Automated WhatsApp Automation Center**: Integrates headless WhatsApp Web pairing with real-time Socket.IO QR streaming, delivering instantaneous dispatch manifests and flash reports straight to executives' smartphones with one-click triggers or scheduled daily cron.
- **Resilient Offline Architecture**: Features a PostgreSQL connection health monitor with color-coded navigation bar stripes, interactive diagnostics modals, and graceful client-side fallbacks.

---

## 2. Domain Glossary & Key Performance Indicators (KPIs)

| Metric / Term | Technical Definition | Operational Significance |
| :--- | :--- | :--- |
| **ALDS** | Auto LPG Dispensing Station | Specialized retail outlet equipped with underground pressure vessel (bullet), submergible LPG pump, and dispenser nozzles. |
| **ERP Code / Cost Code** | Unique alphanumeric station identifier (e.g., `MUM001`, `PUN042`) | Immutable key used across database tables, Excel sheets, and billing ledgers to uniquely identify each retail outlet. |
| **Station Type** | Station operating model: **LOCO** (Company-Owned Company-Operated), **CODO** (Company-Owned Dealer-Operated), or **DODO** (Dealer-Owned Dealer-Operated) | Defines capital expenditure, operational margin splits, and collection responsibilities. |
| **Closing Dip (in Litres)** | Physical fuel volume remaining in the station's underground storage tank at the end of the operating day | Used to calculate days-of-stock remaining and trigger automated tanker refills. |
| **Daily Burn Rate (L/day)** | Average daily volume dispensed over the preceding 7–14 operating days | Baseline consumption velocity used to predict the exact hour of stock depletion. |
| **Buffer Days / Days Left** | $\text{Closing Dip} \div \text{Daily Burn Rate}$ | Operational countdown until station reaches dry-out. Any station with $<3.0$ days is flagged as **Critical Stockout Risk**. |
| **Nominal RSP (₹/L)** | Official Retail Selling Price authorized by corporate pricing desk | Benchmark price expected to be programmed at the station dispenser nozzle. |
| **Realized / Effective RSP (₹/L)** | $\text{Gross Collections} \div \text{Total Volume Sold}$ | Actual cash/digital revenue recovered per litre dispensed. If $\text{Effective RSP} < \text{Nominal RSP}$, a collection gap exists. |
| **Collection Gap (₹/L)** | $\text{Nominal RSP} - \text{Effective RSP}$ | Identifies cash leakage, unbilled volume, unauthorized discounting, or faulty dispenser price programming. |
| **Free Sale (Litres & ₹)** | Volume dispensed for nozzle calibration, return testing, or quality verification | Must balance against net cash collection; untracked free sale indicates meter tampering or fuel shrinkage. |
| **Zero-Sale Station** | Station that reported $0$ litres of sales during an active operating date | Indicates power failure, mechanical breakdown, dry-out, operator strike, or local regulatory seal. Requires immediate TM intervention. |
| **Ensemble Forecast** | Weighted combination of 10 statistical and machine learning models | Provides variance-resistant future demand forecasts evaluated via rolling walk-forward backtesting. |

---

## 3. Core Subsystems & Deep Architecture

```
                       ┌────────────────────────────────────────┐
                       │        Daily Excel Sales Sheets        │
                       │     (Manual Work/sale.xlsx or UI)      │
                       └───────────────────┬────────────────────┘
                                           │
                        [Transaction-Safe ETL Validation]
                                           ▼
                       ┌────────────────────────────────────────┐
                       │          PostgreSQL Database           │
                       │   • sale_tracker (Partitioned/Indexed) │
                       │   • state_map (State Normalization)    │
                       │   • forecast_feedback (Learning Loop)  │
                       └───────────────────┬────────────────────┘
                                           │
                      [Pooled Connection: bot_reader & bot_loader]
                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │                      Node.js / Express Intelligence Engine (server.ts)              │
 │                                                                                     │
 │  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────┐  │
 │  │   AI/ML Forecasting   │ │ Logistics & Refills   │ │ Revenue Leakage Audit     │  │
 │  │   10-Model Ensemble   │ │ Tanker Optimizer      │ │ RSP & Free Sale Tracking  │  │
 │  │   Walk-Forward Val    │ │ 12KL/18KL/20KL Sizing │ │ Collection Gap Detection  │  │
 │  └───────────────────────┘ └───────────────────────┘ └───────────────────────────┘  │
 │                                                                                     │
 │  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────┐  │
 │  │  Automated Email Svc  │ │  WhatsApp Automation  │ │ DB Health Telemetry       │  │
 │  │  Gmail SMTP (11AM/7PM)│ │  Socket.IO + Webhook  │ │ Real-Time Heartbeat       │  │
 │  │  Zero Cost Briefings  │ │  Cron 11AM/7PM + Live │ │ 503 Resilient Fallbacks   │  │
 │  └───────────────────────┘ └───────────────────────┘ └───────────────────────────┘  │
 └─────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │
                              [HTTP / REST / WebSockets]
                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │                         React 19 Executive UI Dashboard                             │
 │                                                                                     │
 │  • Navbar with Live PostgreSQL Health Stripe & Quick Diagnostics Badge              │
 │  • Master Executive Overview (Volume, Revenue, Active Stations, Burn Rates)         │
 │  • AI/ML Demand Forecast Studio (Horizon Slider, Backtest Metrics, Error History)   │
 │  • Logistics Command (Tanker Dispatch Manifest, Critical Stockout Countdown)        │
 │  • WhatsApp Automation Center Modal (Live QR Scan, Session Health, One-Click Send)  │
 │  • Revenue Leakage & Free Sale Audit Drawer                                         │
 │  • Territory Manager (TM) Performance Leaderboard                                   │
 │  • State & Geo-Corridor Heatmap Analysis                                            │
 │  • What-If Pricing & Margin Simulation Sandbox                                      │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. In-Depth Operational Modules

### 4.1 Data Ingestion & Transactional Integrity (`load_sales.ts`)
- **Format Agnostic**: Accepts modern `.xlsx` workbooks via strict streaming parsers (`excel.ts`) that resolve formula cells, formatted strings, and Excel date numbers (offset 25569).
- **Strict Header Normalization**: Matches variable column aliases (`Cost Code`, `ERP Code`, `Code`, `ALDS Name`, `SALE QTY`, `COLLECTION`, `CLOSING DIP IN LTR`).
- **Validation Pipeline**:
  - Rejects empty sheets or sheets missing required primary keys.
  - Detects and rejects duplicate Cost Codes within the same file.
  - Enforces date consistency (ensures all rows represent a single operating date).
  - Validates numeric boundaries for quantities, collections, and dips.
- **Atomic Database Commit**: Ingests all stations in a single PostgreSQL transaction (`BEGIN ... COMMIT`). If a single row violates a database constraint, it rolls back cleanly (`ROLLBACK`), preventing partial imports.
- **Duplicate Protection**: Before insertion, queries `SELECT COUNT(*) FROM sale_tracker WHERE sale_date = $1`. If the date already exists, it warns the user and skips re-insertion to protect historical records.

### 4.2 The 10-Model Walk-Forward Forecasting Engine (`forecasting.ts`)
Standard commercial forecasting libraries often overfit or leak future data into training windows. The GO Gas engine runs an isolated walk-forward cross-validation suite:
1. **Model Suite**:
   - **Ensemble (Primary)**: Adaptive dynamic weighting of component models based on historical Mean Absolute Percentage Error (MAPE).
   - **Holt-Winters Exponential Smoothing**: Captures level, trend, and seasonal additive factors.
   - **Gradient Boosting (Quantile Loss)**: Tree-based non-linear regression using engineered lagged features, rolling moving averages (3-day, 7-day, 14-day), and day-of-week one-hot flags.
   - **Linear Trend Regression**: Ordinary Least Squares fit over baseline trend.
   - **Weekday Seasonality**: Day-of-week mean ratio multiplier applied to baseline volume.
   - **7-Day Rolling Moving Average**: Smoothed trend dampener.
   - **14-Day Rolling Moving Average**: Long-cycle trend reference.
   - **Exponential Moving Average (EMA)**: Recency-weighted smoothing ($\alpha = 0.35$).
   - **Naive (Prior Day Carryover)**: Benchmark baseline.
   - **Historical Day-of-Week Specific**: Averages identical weekdays across prior weeks.
2. **Dynamic Feedback Loop (`forecast_feedback` table)**:
   - Persists actual vs predicted outcomes.
   - Computes bias metrics: If recent history demonstrates persistent overprediction for 7-day horizons, the engine applies an automatic damping factor ($\beta$) to suppress optimism bias.
   - Stores user feedback overrides and manual adjustments with full attribution.

### 4.3 Supply Chain & Tanker Dispatch Engine (`tanker.ts`)
- **Stockout Countdown**: Calculates hours and days remaining before each station reaches minimum dispenser suction pressure.
- **Refill Logic**:
  $$\text{Deficit} = (\text{Tank Capacity} \times \text{Safety Buffer Ratio}) - \text{Current Closing Dip}$$
- **Compartment Sizing Optimizer**:
  - Matches the deficit against fleet tanker capacities:
    - `12 KL` (Single small station refill or mountain terrain route).
    - `18 KL` (Standard highway station single delivery).
    - `20 KL` (High-throughput urban hub delivery).
  - If deficit exceeds 20 KL, splits into multiple prioritized tanker dispatches.
- **Dispatch Priority Scoring**: Prioritizes stations with $<1.5$ days buffer as **Urgent / High Priority**, ensuring supply chain dispatchers never miss an impending stockout.

### 4.4 Automated Communications & Notification Services

#### A. Zero-Cost 11:00 AM & 7:00 PM Executive Email Briefing (`emailReport.ts` & `send_morning_mail.cjs`)
- Uses direct Gmail SMTP via secure TLS/SSL on port 465.
- Uses Google App Passwords, eliminating costly third-party transactional email subscriptions (SendGrid, Mailgun, AWS SES).
- Formats executive-grade responsive HTML tables with key sales volume, gross collections, effective RSP, 7-day forecast outlook, and prioritized critical stockout tables.
- Dispatched via automated daily cron or command-line one-shot trigger (`node send_morning_mail.cjs`).

#### B. WhatsApp Automation Center (`whatsappAutomation.ts` & `whatsappService.ts`)
- Features a headless WhatsApp Web automation backend.
- Pairs with the executive's mobile device by streaming a dynamic QR code over Socket.IO WebSockets to the React frontend.
- Once paired, session tokens persist in the backend (`whatsapp-session`).
- Executes scheduled 11:00 AM and 7:00 PM cron dispatches of executive flash updates and tanker dispatch manifests.
- Provides instantaneous on-demand "Broadcast Now" button triggers directly from the UI.
- Validates Indian mobile numbers (stripping non-digits, ensuring country code prefix `91`).

### 4.5 Resilient PostgreSQL Telemetry Architecture
- **Dual Connection Pool**:
  - `bot_reader`: Read-only queries with strict 15-second statement timeouts to ensure web dashboard requests cannot lock tables.
  - `bot_loader`: Write-enabled user scoped to single-transaction ETL operations.
- **Health Evaluation Engine (`dbHealth.ts`)**:
  - Classifies connection states:
    - `healthy`: Host reachable, queries execute, `sale_tracker` has rows, no date discrepancies.
    - `warning`: Host reachable, but table has zero rows or mismatch in reporting counts.
    - `error`: PostgreSQL service stopped (`ECONNREFUSED`), authentication failed, or database missing.
    - `checking`: Initial probing or re-verifying state.
- **Graceful UI Fallback**:
  - If PostgreSQL is offline, `/api/telemetry` responds with HTTP 503 and clear troubleshooting advice.
  - The Navbar displays a top health stripe (Red for error, Amber for warning, Emerald for healthy).
  - Clicking the badge opens the **Database Inspector Modal** with copyable Windows commands (`net start postgresql-x64-16`, service restart instructions, and `.env` credentials verification).

---

## 5. Security & Deployment Model

1. **Local Privacy First**: Operational sales numbers, tanker locations, and financial collections stay entirely on internal enterprise infrastructure.
2. **Credential Decoupling**: Sensitive credentials (`SMTP_PASS`, `BOT_LOADER_PASSWORD`, `BOT_READER_PASSWORD`) reside exclusively in `.env` and are never exposed to the client bundle.
3. **API Proxy Layer**: The React Vite frontend communicates with `/api/*` endpoints handled by the Express server. The client never attempts direct TCP connections to PostgreSQL or SMTP servers.
4. **Zero AI Slop / Anti-Hallucination Policy**: Every single chart, table, metric, and percentage is derived deterministically from PostgreSQL rows or verified mathematical algorithms. Zero mock data is generated or presented.
