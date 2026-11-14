# GO Gas Analytical Dashboard — Complete Guide

> **Current product behavior:** this older guide includes planned reports and
> controls that are not implemented. Use [UI_GUIDE.md](./UI_GUIDE.md) for the
> current screens, filter behavior, and distinction between interactive views
> and planned specifications.

## Purpose of This Dashboard
This dashboard turns daily station-level sales data into actionable insights. It answers:
- How much did we sell? (Total, by state, by station, by type)
- How much money did we collect? (Collection vs RSP, gaps, free sale)
- Where are the problems? (Zero-sale stations, declining trends, low collection)
- What will happen next? (7-day forecast with confidence bands)
- What should we do? (AI-generated recommendations and alerts)

---

## Report-by-Report Explanation

### 📊 Report 1: Ad-hoc Report
**What it shows:** A flexible raw data table where you can group and filter any way you want.
**Why it's useful:** When someone asks "give me the data for Tamil Nadu last week by station", this is where you go. It's the raw explorer.
**Who uses it:** Data analysts, anyone needing custom cuts of data.

### 🏠 Report 2: Master Dashboard (Home)
**What it shows:** The executive overview — KPI cards (total sale, collection, free sale, active stations), daily trend chart, top/bottom 5 stations, key insights, critical alerts, and a health score.
**Why it's useful:** This is the "10-second snapshot" for management. You open it and immediately know if things are good or bad.
**Who uses it:** CMD, MD, State Heads — anyone who needs the big picture fast.
**Key features:**
- **KPI Cards:** Total sale (L), collection (₹), free sale (L), active stations
- **Daily Trend Chart:** Shows day-by-day sale pattern — spot drops instantly
- **Top 5 / Bottom 5 Stations:** Best and worst performers at a glance
- **Critical Alerts:** Red cards for items needing immediate action
- **Health Score:** A 0-100 score summarizing overall performance
- **Drill-down:** Click any station name to jump to its detail page

### 📈 Report 3: RSP (Rate Selling Price) Analysis
**What it shows:** Sale price per litre by station/state, comparing actual RSP vs effective RSP.
**Why it's useful:** Shows whether stations are selling at the right price. If effective RSP < actual RSP, there are discounts or free sales eating into revenue.

### 📅 Report 4: Previous vs Latest Day
**What it shows:** Side-by-side comparison of yesterday vs today (or any two periods) for every station.
**Why it's useful:** Instantly spot which stations improved and which declined day-over-day. Good for daily morning reviews.

### 📉 Report 5: Daily Trend
**What it shows:** A line chart of total daily sales over the selected period.
**Why it's useful:** See the trend — is it going up, down, or flat? Spot weekly patterns (weekend dips/spikes). Identify anomalous days.

### 📆 Report 6: Weekly Analysis
**What it shows:** Week-by-week breakdown (Mon-Sun) of sales, collection, and station counts.
**Why it's useful:** Compare this week vs last week vs the week before. Weekly trends are more stable than daily — good for tracking progress.

### 🔄 Report 7: Month-on-Month (MoM)
**What it shows:** Monthly comparison with absolute and percentage deltas.
**Why it's useful:** "August sold 12.4M L, September sold 11.8M L — that's -4.8%." Shows whether the business is growing or shrinking month over month. Also shows collection trends and average per day.

### 📋 Report 8: CMD MIS Report
**What it shows:** A state-wise summary table designed for management reporting — sale, collection, free sale, RSP, stations, and averages per state.
**Why it's useful:** This is the report you print/email to the CMD every morning. It's formatted for executive consumption — one table, all states, key metrics.
**Who uses it:** CMD, MD, National Head.

### 📊 Report 9: Averages
**What it shows:** Average sale per day and average per station by state.
**Why it's useful:** Normalizes for number of days and stations. A state with 50 stations selling 100K L/day is performing differently than a state with 10 stations selling the same. Averages reveal true efficiency.

### 🔍 Report 10: Sales Analysis
**What it shows:** Bar chart + table grouping sales by state, coordinator, TM, or station type. Choose the measure (sale, collection, free sale, paytm).
**Why it's useful:** Answers "which state/coordinator/type contributes the most?" and "what's the concentration?" (top 3 states = X% of total). Includes auto-generated insights and concentration analysis.

### ⛽ Report 11: Station-wise Detail
**What it shows:** Every station with full metrics — sale, collection, free sale, RSP, efficiency, days active.
**Why it's useful:** The granular station-level view. Sort by any column to find specific stations. Good for station managers reviewing their own performance.

### 🖥️ Report 12: Dispenser-wise
**What it shows:** Dispenser-level breakdown within stations.
**Why it's useful:** Identifies which dispensers (pumps) are over/under-performing within a station. Helps with equipment and staffing decisions.

### 👥 Report 13: Team-wise (TM/Coordinator)
**What it shows:** Sales grouped by Territory Manager and Coordinator.
**Why it's useful:** Performance evaluation for the sales team. Shows which TMs are delivering and which need support. Good for monthly performance reviews.

### 🎯 Report 14: Targets vs Achievement
**What it shows:** Target vs actual achievement by state/station.
**Why it's useful:** Are we hitting our goals? Shows gap to target and achievement percentage. Drives accountability.

### 🏬 Report 15: Station Targets
**What it shows:** Individual station targets vs actuals.
**Why it's useful:** Station-level accountability. Which stations are missing targets and by how much.

### 🗺️ Report 16: Sub-state Mapping
**What it shows:** Station mapping within states (districts/regions).
**Why it's useful:** Geographic distribution of stations within a state. Identifies coverage gaps.

### 📅 Report 17: Week 1/2/3 Analysis
**What it shows:** Breaks each month into weeks (Week 1, Week 2, Week 3, Week 4/5) and compares.
**Why it's useful:** Shows intra-month patterns. Is the month front-loaded (Week 1 strong) or back-loaded? Helps with cash flow planning.

### 🎆 Report 18: Weekend Analysis
**What it shows:** Compares weekday vs weekend sales averages.
**Why it's useful:** Highway stations may see different weekend patterns vs city stations. Helps with staffing and inventory planning.

### 📆 Report 19: Quarterly Analysis
**What it shows:** Quarter-by-quarter (Q1, Q2, Q3, Q4) totals.
**Why it's useful:** Long-term trend analysis. Seasonal patterns (festive quarters vs lean quarters). Good for annual planning.

### 📊 Report 20: Month-wise Stations
**What it shows:** Per-month: total sale, collection, active stations, days loaded, average per station.
**Why it's useful:** Tracks network growth (more stations = more sale) and data completeness (days loaded).

### 🛢️ Report 21: Five Types (LOCO/JODO/DODO etc.)
**What it shows:** Sales by station type (LOCO, JODO, DODO, and other categories).
**Why it's useful:** Which station type generates the most revenue? Which type has the best collection efficiency? Helps with expansion strategy (which type of station to build next).

### 🏁 Report 22: Competitor Analysis
**What it shows:** Performance near competitor locations.
**Why it's useful:** Are we losing market share near competitors? Where should we focus competitive response?

### 🤖 Report 23: AIML Forecast (7-Day Prediction)
**What it shows:** 7-day sales forecast using 10 machine learning models (Linear Regression, Holt-Winters, KNN, Random Forest, XGBoost, ARIMA, Prophet, LSTM, VAR, DeepAR). Shows predicted values with confidence bands (upper/lower limits).
**Why it's useful:** Predicts tomorrow's sales so you can plan inventory, staffing, and supply. The confidence band shows the realistic range (not just a single number).
**Key features:**
- **Ensemble prediction:** Combines all 10 models weighted by accuracy
- **Confidence bands:** Shows best/worst case scenarios based on actual backtest error
- **Backtest accuracy:** Shows MAPE (error %) for each model — you know exactly how accurate the prediction is
- **Gap detection:** Automatically detects and handles missing data gaps
- **Data gap warning:** Shows yellow notice if data gaps are detected

### 🧪 Report 24: Data Analysis + What-If Simulator
**What it shows:** Deep statistical analysis — distribution, outliers, correlations, station-level analysis, plus an interactive What-If Simulator.
**Why it's useful:**
- **Statistical analysis:** Understand the shape of your data (normal distribution? skewed? outliers?)
- **What-If Simulator:** Drag sliders to see revenue impact of operational changes:
  - "What if we reduce free sale by 50%?" → see projected collection gain
  - "What if 5 zero-sale stations reopen?" → see projected sale increase
  - "What if collection efficiency improves by 20%?" → see revenue recovery
  - "What if demand grows 10%?" → see total impact
- **Preset scenarios:** One-click Optimistic / Moderate / Conservative scenarios

### 🔥 Report 25: Station Performance Heatmap
**What it shows:** A color grid — stations (rows) × days (columns) — with colors from red (zero sales) to green (high sales).
**Why it's useful:** Instantly spot patterns — which stations are consistently red? Which days were universally bad? The heatmap reveals problems that tables can't show.
**How to use:** Use the scroll bars (right side = stations, bottom = dates) to zoom and pan. Mouse wheel to zoom inside the chart.

### 🗺️ Report 26: Collection Efficiency Map
**What it shows:** Bar chart + table of collection efficiency by state, with status indicators (Good/Warning/Critical).
**Why it's useful:** Shows which states are collecting money well and which are leaving revenue on the table. "Revenue at Risk" = money we're not collecting. Red states need immediate attention.

### 🏆 Report 27: Station Ranking with Trends
**What it shows:** Leaderboard of all stations ranked by total sale, with trend arrows (↑ improving, ↓ declining, — flat).
**Why it's useful:**
- **Top 10:** Recognize and reward best performers
- **Bottom 10:** Identify stations needing intervention
- **Declining stations:** Red-flag list of stations trending down — act before they hit zero
- **Trend arrows:** Each station shows its daily slope (L/day change) — is it getting better or worse?

### 📰 Report 28: Daily Briefing (Morning Executive Summary)
**What it shows:** A one-page automated morning briefing — yesterday's snapshot, today's forecast, action items, stock-out warnings, zero-sale stations, declining stations, top performers, state summary, and a ready-to-copy WhatsApp/email format.
**Why it's useful:** This is THE report you open every morning. It gives you everything you need in 30 seconds — what happened, what's at risk, and what to do about it.
**Who uses it:** Everyone from CMD to TM — it's the daily starting point.
**Key features:**
- **Yesterday's Snapshot:** Sale vs 7-day average (↑/↓), collection efficiency, free sale, zero-sale count
- **Today's Action Items:** Auto-prioritized (HIGH/MEDIUM/LOW) based on data analysis
- **Today's Forecast:** AI prediction with range, confidence, and 7-day total
- **Stock-Out Warnings:** Stations with <3 days of stock remaining, with estimated stock-out date
- **Zero-Sale Stations:** List of stations with 0 sales + remarks (reasons)
- **Declining Stations:** Stations with 3+ consecutive days of decline — act before they hit zero
- **Top 10 Performers:** Highest-selling stations yesterday
- **State Summary:** Per-state breakdown of sale, collection, efficiency, zero-sale count
- **WhatsApp/Email Format:** Ready-to-copy text you can paste directly into WhatsApp or email

---

## Dashboard Features (Applies to All Reports)

### 🔍 Filter Bar
- **Time period:** Today, 7 days, 30 days, this month, custom range
- **State, Coordinator, TM, Station Type:** Drill down to any level
- **Station search:** Find a specific station by name
- **Compare mode:** Toggle to compare two periods side-by-side (Master dashboard)
- **Filter Presets:** Save common filter combos (💾 Save button) and apply with one click

### 📤 Export Options
Every report has three export buttons:
- **CSV:** Raw data for Excel analysis
- **Excel (.xlsx):** Formatted spreadsheet with colored headers, auto-width columns, frozen header row
- **PDF:** Print-optimized view — opens print dialog to save as PDF

### 🌙 Dark Mode
Click the moon/sun icon (top-right of sidebar) to toggle dark/light theme. Your choice is saved automatically.

### 🔎 Report Search
Type in the search box at the top of the sidebar to instantly filter reports by name. No more scrolling through 27 reports.

### 📊 Data Gap Warning
If there are missing days in your selected date range, a red warning banner appears at the top showing exactly which dates are missing and how many days.

### ⏳ Loading Indicators
When switching reports or applying filters, a loading spinner appears so you know data is being fetched.

---

## How to Explain This to Your Boss (30-Second Pitch)

> "This dashboard takes our daily station sales data and turns it into decisions.
>
> **Report 2 (Master Dashboard)** gives you the 10-second snapshot — are we on track today?
>
> **Report 8 (CMD MIS)** is the one-page state-wise summary you can review every morning.
>
> **Report 23 (Forecast)** predicts next week's sales using 10 AI models — so we can plan supply and staffing.
>
> **Report 27 (Ranking)** shows which stations are improving and which are declining — so we know where to focus.
>
> **Report 26 (Collection Map)** shows which states are leaving money on the table — so we know where to tighten collection.
>
> Every report exports to Excel or PDF with one click."

---

## How to Explain This to Your Sales Team

> "This dashboard shows your performance in real-time.
>
> **Report 11 (Station-wise)** shows your station's sale, collection, and efficiency.
>
> **Report 13 (Team-wise)** shows how your territory compares to others.
>
> **Report 27 (Ranking)** shows where you rank — and whether you're trending up or down.
>
> **Report 14 (Targets)** shows whether you're hitting your goals.
>
> The numbers update every day when new data is loaded. If you're declining, it shows up as a red ↓ arrow. If you're improving, it's a green ↑ arrow.
>
> Use the filter bar to select your state or TM name and see only your stations."

---

## Technical Notes

- **Data source:** PostgreSQL database, updated daily from Excel uploads
- **Forecasting:** 10 ML models (ensemble), backtested for accuracy (current MAPE: ~7.7%)
- **Confidence bands:** Based on actual backtest RMSE — the bands are honest, not guessed
- **Gap handling:** The forecast automatically detects missing data and uses only the latest continuous block
- **Performance:** Most reports load in <1 second; Report 24 (Data Analysis) may take 10-30 seconds for large date ranges
