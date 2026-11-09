# 1-Click Automated WhatsApp Dispatch Engine & Control Center

A unified 1-click WhatsApp messaging architecture for GO Gas Executive Suite, enabling automated dispatch of the Executive Daily Flash and Tanker Replenishment Manifests from the dashboard UI via a Node.js backend service, complete with live QR pairing, delivery logging, and debounce protection.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following operational decisions and technical foundations are established based on user feedback:

- **1-Click Action Parity with Email**: Just like the existing "Send Test Email" button, operators will have direct **"Send WhatsApp Flash"** (in Daily Briefing) and **"Send WhatsApp Manifest"** (in Tanker Dispatch) buttons that dispatch live operational intelligence to configured stakeholders without manual clipboard copying.
- **Dual Trigger Support**:
  1. *On-Demand Dashboard Clicks*: Direct triggers from the React UI with instant feedback and toast alerts.
  2. *Scheduled Automatic Morning Trigger*: Automated batch dispatch (scheduled alongside or after morning data ingestion at 9:30 AM).
- **Dedicated WhatsApp Center Modal**:
  - Accessible via a dedicated WhatsApp status icon in the top Navbar (🟢 Ready / 🟡 QR Required / 🔴 Disconnected).
  - Displays QR code for initial WhatsApp device linking, recipient phone number preview, connection diagnostics, and recent dispatch logs.
- **Backend Architecture & Protocol**:
  - Express backend routes (`/api/whatsapp/status`, `/api/whatsapp/send-briefing`, `/api/whatsapp/send-dispatch`, `/api/whatsapp/qr`).
  - Modular service adapter pattern: supports both local session pairing (`whatsapp-web.js` / headless bridge) and zero-footprint HTTP Gateway APIs (WhatsApp Cloud API / Green-API / Twilio) via environment configuration in `.env`.
  - Rate limiting, origin authorization, and 30-second deduplication safeguards identical to `/api/email/send`.

---

## 1. Overview & Core Concept

### What It Does
Operators and executives can click a single button to send high-priority daily flashes and tanker manifests directly to leadership and territory managers on WhatsApp. The Node.js backend handles message templating, formatting (monospaced metrics, bold headings, urgent warning badges), phone number routing, and real-time delivery tracking.

### Target Audience & Persona
- **CMD, MD, and Executive Leadership**: Receive concise 30-second network health summaries (volume, collections, realized rate, forecast, stockout risks).
- **Supply Chain & Transport Officers**: Receive prioritized tanker manifests with exact refill litres and tanker sizes (12-Ton vs 18-Ton) for stations below 1.5 days of fuel coverage.
- **Territory Managers (TMs)**: Receive automated alerts on low-stock stations within their respective states.

### Key Value
- **Zero Manual Effort**: Replaces manual clipboard copying and mobile app switching with verified, server-authoritative dispatches.
- **Instant Escalation**: Replenishment warnings reach depot dispatchers within seconds of data loading.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **One-Time Pairing (WhatsApp Center)**:
   - User clicks the WhatsApp icon on the top Navbar.
   - If unlinked, a modal opens showing a real-time QR code.
   - User scans with their phone's WhatsApp ("Linked Devices"). The status changes to "Connected" with a green pulse badge.
2. **Sending Daily Briefing via WhatsApp**:
   - Operator navigates to the **Daily Briefing** tab.
   - Next to "Send Test Email", a prominent emerald button **"Send WhatsApp Flash"** is displayed.
   - On click, the button shows an active sending spinner.
   - Upon completion, an inline success pill appears: `✓ Executive briefing sent to 3 configured recipient(s) via WhatsApp.`
3. **Sending Tanker Replenishment Manifest**:
   - Operator opens **Report 32: Tanker Dispatch**.
   - Operator clicks **"Send WhatsApp Manifest"**.
   - The critical stations (<1.5 days dip) and recommended tanker capacities are parsed and sent directly to supply chain officers.

### Visual Identity & Theme Discipline
- **Emerald Accent Hierarchy**: Action buttons use Tailwind's `emerald-600` (`#059669`) with smooth hover transitions (`hover:bg-emerald-500`) and subtle shadows, visually distinguishing WhatsApp dispatches from email (`sky-700`) and clipboard actions.
- **Zero-Pill Minimalist Badges**: Connection status uses clean typographic status indicators with glowing pulse dots (`bg-emerald-500 animate-pulse` vs `bg-amber-500`).
- **Tabular Decimal Realignment**: All numbers in messages and logs are strictly formatted using Indian grouping (`en-IN`) with exact 2-decimal precision.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Modular WhatsApp Provider Adapter**
  - *Chosen Approach*: Implement `whatsappService.ts` with a provider abstraction:
    1. **Primary / Direct HTTP Gateway**: Allows instant sending via HTTP REST call if `WHATSAPP_GATEWAY_URL` or `WHATSAPP_ACCESS_TOKEN` is set in `.env` (no browser dependencies).
    2. **Local Session Bridge**: If no external API token is provided, uses a lightweight Node.js session pairing mechanism with QR code generation.
  - *Why*: Cloud containers and developer laptops have differing support for heavy headless browsers. A dual-mode adapter ensures rock-solid reliability in any deployment environment.
  - *Alternatives Considered*: Pure browser `window.open("https://wa.me/...")` was rejected because it requires operator manual intervention and cannot automate scheduled reports.

- **Decision 2: Centralized Recipient Management in `.env`**
  - *Chosen Approach*: Configure `WHATSAPP_RECIPIENT_NUMBERS` in `.env` (comma-separated with country code, e.g., `919876543210,918087018975`).
  - *Why*: Keeps sensitive executive phone numbers out of client-side bundles and prevents unauthorized client mutations.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   REACT 19 FRONTEND                                    │
│  ┌───────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────┐ │
│  │ Navbar WhatsApp Icon  │   │ DailyBriefing Action Strip│   │ Tanker Dispatch Action│ │
│  │ (Status Badge + Modal)│   │ [Send WhatsApp Flash]     │   │ [Send Manifest]       │ │
│  └───────────┬───────────┘   └─────────────┬─────────────┘   └───────────┬───────────┘ │
└──────────────┼─────────────────────────────┼─────────────────────────────┼─────────────┘
               │                             │                             │
               ▼                             ▼                             ▼
       GET /api/whatsapp/status     POST /api/whatsapp/send-briefing   POST /api/whatsapp/send-dispatch
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              EXPRESS BACKEND (server.ts)                               │
│  • Request Authorization Guard (`x-go-gas-request: authorized-client`)                 │
│  • 30-Second Anti-Spam Debounce & Single-Execution Lock                                │
│  • Rate Limiting & Origin Verification (Localhost Only)                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                       WHATSAPP ENGINE (src/engine/whatsappService.ts)                  │
│  • Telemetry Aggregation (Total Sales, Realized RSP, Stockout Count, 7-Day Forecast)   │
│  • Message Formatter (Unicode Box Styling, Bold Indicators, Metric Grouping)           │
│  • Delivery Dispatcher (Multi-recipient iterative loop with retry support)             │
│  • In-Memory Delivery Audit Log (Timestamp, Recipient Count, Message Digest)           │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────┐
                      │    WHATSAPP DELIVERY PROTOCOL      │
                      │  • Direct REST API (Cloud/Gateway) │
                      │  • Local Linked-Device QR Bridge   │
                      └────────────────────────────────────┘
```

### Data Model & Environment Configuration

```env
# WhatsApp Delivery Configuration
WHATSAPP_ENABLED=true
WHATSAPP_RECIPIENT_NUMBERS=918087018975,919876543210
# Optional: External Gateway URL / Token (e.g. Cloud API, Green-API, UltraMsg)
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=
```

### Interactive Components Mapping
1. **`Navbar.tsx`**:
   - Add WhatsApp connection status pill and button to open `WhatsAppModal`.
2. **`WhatsAppModal.tsx`** (*New Component*):
   - Status indicators (Connected / Awaiting QR / Disconnected).
   - QR code canvas/image view when session is unlinked.
   - Recipient list preview (masked for privacy).
   - "Send Instant Test Message" trigger.
   - Delivery log table showing past dispatches with timestamps and delivery outcomes.
3. **`DailyBriefing.tsx`**:
   - Add **"Send WhatsApp Flash"** button with loading state (`LoaderCircle`), error handling, and success notifications.
4. **`TankerDispatchReport.tsx`**:
   - Add **"Send WhatsApp Manifest"** button with critical candidate counts.
5. **`whatsappService.ts`** (*New Engine*):
   - Formats clean WhatsApp markdown messages for Executive Flash & Tanker Dispatch.
   - Dispatches messages to configured numbers.
   - Maintains connection state and recent activity history.

---

## 5. Verification & Quality Plan

1. **Static Validation**:
   - Execute `compile_applet` and `lint_applet` to ensure zero compilation or TypeScript errors.
2. **Unit Testing (`node:test`)**:
   - Add unit tests for `whatsappService.ts` verifying message template output, number sanitization, and fallback error handling.
3. **Live Execution Verification**:
   - Verify that clicking the button in the UI triggers `/api/whatsapp/send-briefing` and updates status correctly without page reloads.
