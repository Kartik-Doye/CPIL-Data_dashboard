# Technical Flow & Architecture Specification (`tech-flow.md`)

**System:** GO Gas Executive Suite  
**Stack:** React 19 (SPA / TypeScript / Tailwind CSS) + Express (Node.js / TypeScript) + PostgreSQL + Socket.IO + Node-Cron + Nodemailer  
**Revision:** 2.4.0  

---

## 1. System Topology & Architectural Blueprint

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT BROWSER LAYER                                 |
|                                                                                         |
|   React 19 SPA (Vite / Tailwind CSS)                                                    |
|   +----------------------------------------------------------------------------------+  |
|   | Navbar: PostgreSQL Health Stripe + Quick Diagnostics Badge                       |  |
|   +----------------------------------------------------------------------------------+  |
|   | Master Dashboard | Forecast Studio | Logistics & Tankers | WhatsApp Center Modal |  |
|   +----------------------------------------------------------------------------------+  |
|   | Socket.IO Client (ws://host/socket.io) <---> QR Code Stream & Real-Time Status   |  |
|   | REST Client (fetch /api/*)             <---> Telemetry, Forecasts, Dispatches    |  |
+--------------------------------------------▲--------------------------------------------+
                                             │ HTTP / WebSocket (Reverse Proxy / Port 3000)
+--------------------------------------------▼--------------------------------------------+
|                                  SERVER / BACKEND LAYER                                 |
|                                                                                         |
|   Express 4 Server + Node.js HTTP Server (`server.ts`)                                  |
|   +----------------------------------------------------------------------------------+  |
|   | 1. API Route Controller (/api/telemetry, /api/forecast, /api/whatsapp/*)         |  |
|   | 2. Socket.IO WebSocket Engine (qr-code, status-update, broadcast-success)        |  |
|   | 3. Automation Engines:                                                           |  |
|   |    - 11:00 AM & 07:00 PM Cron: WhatsApp Daily Broadcast (`whatsappAutomation.ts`) |  |
|   |    - 11:00 AM & 07:00 PM Cron: Gmail SMTP Briefing (`server.ts` & `emailService`) |  |
|   | 4. Intelligence & Computational Engines:                                         |  |
|   |    - 10-Model Walk-Forward ML Forecaster (`forecasting.ts`)                      |  |
|   |    - Compartment Logistics Sizing (`tanker.ts`)                                  |  |
|   |    - Revenue Leakage & RSP Disparity Auditor (`dataAnalysis.ts`)                 |  |
|   | 5. Database Gateway (`db.ts`): Dual Connection Pooling & Diagnostics Prober     |  |
+--------------------------------------------▲--------------------------------------------+
                                             │ TCP Connection Pools (Port 5432)
+--------------------------------------------▼--------------------------------------------+
|                                  DATABASE & EXTERNAL LAYER                              |
|                                                                                         |
|   Local / Enterprise PostgreSQL Database Server                                         |
|   +----------------------------------------------------------------------------------+  |
|   | Database: `sale_alds`                                                            |  |
|   | - Table: `sale_tracker`      (Partitioned daily sales, dips, collections)        |  |
|   | - Table: `state_map`         (State name canonicalization)                       |  |
|   | - Table: `forecast_feedback` (Persistent model errors & adaptive learning)       |  |
|   | Users: `bot_reader` (Read-only, 15s timeout) | `bot_loader` (Transactional write)|  |
|   +----------------------------------------------------------------------------------+  |
|   External Services:                                                                    |
|   - Google Gmail SMTP Server (`smtp.gmail.com:465`) via TLS/SSL                         |
|   - WhatsApp Web Headless Automation Engine (`whatsapp-session` storage)                |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Core Execution Flows & State Diagrams

### 2.1 Flow 1: Daily Excel Sales Ingestion Pipeline (`load_sales.ts`)

```
 [User / Operator CLI]
          │
          │ Executes: `npm run load-sales -- --file sale.xlsx`
          ▼
 ┌──────────────────────────────────────┐
 │    `processSaleFile(filePath)`       │
 └──────────────────┬───────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────┐
 │ Check File Existence & Credentials   │
 │ - Verify filePath exists             │
 │ - Verify BOT_LOADER_PASSWORD set     │
 └──────────────────┬───────────────────┘
                    │ Valid
                    ▼
 ┌──────────────────────────────────────┐
 │ Streaming XLSX Parsing (`excel.ts`)  │
 │ - Extract worksheet rows             │
 │ - Normalize headers (Cost Code, Date)│
 │ - Resolve formula cells & dates      │
 └──────────────────┬───────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────┐
 │ Strict Structural Row Validation     │
 │ - Cost Code required & unique?       │
 │ - Date consistent across all rows?   │
 │ - Sale Qty, Rate, Dip are numeric?   │
 └──────────────────┬───────────────────┘
                    │ Passes
                    ▼
 ┌──────────────────────────────────────┐
 │ Duplicate Date Verification          │
 │ Query: `SELECT COUNT(*) FROM         │
 │   sale_tracker WHERE sale_date = $1` │
 └──────────────────┬───────────────────┘
                    ├─── Already exists ───► [Log SKIPPED & terminate without changes]
                    │
                    └─── New Date ────────► ┌──────────────────────────────────────┐
                                            │ Begin Transaction (`BEGIN`)          │
                                            │ Execute parameterized INSERTs        │
                                            │ On error: `ROLLBACK` & log error     │
                                            │ On success: `COMMIT` & log [LOADED]  │
                                            └──────────────────────────────────────┘
```

---

### 2.2 Flow 2: Live Telemetry Aggregation & In-Memory Caching (`server.ts`)

```
 [Client: GET /api/telemetry]
               │
               ▼
 ┌──────────────────────────────────────┐
 │ Check In-Memory Telemetry Cache      │
 │ Has cache expired (> 5 minutes old)? │
 └──────────────────┬───────────────────┘
                    ├─── Fresh Cache ──────────► [Return 200 JSON immediately (<5ms)]
                    │
                    └─── Cache Miss / Stale ───► ┌──────────────────────────────────────┐
                                                 │ Query PostgreSQL `sale_tracker`      │
                                                 │ - Latest date sales & collections    │
                                                 │ - Distinct reporting stations        │
                                                 │ - Closing tank dips & burn rates     │
                                                 │ - Free sale testing volumes          │
                                                 └──────────────────┬───────────────────┘
                                                                    │
                                          ┌─────────────────────────┴────────────────────────┐
                                          │ Connection Error / Refused                       │ Successful Query
                                          ▼                                                  ▼
                              ┌─────────────────────────┐                        ┌─────────────────────────┐
                              │ Respond HTTP 503        │                        │ Execute 10-Model ML     │
                              │ Include db_diagnostics  │                        │ Forecast (`forecasting`)│
                              │ with service recovery   │                        │ Run Sizing (`tanker.ts`)│
                              │ instructions            │                        │ Cache payload & return  │
                              └─────────────────────────┘                        └─────────────────────────┘
```

---

### 2.3 Flow 3: WhatsApp Automation & Real-Time QR Pairing Cycle

```
  React UI (WhatsAppModal)                   Node.js Express Server                   WhatsApp Web Client
           │                                          │                                        │
           │ 1. Connect WebSocket                     │                                        │
           ├─────────────────────────────────────────►│                                        │
           │                                          │ 2. Initialize Session Engine           │
           │                                          ├───────────────────────────────────────►│
           │                                          │                                        │
           │                                          │ 3. Generate Pairing Challenge String   │
           │                                          │◄───────────────────────────────────────┤
           │ 4. Emit: `qr-code` (base64/text)         │                                        │
           │◄─────────────────────────────────────────┤                                        │
           │                                          │                                        │
     [Renders QR via                                  │                                        │
      `<QRCodeSVG />`]                                │                                        │
           │                                          │                                        │
     [User scans with                                 │                                        │
      phone WhatsApp]                                 │ 5. Session Handshake Authenticated     │
           │                                          │◄───────────────────────────────────────┤
           │ 6. Emit: `status-update` ("Ready")       │                                        │
           │◄─────────────────────────────────────────┤                                        │
           │                                          │                                        │
     [Wipe QR display &                               │                                        │
      Show Green Indicator]                           │                                        │
           │                                          │                                        │
           │ 7. Trigger: POST /api/whatsapp/broadcast │                                        │
           ├─────────────────────────────────────────►│ 8. Send Formatted Message              │
           │                                          ├───────────────────────────────────────►│
           │                                          │                                  [Dispatches to
           │ 9. Emit: `broadcast-success`             │                                   Executive Phone]
           │◄─────────────────────────────────────────┤                                        │
```

---

### 2.4 Flow 4: Automated 11:00 AM & 7:00 PM Executive Email Briefing Flow

```
 [Windows Task Scheduler / Cron / On-Demand Button]
                      │
                      ▼
 ┌────────────────────────────────────────────────────────┐
 │ Script: `send_morning_report.ts` / `send_morning_mail` │
 └────────────────────┬───────────────────────────────────┘
                      │
                      ▼
 ┌────────────────────────────────────────────────────────┐
 │ Port Probe: Try 3000, fallback to 5000                 │
 │ Fetch: `GET http://127.0.0.1:${port}/api/telemetry`    │
 └────────────────────┬───────────────────────────────────┘
                      │
                      ▼
 ┌────────────────────────────────────────────────────────┐
 │ Compile Executive Briefing Template                    │
 │ - Network Sales Volume & Total Collections             │
 │ - Realized RSP vs Nominal Rate & Collection Gap        │
 │ - Tomorrow's Forecast & 7-Day Demand Outlook           │
 │ - Critical Stockout Stations (< 3 Days Inventory)      │
 │ - Zero-Sale Stations with TM attribution & Remarks     │
 └────────────────────┬───────────────────────────────────┘
                      │
                      ▼
 ┌────────────────────────────────────────────────────────┐
 │ Transmit via Nodemailer Transporter                    │
 │ Host: `smtp.gmail.com` | Port: 465 (SSL/TLS)           │
 │ Auth: `SMTP_USER` & `SMTP_PASS` (Google App Password)  │
 │ To: `REPORT_RECIPIENT_EMAILS` (CMD, MD, State Heads)   │
 └────────────────────┬───────────────────────────────────┘
                      │
                      ▼
 ┌────────────────────────────────────────────────────────┐
 │ Log Delivery Receipt & Message ID in `morning_email`   │
 └────────────────────────────────────────────────────────┘
```

---

### 2.5 Flow 5: Database Health Probing & UI Status State Machine (`dbHealth.ts`)

```
   ┌────────────────────────────────────────────────────────────────────────────┐
   │                            Initial App Mount                               │
   │           - Invoke `fetchTelemetry()` & `verifyDatabaseConnection()`       │
   └─────────────────────────────────────┬──────────────────────────────────────┘
                                         │
                                         ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │                       Evaluate `DatabaseDiagnostics`                       │
   └───────┬───────────────────────┬────────────────────┬───────────────────────┘
           │                       │                    │
   [Status: 503 /          [Status: 200 /       [Status: 200 /          [Fetch In-Flight /
    ECONNREFUSED]           Zero Rows]           Rows Verified]          No Response Yet]
           │                       │                    │                       │
           ▼                       ▼                    ▼                       ▼
   ┌───────────────┐       ┌───────────────┐    ┌───────────────┐       ┌───────────────┐
   │ State: ERROR  │       │ State: WARNING│    │ State: HEALTHY│       │ State: CHECK  │
   │ - Red Stripe  │       │ - Amber Stripe│    │ - Green Stripe│       │ - Blue Stripe │
   │ - 'DB Offline'│       │ - 'DB Empty'  │    │ - 'DB Online' │       │ - 'Verifying' │
   │ - Modal Help  │       │ - Action Prompt│   │ - Latency (ms)│       │ - Spin Icon   │
   └───────────────┘       └───────────────┘    └───────────────┘       └───────────────┘
```

---

## 3. REST API Contract & Endpoint Reference

### 3.1 Telemetry Endpoints
- **`GET /api/telemetry`**
  - **Description**: Returns aggregated network metrics, station records, forecast summaries, and database health diagnostics.
  - **Success Response (200 OK)**:
    ```json
    {
      "source_file": "PostgreSQL Database",
      "date": "2026-11-08",
      "total_sale_qty": 412580.50,
      "total_collection": 26817732.50,
      "average_rsp": 65.00,
      "effective_rsp": 64.99,
      "collection_gap_per_l": 0.01,
      "stations_total": 316,
      "stations_with_sale": 308,
      "zero_sale_count": 8,
      "stockout_risk_stations": [...],
      "forecast": { "predicted_total_7d": 2914000.0, ... },
      "db_diagnostics": {
        "status": "connected",
        "host": "localhost",
        "port": 5432,
        "database": "sale_alds",
        "user": "bot_reader"
      }
    }
    ```
  - **Error Response (503 Service Unavailable)**:
    ```json
    {
      "error": "PostgreSQL database connection failed.",
      "troubleshooting": {
        "cause": "PostgreSQL service is not running or credentials invalid",
        "commands": ["net start postgresql-x64-16"]
      },
      "db_diagnostics": {
        "status": "error",
        "error_code": "ECONNREFUSED"
      }
    }
    ```

- **`GET /api/db-verify`**
  - **Description**: Lightweight health heartbeat endpoint executing `SELECT 1` without loading the full sales dataset.

### 3.2 WhatsApp Automation Endpoints
- **`GET /api/whatsapp/config`**: Returns current session state, target recipient number, configured template text, and active QR challenge string.
- **`POST /api/whatsapp/config`**: Updates target telephone number, daily template text, or forces pairing simulation.
- **`POST /api/whatsapp/broadcast-now`**: Triggers immediate dispatch of the operational report to the configured WhatsApp recipient.
- **`POST /api/whatsapp/pair`**: Confirms manual pairing completion and elevates status to `Ready`.
- **`POST /api/whatsapp/refresh-qr`**: Re-rolls a fresh pairing challenge code.
- **`POST /api/whatsapp/disconnect`**: Terminates the active session and regenerates a pairing challenge.

### 3.3 Email Dispatch Endpoints
- **`POST /api/email/send`**: Triggers an on-demand transmission of the executive briefing email using current live database telemetry.

---

## 4. WebSocket (Socket.IO) Event Protocol

| Event Direction | Event Name | Payload Structure | Trigger / Purpose |
| :--- | :--- | :--- | :--- |
| **Server -> Client** | `status-update` | `'Disconnected' \| 'Connecting (Scan QR)' \| 'Ready'` | Broadcast whenever connection state changes. |
| **Server -> Client** | `qr-code` | `string` (raw pairing challenge) | Transmitted when a new QR code is ready for scanning. |
| **Server -> Client** | `broadcast-success` | `{ timestamp: string, recipient: string, type: string }` | Emitted when scheduled or manual broadcast completes. |
| **Client -> Server** | `request-qr` | `void` | Requests server to generate a new QR pairing string. |
| **Client -> Server** | `simulate-paired` | `void` | Forces session state to `Ready` for testing. |
| **Client -> Server** | `disconnect-session` | `void` | Requests teardown of current WhatsApp session. |

---

## 5. Mathematical & Algorithmic Formulations

### 5.1 Pricing & Collection Gap
$$\text{Effective RSP} = \frac{\sum_{i=1}^{N} \text{Collection}_i}{\sum_{i=1}^{N} \text{Sale Qty}_i}$$

$$\text{Collection Gap} = \text{Nominal RSP} - \text{Effective RSP}$$

$$\text{Total Network Revenue Leakage} = \text{Collection Gap} \times \sum_{i=1}^{N} \text{Sale Qty}_i$$

### 5.2 Days of Fuel Remaining & Stockout Risk
$$\text{Daily Burn Rate}_i = \frac{1}{7} \sum_{d=1}^{7} \text{Sale Qty}_{i, d}$$

$$\text{Days Remaining}_i = \frac{\text{Closing Dip}_i}{\text{Daily Burn Rate}_i}$$

$$\text{Urgency Priority} = \begin{cases} 
\text{CRITICAL (Red)}, & \text{Days Remaining}_i < 1.5 \\
\text{WARNING (Amber)}, & 1.5 \le \text{Days Remaining}_i \le 3.0 \\
\text{HEALTHY (Green)}, & \text{Days Remaining}_i > 3.0 
\end{cases}$$

### 5.3 Optimal Tanker Sizing Allocation
Given station $i$ with tank capacity $C_i$, current dip $D_i$, safety target $S_i = 0.90 \times C_i$:
$$\text{Refill Deficit}_i = S_i - D_i$$

$$\text{Assigned Tanker} = \begin{cases}
\text{None}, & \text{Refill Deficit}_i \le 0 \\
\text{12 KL}, & 0 < \text{Refill Deficit}_i \le 12{,}000\text{ L} \\
\text{18 KL}, & 12{,}000\text{ L} < \text{Refill Deficit}_i \le 18{,}000\text{ L} \\
\text{20 KL}, & 18{,}000\text{ L} < \text{Refill Deficit}_i \le 20{,}000\text{ L} \\
\lceil \frac{\text{Refill Deficit}_i}{20{,}000} \rceil \times \text{20 KL Tankers}, & \text{Refill Deficit}_i > 20{,}000\text{ L}
\end{cases}$$
