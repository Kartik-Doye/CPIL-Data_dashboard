# GO Gas Executive Suite — UI Guide

This guide describes the screens and controls currently exposed by the GO Gas
Analytical Dashboard. It is an operator's guide to what appears in the web app;
the catalog contains 14 interactive views and 18 planned report specifications.

## 1. Page layout

The application is a single-page dashboard. Its main areas are:

1. **Top bar** — product identity, active data date/source, database inspection,
   the reports-drawer button, theme, file loading, CSV export, and refresh.
2. **Report navigation** — 14 interactive report views and the report catalog.
3. **Station filter bar** — state, operating type, TM, text search, and compact
   view controls for the latest available day.
4. **Report content** — the selected dashboard or analysis view.
5. **Reports drawer and Report Catalog** — alternate navigation and the
   searchable catalog of 14 interactive views and 18 planned specifications.

The layout adapts to screen size. Wide tables may scroll horizontally on narrow
screens. Compact View reduces spacing in supported tables and panels.

## 2. Top bar

- **GO Gas Executive Suite branding** identifies the dashboard.
- **Active date and source/status** indicate the latest date represented by
  telemetry. The source is PostgreSQL; the dashboard does not serve fallback
  data.
- **Reports Navigation Drawer** opens the grouped report shortcut panel.
- **Database Inspector** opens a diagnostic view of the current UI data and
  database diagnostics. It shows connection status, source, active date,
  station count, sales volume, database row/date-range information, a UI-versus-
  database comparison, and sample database records when available.
- **Theme toggle** switches between light and dark appearance.
- Workbook loading is handled by the Manual Work loader, not the dashboard.
  Run `npm run load-sales` from the project root to validate and write workbook
  rows to PostgreSQL before they appear in reports.
- **Export CSV** downloads the current station dataset from the top bar. This
  is separate from report-specific exports, which may apply their own filters.
- **Refresh** requests fresh dashboard telemetry. It is disabled while a
  refresh is in progress.

## 3. Main navigation and screens

The primary navigation exposes 14 interactive report views plus the catalog.

The tab strip scrolls horizontally when needed. The **Search report module**
field filters tabs by their label or category, and badges highlight items such
as dispatch risk, the forecast, or the report count. The active tab is
highlighted.

### Master Dashboard

The network overview includes:

- **Daily Sales Volume** — litres sold, active/zero-sale station counts, and a
  compact lakh representation.
- **Net Collections** — collection amount, Paytm collection, and crore
  representation.
- **Realized Effective RSP** — realized collection per litre compared with the
  weighted ERP rate and the resulting per-litre gap.
- **Network Operational Health** — health score, free-sale litres, and
  stock-risk count.
- **Operational alerts** — low-inventory burn predictions, sales-drop alerts,
  and data/anomaly alerts, where applicable to the loaded data.
- **30-Day Network Sales Trend** — daily volume trajectory, peak, low, and
  current run-rate, with a shortcut to the forecast.
- **Replenishment Risk** — stations with low fuel coverage and their stock,
  burn rate, and days remaining, with a shortcut to Tanker Dispatch.
- **Top and bottom performers** — active stations ranked by sales.

### Morning Briefing

A management-ready snapshot with operational outcome, today's forecast,
priority interventions, and stock-out warnings. **Copy for WhatsApp / Email**
copies a formatted briefing to the clipboard.

### Tanker Dispatch

The replenishment planner lists stations needing supply, with urgency, station
and territory identifiers, closing dip, daily burn, days remaining, recommended
tanker, and operational remark. KPI cards summarize critical and warning
stations, dispatch orders, and required replenishment volume. Tabs filter all,
critical, and warning orders. Actions export a dispatch CSV or copy a
WhatsApp-ready manifest.

### AIML 7-Day Forecast

Shows the seven-day network demand forecast, cumulative volume, model backtest
MAPE, and model comparison cards for the ensemble, Holt-Winters, linear
regression, and naive baseline. The daily table includes predicted demand,
95% lower/upper bounds, component model predictions, day of week, and a visual
range band.

### What-If Simulator

Interactive scenario controls estimate daily collection, daily volume, and
annualized revenue expansion. Presets (Conservative, Moderate, Aggressive) and
reset are provided. The scenario levers include free-sale reduction,
zero-sale-station recovery, collection-efficiency improvement, and market
demand growth. These are scenario estimates, not changes written back to the
source database.

### Deep Statistics

The statistical diagnostic view presents throughput mean, median, standard
deviation, skewness, excess kurtosis, and interquartile range. It also shows
volume concentration/Gini measures, a Pearson correlation view for operational
fields, and station outlier information based on Tukey IQR fences.

### RSP & Collection Gap

Audits nominal ERP rate against realized/effective collection per litre. It
surfaces estimated revenue impact and station-level details such as state/TM,
rate, effective realization, per-litre gap, and daily deficit. A minimum-gap
cutoff control is available in this report.

### State MIS

Compares state/region performance with station counts, volume, average volume
per station, nominal RSP, and free-sale measures. Use it for a regional
summary rather than a station ledger.

### Station Directory

The detailed station ledger includes station code and name, state, operating
type, TM/coordinator, sales, collection, tank dip/stock coverage, and remarks.
Rows can flag zero-sale stations. Table headers support the report's sorting
behavior; the global search and filters can narrow station-based views.

### TM & Coordinator Leaders

Territory Manager summaries show total volume, average volume per station,
zero-sale station count, network share, and capped efficiency comparisons.
Search and sort controls let the user rank managers; there is no separate
coordinator leaderboard or zero-sale recovery calculation on this screen.

### Operating Models

Compares station operating categories (including LOCO, DODO, JOCO/JODO, and
COCO where present in the data) by volume and collection. The screen also
explains the model categories used by the report.

### Sales Heatmap

A color-intensity grid visualizes station and regional sales distribution.
Use the color pattern to locate strong and weak areas; consult the station
ledger for exact row-level values.

### Sales Benchmarks

Compares latest-day station sales with editable per-TM benchmarks (default
1,100 L per station) and optional station overrides. Bands describe comparison
to that benchmark, not attainment of an approved business plan. Values are
stored in the current browser and are not shared across users.

### Ad-hoc Explorer

Provides a searchable station dataset, local state/type filters, and selectable
columns. Available fields include cost code, station, state, type, TM,
coordinator, sale quantity, collection, nominal/effective RSP, closing dip,
days left, free sale, Paytm, cash, and remark. The table displays up to 100
matching rows; **Export Filtered Cut** exports all matching rows using the
selected columns.

### Report Catalog

The catalog contains 14 interactive views and 18 planned specifications.
Search by report number, title, or description, or filter by category.
Interactive entries open the actual dashboard view. Planned entries are
explicitly labeled and show their intended scope; they do not display
report-specific metrics or imply that a calculation is implemented.

## 4. Latest-day station filters

- **State** — limits station-based report data to a selected state.
- **Type** — limits station-based report data to a selected operating type.
- **TM** — limits station-based report data to a selected Territory Manager.
- **Search** — matches station code, station name, state, or remark.
- **Reset** — returns filter values to their defaults when filters are active.
- **Showing N of M stations** — shows the station match count.
- **Compact View** — toggles denser presentation in supported views.
These filters narrow station-based views for the latest available date.
Network history, forecast calculations, and the executive briefing remain
network-wide. There is no date-range or compare-period control in the current
interface.

## 5. Reports Navigation Drawer

The drawer groups report shortcuts into **Executive & Overview**,
**Operations & Supply Chain**, **Forecasting & Simulation**, and
**Analytics & Collections**. It shows descriptions and, where available,
attention badges such as urgent dispatch or zero-sale counts. Selecting an item
opens its corresponding primary report tab; the backdrop or close control
dismisses the drawer.

## 6. The 32 catalog entries

The catalog contains 14 interactive views and 18 planned specifications.
Only entries linked to an interactive view are live calculations. Planned
entries are labeled as such in the catalog.

The following are the catalog titles and the category they appear under.
Descriptions below summarize the catalog's stated purpose; they should not be
read as a claim that every entry is a separate, navigable screen.

| # | Report | Category |
|---:|---|---|
| 1 | Ad-hoc Data Explorer | Diagnostics |
| 2 | Master Executive Dashboard | Executive |
| 3 | RSP & Pricing Realization | Collections & Realization |
| 4 | Day-over-Day Variance (DoD) | Operations |
| 5 | Daily Sales Trend & 7MA | Executive |
| 6 | Weekly Performance Analysis | Operations |
| 7 | Month-on-Month Growth (MoM) | Executive |
| 8 | CMD MIS State Summary | Executive |
| 9 | Averages & Unit Metrics | Operations |
| 10 | Sales Analysis & Pareto Share | Operations |
| 11 | Station-wise Detail Ledger | Operations |
| 12 | Dispenser & Pump Throughput | Operations |
| 13 | Team Performance (TM & Coord) | Operations |
| 14 | Sales Benchmark vs Actual | Operations |
| 15 | Station Benchmark Variance | Operations |
| 16 | Sub-state & District Mapping | Operations |
| 17 | Week 1/2/3 Intra-Month Slices | Operations |
| 18 | Weekend vs Weekday Dynamics | Operations |
| 19 | Quarterly Analysis (Q1-Q4) | Executive |
| 20 | Monthly Network Expansion | Executive |
| 21 | Station Operating Models | Operations |
| 22 | Competitor Proximity Audit | Operations |
| 23 | AIML 7-Day Sales Forecast | Forecasting |
| 24 | Data Analysis & What-If Simulator | Forecasting |
| 25 | Station Performance Heatmap | Diagnostics |
| 26 | Collection Realization & Gap | Collections & Realization |
| 27 | Station Ranking & Momentum | Operations |
| 28 | Daily Morning Briefing | Executive |
| 29 | Data Health & Quality Audit | Diagnostics |
| 30 | Zero-Sale & Exception Registry | Diagnostics |
| 31 | Closing Dip & Stockout Alerts | Operations |
| 32 | Tanker Replenishment Dispatch Generator | Operations |

Several catalog cards open existing dashboard screens (for example, reports
1–3, 8, 11, 13–14, 21, 23–26, 28, and 32). Other cards present report
specification details but do not open a distinct report implementation.
Catalog report 24 opens the What-If Simulator; Deep Statistics is separately
available from the primary navigation.

## 7. Data, units, and interpretation

- Sales, volume, stock/dip, and burn are generally shown in **litres (L)**.
- Currency is **Indian rupees (₹)**; large values may be abbreviated as lakh
  (`L`) or crore (`Cr`).
- RSP is a per-litre rate; collection gap is the nominal rate less realized
  effective collection per litre. A larger gap can indicate collection or
  pricing realization risk.
- **Days left** is an inventory-coverage estimate. It is useful for prioritizing
  replenishment, not a guaranteed stockout time.
- **MAPE** is the displayed forecast backtest error; lower values indicate
  lower average percentage prediction error over the evaluated backtest.
- The displayed date and source matter when interpreting all current-day
  KPIs. PostgreSQL must be available; on connection or data errors the
  dashboard reports an error instead of serving cached or spreadsheet data.

## 8. Calculation reference for interactive screens

These are the formulas currently used by the dashboard code. Unless stated
otherwise, calculations run over the latest-day station rows, not a time-series
aggregate. Global state/type/TM/search filters narrow the `filteredStations`
list for screens wired to it; they do not change the date range. Several
telemetry cards and report summaries use pre-aggregated `data` instead and
therefore remain network-wide regardless of those filters.

### Shared source fields and aggregation rules

The station record is the basic unit. Important source values include `sale_qty`
(litres sold), `collection`, `net_total_collection`, `new_rate`/`erp_rate`,
`effective_rsp`, `free_sale_litres`, `free_sale_rupees`, `closing_dip_in_ltr`,
`diff`, and station ownership/territory labels.

- **Station net collection** uses `net_total_collection` when it is truthy;
  otherwise it uses `collection`.
- **Network sales volume** = sum of `sale_qty`.
- **Network net collections** = sum of the selected station net collection.
- **Active stations** = count with `sale_qty > 0`; **zero sale** = count with
  `sale_qty === 0`.
- **Weighted nominal RSP** = sum(`rate × sale_qty`) / sum(`sale_qty`), where
  `rate` is usually `new_rate` (the state aggregation also falls back to
  `erp_rate`). If total volume is zero, some views use a calculation default;
  that default is not a substitute data source.
- **Effective RSP** = net collections / litres sold. The station report may use
  the stored `effective_rsp` first, falling back to station collections divided
  by sale volume.
- **Collection gap per litre** = max(0, weighted nominal RSP − weighted
  effective RSP) for the Master Dashboard and RSP audit. Some state summary
  rows show the raw signed difference instead.
- **Free-sale amount** uses `free_sale_rupees` when present; some views estimate
  it as free-sale litres × nominal rate when the rupee field is absent.
- Monetary and volume values are displayed with rounding/Indian number
  grouping. Display rounding does not necessarily mean intermediate
  calculations were rounded.

### Master Dashboard

- The four KPI cards are derived as follows:
  - Volume = sum of filtered station `sale_qty`.
  - Collections = sum of filtered `net_total_collection` (falling back to
    `collection`); Paytm and free sale are separate sums.
  - Realized effective RSP = filtered collections / filtered volume.
  - Weighted ERP rate = sum(`new_rate × sale_qty`) / filtered volume.
  - Gap = max(0, weighted ERP rate − effective RSP).
- Active/zero counts are station counts, not volume shares.
- Top and bottom performer tables sort the filtered active stations by
  `sale_qty`; they are not month-to-date rankings.
- **Network Operational Health (0–100)** is a heuristic score, not a statistical
  model:
  - Active component = active-station ratio × 40.
  - Gap component = max(0, 20 − collection-gap-per-litre × 8).
  - Free-sale component = max(0, 15 − free-sale-litres / total-litres × 500).
  - Stock component = max(0, 25 − 3 × count of active stations with fewer than
    3 inventory days).
  - The components are added, rounded, and clamped from 0 to 100.
- The 30-day history chart aggregates observed daily rows from PostgreSQL.
  The chart's peak, low, and run-rate are computed from the returned daily
  series.
- The Master Dashboard's “Top Stations 3-Month Quarterly Volume Trend” selects
  the current top five active stations, then estimates October as current daily
  sale × 30. For zero-based station rank `i`, September is October ×
  `(0.94 + ((i×3) mod 7)×0.02)` and August is October ×
  `(0.89 + ((i×5) mod 9)×0.02)`. Growth is `(October − August) / August × 100`,
  rounded to a whole percent. Those month values and growth are synthetic
  visualization estimates, not historical station data.
- Master Dashboard alerts use the formulas described under **Alert panels**
  below. The low-stock panel itself is populated from telemetry stock-risk
  records.

### Morning Briefing

- Operational outcome cards directly reuse network telemetry: daily volume,
  net collection, effective RSP, and the per-litre gap.
- Forecast volume and confidence bounds come from the first forecast point;
  seven-day total is the forecast engine's first seven point predictions added.
- The displayed **“Model Error (MAPE): 6.8%” is currently a fixed literal in
  this screen**; it is not bound to `forecast.mape_ensemble`. Use the Forecast
  screen's MAPE for the calculated model score.
- Stockout count and warning rows use telemetry stations whose computed
  inventory coverage is under three days. Zero-sale count and active-station
  ratio are based on latest-day station counts.
- The clipboard text includes the first four stock-risk stations, not
  necessarily every flagged station.

### Tanker Dispatch

For each supplied station:

1. A dispatch candidate is included if `days_left <= 3.5`, the remark contains
   `stock`, `licence`, `breakdown`, or `dry` (case-insensitive), or sales equal
   zero.
2. Daily burn is the station's current `sale_qty`; for a zero-sale candidate,
   the code substitutes **1,050 L/day**. The displayed three-day burn is
   daily burn × 3.
3. Tanker selection is **18-Ton / 33,000 L** when daily burn is at least
   1,400 L/day (equivalently, three-day burn ≥4,200 L); otherwise it is
   **12-Ton / 22,000 L**. The displayed total required volume sums the full
   nominal capacity assigned to each candidate; it is not a precise refill
   quantity calculated from current stock.
4. Urgency is Critical when coverage is under 1.5 days, sales are zero, or the
   remark contains `stock`; otherwise it is Warning through 3.0 days, and
   Standby above 3.0 days. Because candidate inclusion extends to 3.5 days and
   can be triggered by remark, Standby candidates may appear in the “All”
   list.
5. Dispatch rows sort by days remaining. Critical and Warning tabs filter by
   urgency; the displayed KPI counts and total tanker volume use all candidates.

Coverage (`days_left`) is computed upstream as closing dip / daily burn,
rounded to one decimal. Daily burn is current sale when positive or the current
network active-station average otherwise. If there are no active stations, the
calculation uses 1,000 L/day; if closing dip is absent or zero, coverage is
shown as 99 days. These are calculation assumptions, not substituted source
records.

### AIML 7-Day Forecast

The visible “AIML” report uses the server's `generateForecast` result. Its
calculation flow is:

1. Sort historical daily observations by date. Fewer than seven observations
   returns an insufficient-history response and no forecast.
2. Fit a multivariate linear regression using date/day and lag/rolling features,
   and a weekly-seasonal Holt-Winters model. Holt-Winters parameters are
   selected from a finite alpha/beta/gamma grid using the last seven
   observations where sufficient history exists.
   The linear feature vector is weekday, weekend flag, day of month, festival
   flag, prior-day volume, seven-day lag, prior-only 7/30-day rolling means,
   prior-only exponentially weighted mean, two-day lag, and prior-week
   trend-acceleration estimate. Features are standardized; coefficients are
   solved by ridge-regularized normal equations with a diagonal penalty of 1.
   The fallback Holt-Winters initialization uses weekly seasonality (`m=7`),
   then updates level, trend, and seasonal offsets. If less than two weekly
   cycles are available, it falls back to the historical mean.
3. Hold out up to seven of the latest observations for backtesting. For each
   tested day with positive actual volume, model error is absolute percentage
   error: `abs(actual - prediction) / actual × 100`; MAPE is the mean of those
   errors. The naive comparison models use last week's same day and a
   same-weekday historical average. In the current linear backtest, the same
   final training feature row is reused to predict each holdout point, rather
   than rebuilding a distinct feature row for each tested date; interpret that
   linear MAPE with this implementation limitation in mind.
4. Ensemble weights are normalized inverse errors: each model receives
   `(1 / max(model MAPE, 1)) / sum(all inverse errors)`. The UI shows the
   ensemble score and the three individual model scores; the engine's ensemble
   score is currently calculated as 90% of the lowest component MAPE, rather
   than recomputed from a separate ensemble holdout series. The navigation
   badge says “Backtested,” and the forecast calculation combines
   four series: linear, Holt-Winters, last-week-same-day, and same-weekday
   average.
5. For each future date, the forecast combines linear, Holt-Winters,
   last-week-same-day, and same-weekday predictions using those weights. A
   festival-date adjustment may reduce the combined value by 6%. Negative
   predictions are prevented for the linear component.
6. The uncertainty width uses standard deviation from recent actual daily
   totals (last 14 when available; otherwise a fallback of 8% of the overall
   mean), expanded by 5% at each additional horizon step. Lower/upper display
   bounds are prediction ± 1.28 × that uncertainty, clamped below at zero.
   The interface labels these “95%” bounds, though the engine's 1.28
   multiplier is approximately an 80% two-sided normal interval, not 95%.
7. Seven-day cumulative volume is the sum of the first seven rounded median
   predictions. These figures are projections and should not be treated as
   guaranteed demand.

Forecast history is built from grouped daily records in PostgreSQL
`sale_tracker`. If PostgreSQL is unavailable or there is insufficient observed
history, the dashboard reports an error or an insufficient-history forecast;
it does not train on a spreadsheet-derived series.

### What-If Simulator

Let `S` = current daily sales volume, `C` = daily net collections, `E` =
effective RSP, `G` = per-litre collection gap, `F` = free-sale rupees, and
`N` = number of zero-sale stations selected for recovery.

- Free-sale recovery = reduction percentage × `F`.
- Recovered station volume = `N × 1,050 L/day`; recovered collection =
  recovered volume × `E`.
- Collection efficiency recovery = efficiency-gain percentage × (`G × S`).
- Market-demand volume gain = growth percentage × `S`; associated collection
  = gained volume × `E`.
- Projected volume = `S` + recovered station volume + demand volume gain.
- Projected collections = `C` + free-sale recovery + recovered-station
  collection + efficiency recovery + demand collection.
- Daily deltas are projected values minus the current baseline. Annualized
  revenue expansion = daily collection delta × 365. The assumptions are
  additive, no caps prevent overlap between levers, and the result is a
  scenario—not a forecast or database write.
- Initial sliders are 30% free-sale reduction, up to three reopened stations
  (limited by zero-sale count), 25% collection-efficiency improvement, and 5%
  demand growth. Presets set these respectively to (20%, 1, 15%, 2%),
  (50%, up to 4, 35%, 6%), or (80%, all zero-sale stations, 60%, 12%).
  Reset sets every lever to zero.

### Deep Statistics

Calculations are performed on the station list passed to the view:

- The distribution cards use **all station sales, including zeros**.
  Mean = sum / count; median is the middle sorted value (or mean of the two
  middle values); sample variance divides squared deviations by `n−1`;
  standard deviation is its square root.
- Skewness is the third central-moment sum divided by `n × standard-deviation³`.
  Excess kurtosis is the fourth central-moment sum divided by
  `n × standard-deviation⁴`, minus 3. Both display rounded values.
- Q1 and Q3 are selected at sorted-array indexes `floor(n×0.25)` and
  `floor(n×0.75)`; IQR = Q3 − Q1. Outlier fences are Q1 − 1.5×IQR and
  Q3 + 1.5×IQR.
- Outlier detection excludes zero-sale stations and requires at least five
  active rows. It flags sales outside the fences and reports a z-score against
  active-station mean and sample standard deviation.
- Pearson `r` is covariance-like centered-product sum divided by the product
  of the two centered sums' square roots. The displayed field pairs include
  sales vs collections, effective RSP, closing dip, Paytm, and free-sale litres,
  plus closing dip vs collections. These correlations use active stations.
  Strength labels use cutoffs at ±0.3 and ±0.7; correlation does not establish
  causation.
- Top 1%, 5%, 10%, and 20% volume shares sort all stations by sales and use
  `max(1, round(station count × share))` stations. Gini is calculated from all
  pairwise absolute sales differences divided by `2 × n² × mean`.

### RSP & Collection Gap

- Zero-sale stations are excluded.
- Nominal RSP = `new_rate`, falling back to `erp_rate`, then ₹77.20.
- Effective RSP = stored `effective_rsp` when nonzero; otherwise selected
  collection / sale volume.
- Positive gap per litre = max(0, nominal − effective); estimated daily
  collection loss = rounded gap × station sale litres.
- The minimum-gap slider (default ₹0.50/L) and station-name search filter the
  table. The summary loss is the sum of the displayed/filtered rows, not an
  independent forecast. CSV export uses those same rows.

### State MIS

Each latest-day station is grouped by normalized state code (including the
configured MS→MH and AP→TG mappings). Per state:

- Station count = row count; zero-sale count = rows with exactly zero sales.
- Total volume, collections, and free-sale litres are sums.
- Average litres/station = total volume / station count.
- Nominal RSP = sum(`new_rate or erp_rate` × sale litres) / total litres.
- Effective RSP = net collections / total litres.
- Collection gap = nominal less effective RSP; revenue at risk in the shared
  summary is max(positive gap × volume, 0), rounded to rupees.
- State share = state volume / national volume. The “Top 3” figure sums the
  three highest-volume state summaries and divides by total network volume.

### Station Directory

This view does not derive new sales measures: it displays station source fields
and upstream `days_left`. Search checks cost code, station name, state, TM,
coordinator, and remark. The zero-sale toggle selects exactly zero sales;
the stockout toggle selects **positive-sale** stations with fewer than three
days. Sort operates on the chosen source field; pagination affects the table,
while CSV export includes the full filtered-and-sorted result, not only the
visible page.

### TM & Coordinator Leaders

TM summaries are formed from the latest-day station rows, grouped by TM (blank
becomes “No TM”):

- Volume and collection are sums; average daily sale per station =
  territory volume / station count; zero-sale count counts exact zero rows.
- Efficiency = min(100, territory volume / (station count × 1,100) × 100),
  displayed to one decimal. This is a fixed daily-per-station benchmark and
  cannot exceed 100%.
- Network share = TM volume / sum of TM volumes.
- Search filters TM/coordinator text; the three sort buttons rank by total
  volume, average per station, or capped efficiency.

This is a current-day leaderboard, not a historical target-pacing series.

### Operating Models

Stations are grouped by uppercase operating type (missing type defaults to
LOCO). For each type: station count is row count; volume and collections are
sums; average throughput = volume / station count; volume share = type volume
/ total network volume. Despite the report catalog wording, this visible screen
does not display margin. The analytics engine has a separate operating-model
aggregate with hard-coded indicative margin-per-litre values (COCO ₹4.80,
LOCO ₹3.50, DODO ₹2.20, other types ₹2.80), but that result is not passed to
this screen and should not be treated as a displayed or source-derived margin.

### Sales Heatmap

The heatmap is **not a seven-day historical sales matrix**. It uses today's
`sale_qty` as a base. For zero-based displayed row index `i`, the six
past-looking multipliers are `0.95+((3i mod 15)×0.01)`,
`0.92+((5i mod 15)×0.01)`, `0.98+((7i mod 15)×0.01)`,
`1.02+((2i mod 15)×0.01)`, `0.96+((4i mod 15)×0.01)`, and
`1.05+((6i mod 15)×0.01)`. Each is multiplied by today's sale, rounded, and
clamped to zero; “Today” is the actual current station sale. The colors encode absolute litres:
0, under 500, 500–999, 1,000–1,599, and at least 1,600. Search and state filter
apply before the 50-row display limit. Treat earlier day columns as
illustrative, not observed measurements.

### Sales Benchmarks

- Default benchmark = 1,100 L per station; users may edit the per-TM benchmark
  and set station overrides.
- Benchmark percentage = current sale litres / applied benchmark × 100,
  rounded to one decimal.
- Bands are Met benchmark ≥100%; Near benchmark ≥90%; Below benchmark ≥75%;
  Far below benchmark <75%.
- Cards count stations in each band and divide by station count for share.
  The table displays the station rows passed through the current state/type/TM/
  search filters.

These editable values are stored in browser local storage and are not shared
with other users. They are benchmarks, not approved plan values; monthly
pacing and calendar-adjusted targets are not calculated.

### Ad-hoc Explorer

Search checks cost code, station name, and remark (not every displayed field).
Its local State and Type selectors further narrow the current filtered station
list. Visible-column switches affect both the table and export. The table shows
the first 100 filtered records, while CSV export includes every filtered record
and selected column.

## 9. Additional calculation modules and alerts

These modules are referenced by the UI and/or report catalog but are not all
independently reachable from the primary tabs.

### Embedded in the Master Dashboard

- **Low-inventory burn alert:** takes active stations; daily burn is current
  sales. Estimated hours remaining = closing dip / daily burn × 24. It flags
  at ≤24 hours (Critical), ≤48 hours (Urgent), and otherwise up to 72 hours
  (Moderate). Tanker size is selected by comparing station burn to 1.35 ×
  network average active-station sale: at/above that threshold it recommends
  33,000 L; otherwise 22,000 L. The 24h/48h/all tabs apply those cutoffs.
- **Sales-drop alert:** derives a baseline per station. When `diff < 0`, baseline
  = current sale + absolute diff. Otherwise, a positive sale uses max(1.25 ×
  current sale, 1.1 × network active-station average); a zero sale uses the
  network average. Estimated drop = max(0, baseline − current sale), and drop
  percent = drop / baseline × 100. The cutoff defaults to 20% and can be set
  to 30% or 50%. Despite the label, this is a heuristic from the current row's
  `diff` and network mean, not a computed three-month rolling average.
- **Smart Anomaly Detection:** uses explicit thresholds, not the historical
  Z-score described in its UI text:
  - Volume spike: sale >4.5 × network active average and >4,000 L.
  - RSP entry flag: positive new rate below ₹20 or above ₹150.
  - Possible dispenser lock: exactly zero sale and closing dip >8,000 L.
  - Collection mismatch: sales >1,500 L and net collection <₹10,000.
  The first two are Critical; the latter two are Warning. These are review
  signals, not proof of data-entry error or equipment failure.
- **Top performers trend chart:** selects the five highest-volume active
  stations, then creates August/September/October values using deterministic
  multipliers of the current sale × 30. These month totals and growth are
  illustrative estimates, not historical data.

### Additional catalog/module screens

- **Free Sale Leakage Audit** (module in App, not in primary navigation):
  station free-sale percent = free-sale litres / sales × 100 (zero when no
  sales). Free-sale rupees use the supplied amount or litres × nominal RSP.
  It includes rows with positive litres and a percentage at/above the default
  0.5% threshold, sorted by free-sale litres; totals sum only included rows.
- **Customer Churn Predictor** (module in App, not in primary navigation):
  only positive-sale stations are assessed. Drop litres = abs(`diff`) when
  `diff < 0`, otherwise zero. Baseline = current sale + drop; drop percentage
  = drop / baseline × 100. Score = min(98, round(1.8 × drop percentage + 25
  when current sales <500 L)); remarks containing price/disparity/rival/
  competing add 20 points, capped at 99. Bands: High ≥60, Medium ≥35,
  otherwise Low. Sensitivity filters scores at ≥35/≥50/≥70 for High/Medium/Low
  setting. This is a rules-based score, not a trained probability model.
- **Exception classification** in the shared engine prioritizes zero sales
  (Critical), then remarks containing “no stock” (Critical), then “sale not
  received” (Warning), then days-left <3 (Critical below 1.5, otherwise
  Warning), then positive sales below 100 L (Warning). Because this is an
  `if/else` chain, each station is assigned at most its first matching class.

## 10. Planned catalog entries

The cards for these entries are labeled **Planned specification** and show
their intended scope. They do not open a live calculation, SQL view, or
report-specific metric.

| # | Catalog item | What is actually calculated today |
|---:|---|---|
| 4 | Day-over-Day Variance (DoD) | No per-station previous-day comparison; only the generic catalog inspection values. |
| 5 | Daily Sales Trend & 7MA | No moving-average calculation on this card; see the Master Dashboard trend and its data-source caveat above. |
| 6 | Weekly Performance Analysis | No weekly aggregation or week-on-week delta. |
| 7 | Month-on-Month Growth (MoM) | No monthly comparison or growth percentage. |
| 9 | Averages & Unit Metrics | No separate averages report or margin calculation. |
| 10 | Sales Analysis & Pareto Share | No separate category Pareto report; state/type summaries and Deep Statistics are separate calculations. |
| 12 | Dispenser & Pump Throughput | No pump/nozzle level data or calculation is shown. |
| 15 | Station Benchmark Variance | No separate plan-variance report; the Sales Benchmarks view compares sales with a browser-local benchmark. |
| 16 | Sub-state & District Mapping | No geographic cluster/density calculation in this report card. |
| 17 | Week 1/2/3 Intra-Month Slices | No intra-month slice or cash-flow calculation. |
| 18 | Weekend vs Weekday Dynamics | No observed weekend-vs-weekday comparison; forecast weekend features are separate projections. |
| 19 | Quarterly Analysis (Q1-Q4) | No fiscal-quarter aggregation or comparison. |
| 20 | Monthly Network Expansion | No active-station expansion time series. |
| 22 | Competitor Proximity Audit | No competitor-location or competitor-pricing calculation. |
| 27 | Station Ranking & Momentum | No distinct momentum ranking; current-day sorting exists in other screens. |
| 29 | Data Health & Quality Audit | The catalog card has no separate audit implementation. Database Inspector has its own live source/row/date checks. |
| 30 | Zero-Sale & Exception Registry | No dedicated registry screen; current zero-sale counts, directory flags, and exception helper are distinct from this catalog card. |
| 31 | Closing Dip & Stockout Alerts | No separate catalog screen; use the Master Dashboard alert or Tanker Dispatch, whose rules are documented above. |

The remaining catalog cards open existing views. The view's actual
calculations, not the catalog title, define the available data.

## 11. Current navigation and calculation limitations

Some analysis modules exist in the source but are not linked from the primary
navigation or the drawer. The catalog is an index of interactive screens and
report specifications, not a promise of 32 separate calculations. Several
trend/alert views use heuristics or generated illustrative values; the sections
above identify those cases so they are not mistaken for observed historical
data, validated causal analysis, or procurement instructions.
