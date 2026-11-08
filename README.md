# Cloud Consultancy — Omni-Channel Outreach Engine & Enterprise B2B CRM

[![React 18](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-teal.svg)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-5.2-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Nodemailer](https://img.shields.io/badge/Zoho_Mail-SMTP_%26_IMAP-green.svg)](https://www.zoho.com/mail/)
[![Baileys WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys_Web_v7-25D366.svg)](https://github.com/WhiskeySockets/Baileys)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-orange.svg)](https://ollama.com/)
[![Render](https://img.shields.io/badge/Render-Ready_Deploy-46E3B7.svg)](https://render.com/)

A modern, production-grade **B2B Omni-Channel Cold Outreach Platform and Enterprise Sales CRM** designed for digital agencies, consultants, and growth teams. It brings together high-volume lead ingestion, Google Business Profile scraping, AI-powered message generation, automated multi-touch drip sequencing across **Email, WhatsApp, Website Forms, and LinkedIn**, with a full **Attio/HubSpot-caliber CRM pipeline**.

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend Client (React 18 + Vite + Tailwind CSS)"]
        UI["Modern Web Interface"]
        CMD["Command Palette (Cmd+K)"]
        CRM["3-Way CRM Hub\n(Contacts Table • Deals Kanban • Dispatch Hub)"]
        Drawer["HubSpot-Style 360° Lead Drawer\n(Timeline • Deals • Tasks • Cadence)"]
        Health["Deliverability Center & Auto-Throttling"]
        Inbox["Multi-Channel Inbox & Messenger"]
    end

    subgraph API ["Backend API (Node.js + Express 5 TypeScript)"]
        AuthMiddleware["Security & Auth Barrier\n(Session Tokens • Path Traversal Guards)"]
        Router["Channel-Aware Send Router"]
        DripEngine["Autonomous Drip & Cadence Engine"]
        InboundAgent["Autonomous Inbound AI Agent\n(Sentiment & Intent Classification)"]
        IMAPSync["Zoho IMAP 30s Inbound Poller"]
        KeepAlive["12-Min Render Sleep-Prevention Heartbeat"]
    end

    subgraph External ["External Delivery & AI Providers"]
        ZohoSMTP["Zoho Mail SMTP\n(smtppro.zoho.in:465)"]
        ZohoIMAP["Zoho Mail IMAP\n(imappro.zoho.in:993)"]
        WhatsAppBridge["Baileys WhatsApp Web\n(QR Pairing + Anti-Disconnect)"]
        PuppeteerChrome["Headless Chrome / Chromium\n(Google Maps & Website Form Submitter)"]
        OllamaLLM["Local Ollama LLM\n(Llama 3.1 8B / Mistral 7B)"]
    end

    subgraph Storage ["PostgreSQL 16 Relational Database"]
        DB_Leads["leads (24 attributes, stages, verification)"]
        DB_Deals["deals (7 stages, values, probabilities)"]
        DB_Tasks["tasks (due dates, priorities, checkmarks)"]
        DB_Activities["activity_logs (chronological audit history)"]
        DB_Sessions["whatsapp_session_keys (survives container restarts)"]
        DB_Suppression["global_suppression_list (opt-outs & hard bounces)"]
        DB_Dispatches["scheduled_dispatches & daily_send_metrics"]
    end

    UI --> API
    API --> DB_Leads
    API --> DB_Deals
    API --> DB_Tasks
    API --> DB_Activities
    API --> DB_Sessions
    API --> DB_Suppression
    API --> DB_Dispatches

    Router --> ZohoSMTP
    IMAPSync --> ZohoIMAP
    Router --> WhatsAppBridge
    Router --> PuppeteerChrome
    DripEngine --> OllamaLLM
    InboundAgent --> OllamaLLM
```

---

## 2. Key Modules & Features

### 2.1 Enterprise B2B CRM & Deals Pipeline
* **Executive Top-Line KPI Bar**: Live metrics at the top of the CRM: Total Pipeline Value, Active Prospects, Hot Prospects, Inbound Threads, and Won Retainers.
* **3-Way View Switcher**:
  1. `[📋 Leads & Contacts Table]`: High-density accounts table with company avatar initials, executive contact persons, verified channel badges, estimated deal values, and interactive pipeline stage dropdowns with 1-click database updates.
  2. `[📊 Deals Pipeline (Kanban)]`: 7-stage visual Kanban board (`Interested` → `Audit Sent` → `Meeting Booked` → `Proposal Sent` → `Negotiation` → `Won` → `Lost`) with stage totals, search, and a `+ New Deal` opportunity creator.
  3. `[⚡ Multi-Channel Dispatch Hub]`: Cadence dispatching and multi-channel campaign automation.
* **HubSpot-Grade 360° Lead Activity Drawer**:
  * **Profile Overview**: Company initials avatar with vibrant gradient, verified primary contact with executive title, deal value tag, lead intent score (`🔥 94 Hot`), and location with country flag.
  * **Quick Action Dock**: Direct 1-click buttons to send an **Email**, launch **WhatsApp**, make a **Phone Call**, view **LinkedIn**, or open the **Website**.
  * **Interactive Stage Selector**: Change lead stage (e.g. from *Contacted* to *Meeting Scheduled* or *Won*) with immediate database persistence.
  * **Timeline & Activity Logger**: Interactive quick logger for **Sales Notes**, **Phone Calls**, and **Strategy Meetings**, plus a chronological audit feed showing message history and stage changes.
  * **Deals & Revenue Tab**: View all active and closed opportunities for this company, or log a new contract directly from the drawer.
  * **Tasks & Reminders Tab**: Interactive checklist to toggle completed follow-ups or assign new tasks with due dates.
  * **Automated Cadence Tab**: Multi-touch sequence status.

### 2.2 Omni-Channel Outreach Engine
* **Live Outbound Email via Zoho Mail**:
  * Authenticated SSL delivery via `smtppro.zoho.in:465`.
  * Multi-inbox rotation with configurable daily limits and deliverability health monitoring.
  * Dynamic template generation with consultative hooks, personalization, and anti-hype copy.
* **Inbound Reply Synchronization (IMAP)**:
  * Connects to `imappro.zoho.in:993` via `imapflow` and `mailparser`.
  * Background worker runs every 30 seconds to fetch incoming client emails.
  * Strips email quote trees and matches sender email to leads in PostgreSQL.
  * Real-time floating alert cards notify the user of new incoming replies instantly.
* **WhatsApp Web Integration (Baileys v7)**:
  * QR Code pairing for live WhatsApp communication.
  * **PostgreSQL Session Persistence**: Session keys are stored directly in PostgreSQL (`whatsapp_session_keys` table), ensuring sessions survive Render container redeploys and ephemeral disk resets.
  * International country code standardization (+91, +1, +44, +61) to prevent failed dispatches.
* **Website Contact Form Submitter**:
  * Headless Chrome detection of contact form endpoints (`/contact`, `/reach-us`, WordPress, Webflow, Squarespace).
  * Automated personalized inquiry dispatch.
* **LinkedIn Outreach Hub**:
  * Unicode post beautifier (bold/italic formatting for mobile & desktop feeds).
  * Direct profile deep-links and comment queue workflow.

### 2.3 Lead Scraper & Data Ingestion
* **Google Business Profile Scraper (GMB 100)**: Scrapes up to 100 local businesses per query with star rating, review volume, address, website, and phone numbers using headless Chrome.
* **Dual Ingestion Modes**: Single lead manual entry or bulk CSV/paste import with dual-table deduplication against active leads and paying clients.
* **Automated Channel List Assignment**: PostgreSQL database triggers automatically sort leads into dedicated channel lists (`Email Leads`, `WhatsApp Leads`, `LinkedIn Leads`, `Website Leads`) based on verified contact channels.

### 2.4 Autonomous Drip & Cadence Engine
* **Condition-Based Sequencing**:
  * Stage 0: `initial` (First message / tailored intro pitch)
  * Stage 1: `followup_1` (Value proposition / quick review findings)
  * Stage 2: `followup_2` (Soft nudge / audit offer)
  * Stage 3: `followup_3` (Final break-up / parting value note)
  * Stage 4: `completed` (Sequence finished)
* **Automated Agency Audit PDF Generator**: Builds high-converting, professional technical performance audits in PDF format for prospective clients.

### 2.5 Deliverability Shield & Suppression
* **Global Suppression Register**: Instant suppression for unsubscribed or opted-out contacts (`stop`, `unsubscribe`, `remove`, `cancel`).
* **Auto-Quarantine on Bounce**: Automatically moves invalid email addresses to the `manual_review` queue to protect domain sender reputation.
* **Auto-Throttling**: Halts cold outreach automatically if bounce rate exceeds 5% or spam complaint rate exceeds 0.3%.

### 2.6 Five-Slot Sender Grid & Multi-Mailbox Architecture
* **Strict Grid Timing (10-Min Cycle, 2-Min Offset)**:
  * 5 parallel virtual slots (`A`, `B`, `C`, `D`, `E`).
  * Each slot is assigned an offset: Slot A at :00, Slot B at :02, Slot C at :04, Slot D at :06, Slot E at :08, repeating cyclically every 10 minutes.
  * Dispatches never overlap; strict tick re-entrancy guards prevent double-sends even under heavy load.
* **Multi-Mailbox Slot Mapping (`connected_inboxes`)**:
  * Slots map mailboxes using modulo routing (`inboxes[slotIndex % inboxCount]`).
  * If 1 mailbox is configured (e.g., `cloudconsultancy.ad@gmail.com`), all 5 slots use it safely on the staggered grid without collision.
  * If 5 distinct mailboxes are added, each slot operates with its own dedicated sender identity.
* **Rolling JIT Audit Dispatch**:
  * Audits are dispatched to the diagnostic engine just-in-time only for top-queued leads within the active horizon, preventing queue starvation.

### 2.7 Audit Lifecycle: Post-Send Purge & On-Demand Redownload
* **Storage Optimization via Instant Purge**:
  * When an email with a PDF audit is successfully dispatched via SMTP, Nodemailer transmits the document to the lead and simultaneously syncs the full RFC 822 email payload (with attachment) to the Gmail/Zoho `Sent` folder via IMAP (`emailSentSyncService`).
  * Immediately upon successful delivery, the local PDF file on disk is deleted (`fs.unlinkSync`), and database pointers (`audit_pdf_path`, `audit_pdf_name`) are set to `NULL`.
* **On-Demand Audit Redownload**:
  * If team members or clients need to retrieve the audit later, the system provides on-demand generation and retrieval via `GET /api/audit/redownload/:leadId` or `GET /api/audit/lead/:leadId/pdf`, reconstructing the PDF dynamically from the lead's stored diagnostic metrics.

### 2.8 Consultative Humanoid Copywriting (Zero AI Watermark & Zero Unsubscribe)
* **Humanoid, Authentic Tone**:
  * Employs a conversational, peer-to-peer consulting tone without robotic disclosures or corporate fluff.
  * Strictly adheres to natural human greetings matching `/^(Hi [A-Z][a-z]+|Hi there|Hello .+ team),$/`.
  * Embeds actual technical data from the audit, including Lighthouse mobile scores (e.g. `42/100`), exact Core Web Vitals (LCP, CLS, FCP) timings, and specific page asset bottlenecks.
* **Zero Unsubscribe Disclaimers**:
  * All unsubscribe URLs, opt-out footers, and email headers (`List-Unsubscribe`, `List-Unsubscribe-Post`) have been completely removed to maintain clean, 1-to-1 personal executive correspondence.

---

## 3. Database Schema Overview

```mermaid
erDiagram
    LEADS ||--o{ CONVERSATIONS : "has threads"
    LEADS ||--o{ DEALS : "has deals"
    LEADS ||--o{ TASKS : "has tasks"
    LEADS ||--o{ ACTIVITY_LOGS : "logs history"
    LEADS ||--o{ LEAD_LIST_MEMBERSHIPS : "belongs to"
    CONVERSATIONS ||--o{ MESSAGES : "contains"
    DEALS ||--o{ TASKS : "has tasks"
    LISTS ||--o{ LEAD_LIST_MEMBERSHIPS : "contains"

    LEADS {
        uuid id PK
        varchar business_name
        varchar primary_contact_name
        varchar category
        varchar phone
        varchar email
        varchar website
        varchar location
        varchar country
        varchar outreach_stage
        varchar status
        timestamptz last_contacted_at
        jsonb metadata
    }

    DEALS {
        uuid id PK
        uuid lead_id FK
        varchar title
        numeric value
        varchar stage
        integer probability
        date expected_close_date
    }

    TASKS {
        uuid id PK
        uuid lead_id FK
        uuid deal_id FK
        varchar title
        date due_date
        varchar priority
        varchar status
    }

    ACTIVITY_LOGS {
        uuid id PK
        uuid lead_id FK
        uuid deal_id FK
        varchar activity_type
        varchar title
        text description
        timestamptz created_at
    }

    CONVERSATIONS {
        uuid id PK
        uuid lead_id FK
        varchar channel
        varchar status
        timestamptz last_message_at
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        varchar channel
        varchar direction
        text text
        timestamptz sent_at
    }

    GLOBAL_SUPPRESSION_LIST {
        uuid id PK
        varchar email
        varchar phone
        varchar reason
        timestamptz created_at
    }

    WHATSAPP_SESSION_KEYS {
        varchar key_id PK
        text key_data
        timestamptz updated_at
    }
```

---

## 4. Local Quick Start

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **PostgreSQL**: v14.0 or higher running locally on port 5432
* **Ollama** *(Optional)*: If running local AI generation, install from [ollama.com](https://ollama.com) and pull `llama3.1:8b`.

### Step 1: Clone the Repository
```bash
git clone git@github.com:helloujjawal007/Outreach-Dashboard.git
cd Outreach-Dashboard
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```
Edit `.env` with your PostgreSQL database credentials and primary email settings:
```env
PORT=5001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach_dashboard

# Outbound SMTP Sending (Gmail or Zoho)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=cloudconsultancy.ad@gmail.com
SMTP_PASS=your-16-char-google-app-password
SMTP_FROM="Cloud Consultancy" <cloudconsultancy.ad@gmail.com>

# Inbound IMAP Sync (Optional - for auto-capturing incoming prospect replies)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=cloudconsultancy.ad@gmail.com
IMAP_PASS=your-16-char-google-app-password

# Security & Dashboard Login
ADMIN_PASSWORD=admin123
SESSION_SECRET=your-random-32-character-secret-key
```

#### Configuring the 5 Sending Inboxes & App Passwords
The Outreach Engine supports up to 5 rotating sender mailboxes (or 1 mailbox distributed across all 5 slots). You can configure your mailboxes in two ways:

1. **Default / Single Mailbox Mode (via `.env`)**:
   - If no accounts are added to `connected_inboxes`, the 5-slot scheduler uses the credentials specified in `.env` (`SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`).
   - For **Gmail / Google Workspace**:
     - `SMTP_HOST`: `smtp.gmail.com`
     - `SMTP_PORT`: `465` (with `SMTP_SECURE=true`) or `587` (with `SMTP_SECURE=false`)
     - `SMTP_USER`: Your Gmail address (e.g. `cloudconsultancy.ad@gmail.com`)
     - `SMTP_PASS`: A 16-character **Google App Password** (generate via Google Account -> Security -> 2-Step Verification -> App Passwords).

2. **Multi-Mailbox Pool Mode (via `connected_inboxes` Database Table or Dashboard UI)**:
   - For distinct mailboxes assigned to each virtual slot (Slots A through E), inboxes are stored in the `connected_inboxes` table:
     ```sql
     INSERT INTO connected_inboxes (email, name, provider, status, daily_limit, sent_today)
     VALUES
       ('agent1@cloudconsultancy.in', 'Agent 1', 'gmail', 'active', 50, 0),
       ('agent2@cloudconsultancy.in', 'Agent 2', 'gmail', 'active', 50, 0),
       ('agent3@cloudconsultancy.in', 'Agent 3', 'gmail', 'active', 50, 0),
       ('agent4@cloudconsultancy.in', 'Agent 4', 'gmail', 'active', 50, 0),
       ('agent5@cloudconsultancy.in', 'Agent 5', 'gmail', 'active', 50, 0);
     ```
   - Slot $i$ routes through `inbox[i % count]`. When 1 active mailbox is present, all 5 slots send via that mailbox safely on their respective 2-minute offsets without collision. When 5 mailboxes are present, each slot sends via its dedicated inbox.

### Step 4: Run Database Migrations & Seed
```bash
npm run db:migrate
```
To populate the CRM with realistic enterprise leads, deals, tasks, and activity logs:
```bash
npx tsx server/src/db/seed_realistic_crm.ts
```

### Step 5: Start Development Servers
```bash
npm run dev
```
This concurrently starts:
* **Frontend Web App**: [http://localhost:5173](http://localhost:5173)
* **Express API Server**: [http://localhost:5001](http://localhost:5001)

---

## 5. Deployment on Render.com

The repository is pre-configured for one-click deployment on Render.

### Deployment Configuration (`render.yaml`)
* **Service Type**: Web Service
* **Runtime**: Node
* **Build Command**: `./render-build.sh` (installs dependencies, builds Vite frontend, installs headless Chrome, runs migrations)
* **Start Command**: `npm start` (launches `server/src/index.ts`)

### Required Render Environment Variables
In your Render Dashboard (**Web Service → Environment Variables**), configure:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production environment flag |
| `PORT` | `5001` | Server listening port |
| `DATABASE_URL` | `postgresql://...` | Connection URL to Cloud Postgres ([Neon](https://neon.tech) or [Supabase](https://supabase.com)) |
| `SMTP_HOST` | `smtppro.zoho.in` | Outbound Zoho SMTP host |
| `SMTP_PORT` | `465` | SSL port |
| `SMTP_SECURE` | `true` | Enforce SSL connection |
| `SMTP_USER` | `sales@cloudconsultancy.in` | Sender email address |
| `SMTP_PASS` | *(Zoho App Password)* | Generated Zoho Application-Specific Password |
| `SMTP_FROM` | `"Cloud Consultancy" <sales@...>` | From header display |
| `IMAP_HOST` | `imappro.zoho.in` | Inbound Zoho IMAP host |
| `IMAP_PORT` | `993` | IMAP SSL port |
| `ADMIN_PASSWORD` | `your-secure-password` | Dashboard authentication password |
| `SESSION_SECRET` | `your-random-32-char-key` | Session encryption secret |

### Render Reliability Built-ins
1. **15-Minute Sleep Prevention**: Express runs a 12-minute keep-alive ping loop against `RENDER_EXTERNAL_URL` to prevent the service from sleeping on the Free tier.
2. **Ephemeral Disk Resilience**: WhatsApp Web authentication keys are stored in PostgreSQL (`whatsapp_session_keys`), not on disk, so pairing remains active across redeployments.
3. **Headless Chrome for Scraping**: `render-build.sh` installs Chrome into `./chrome-bin`, enabling Google Business Profile lead scraping in Linux cloud containers.

---

## 6. Project Structure

```
Outreach-Dashboard/
├── .env.example                    # Environment variable template
├── Dockerfile                      # Production Docker container configuration
├── render-build.sh                 # Render build script (Vite + Chrome + Migrations)
├── render.yaml                     # Render Infrastructure as Code definition
├── package.json                    # Scripts and dependencies
├── tailwind.config.js              # Tailwind styling theme
├── vite.config.ts                  # Vite bundling config with API proxy
├── scripts/
│   └── keep-alive.js               # Standalone 24/7 pinger bot
├── server/
│   ├── src/
│   │   ├── adapters/               # Channel adapters (email, whatsapp, instagram, facebook)
│   │   ├── config/                 # DB pool, environment typing, caching
│   │   ├── db/                     # Migrations, schemas, realistic CRM seeders
│   │   ├── middleware/             # Auth barrier, session validator, rate limiters
│   │   ├── routes/                 # Express API route handlers
│   │   │   ├── activities.ts       # Lead activity history & logging
│   │   │   ├── auth.ts             # Session login & logout
│   │   │   ├── conversations.ts    # Multi-channel messaging & IMAP sync
│   │   │   ├── deals.ts            # Sales pipeline CRUD & stage changes
│   │   │   ├── inboxes.ts          # Rotating inbox pool & health checks
│   │   │   ├── leads.ts            # Leads CRUD, stages, bulk import
│   │   │   ├── scraper.ts          # Google Maps lead scraping endpoints
│   │   │   ├── sequences.ts        # Cadence steps & enrollments
│   │   │   ├── suppression.ts      # Global suppression register
│   │   │   └── tasks.ts            # CRM follow-up tasks
│   │   ├── services/               # Core business logic services
│   │   │   ├── autonomousDripEngine.ts        # Autonomous sequence evaluator
│   │   │   ├── emailInboundService.ts         # IMAP reply fetcher & parser
│   │   │   ├── gmbScraperService.ts           # Headless Google Maps extractor
│   │   │   ├── technicalAuditPdfService.ts    # Agency audit PDF generator
│   │   │   ├── whatsappPostgresAuth.ts        # Baileys Postgres session store
│   │   │   └── whatsappSessionService.ts     # WhatsApp QR pairing & listener
│   │   └── index.ts                # Express server entrypoint
│   └── tsconfig.json
└── src/
    ├── components/                 # Modals, drawer, badge, channel icons
    │   ├── CommandPalette.tsx      # Cmd+K quick navigation palette
    │   ├── LeadActivityDrawer.tsx  # 360° HubSpot-grade CRM lead drawer
    │   ├── InboundRepliesModal.tsx # Multi-channel messenger & inbox
    │   └── SuppressionListModal.tsx# Global suppression management
    ├── pages/
    │   ├── CrmPage.tsx             # 3-Way CRM Hub (Table, Kanban, Dispatch)
    │   ├── DealsPipelinePage.tsx   # Standalone Deals Kanban board
    │   ├── LeadImportPage.tsx      # CSV & raw text lead ingestion
    │   ├── LeadScraperPage.tsx     # Google My Business lead scraper
    │   ├── LoginPage.tsx           # Dashboard access gate
    │   └── SendingHealthPage.tsx   # Deliverability & warm-up metrics
    ├── services/
    │   └── api.ts                  # Typed Axios/Fetch API client
    ├── store.ts                    # Global React state store
    ├── types.ts                    # Core TypeScript models
    └── App.tsx                     # Main layout & router
```

---

## 7. Security Best Practices
* **Zero Credential Leaks**: `.env` is strictly excluded in `.gitignore`.
* **Path Traversal Protection**: The Express server inspects all request paths for null bytes, relative traversal tokens (`..`, `\`), and hidden configuration files (`.env`, `.git`).
* **Session Security**: Session tokens are encrypted and transmitted via HTTP-only security standards.
* **Strict Suppression**: Contacts who opt out or bounce are globally barred from future cold campaigns across all channels.

---

## 8. License

This project is proprietary software developed for Cloud Consultancy. All rights reserved.
