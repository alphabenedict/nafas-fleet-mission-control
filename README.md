# Nafas Clean Air Zone™ | Fleet Mission Control

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

An enterprise real-time fleet health monitoring, intelligent bad-alert triage, and automated maintenance cycle platform for all active **Clean Air Zone (CAZ)** client deployments.

Federates live IoT telemetry from **MySQL Prod** (`nafas_mydevice`) with CRM, contracts, and technician fieldwork data from **NeonDB Mini-ERP** (`neondb`).

---

## Key Features

* **Live Fleet Uptime SLA Scorecard:** Tracks online vs. offline devices across 279+ active client locations and 6,800+ hardware units with continuous SLA calculation.
* **Intelligent Bad Alert Engine:**
  - 🚨 **Silent Dropout Alert:** Auto-flags purifiers that go offline >24h while room monitors are active (eliminates undetected device failure blindspots).
  - ⚡ **Site-Wide Blackout Warning:** Correlates simultaneous multi-device disconnects within the same location (tenant travel vs hardware failure).
  - 💨 **Pollution Threshold Breach:** Alerts on indoor PM₂.₅ > 25 µg/m³ or CO₂ > 1,200 ppm.
  - 🔧 **Filter Depletion Trigger:** Flags filters with <15% remaining life.
* **Automated Maintenance Cycle Engine:**
  - Automatically calculates upcoming **Filter Cleaning** (+120 days) and **Filter Replacement** (+240 days) target dates from Mini-ERP milestones and fieldwork service history.
  - Countdown badges: **Overdue** (red), **Due Soon <14d** (amber), **On Track** (emerald).
* **Client Drilldown Drawer:** Room-by-room telemetry, live sensor values (PM₂.₅, CO₂, AQI), filter life gauges, and technician service logs.

---

## Quick Start

### 1. Local Run with Python Virtual Environment

```bash
# Clone the repository
git clone https://github.com/alphabenedict/nafas-fleet-mission-control.git
cd nafas-fleet-mission-control

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Run FastAPI server
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000` in your browser.

---

### 2. Docker Deployment

```bash
# Build and run with Docker Compose
docker compose up -d --build

# View container logs
docker compose logs -f
```

---

## Architecture & Data Flow

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│       MySQL Prod (Telemetry)        │     │       NeonDB (Mini-ERP Operations)   │
│  • tb_mydevice (3.5k+ active IoT)    │     │  • projects (295 client deployments) │
│  • tb_mydevice_measurement_hourly    │     │  • rooms & dimensions (CADR/m³)      │
│  • tb_mydevice_power_hourly (kWh)    │     │  • devices (6.7k+ serial mappings)   │
│  • tb_associate_outdoor              │     │  • project_milestones (Filter Dates) │
└──────────────────┬───────────────────┘     └──────────────────┬───────────────────┘
                   │                                            │
┌──────────────────▼───────────────────┐     ┌──────────────────▼───────────────────┐
│       MongoDB (Billing & Finance)    │     │    NeonDB Cloud (Tactical CRM)       │
│  • invoices (2,620 billed invoices)  │     │  • deals (915 sales opportunities)   │
│  • PAID vs OVERDUE status            │     │  • clients (693 company accounts)    │
│  • Payment gateway receipts          │     │  • contacts (487 key stakeholders)   │
└──────────────────┬───────────────────┘     └──────────────────┬───────────────────┘
                   │                                            │
                   └─────────────────────┬──────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │       Fleet Data Aggregator Engine      │
                    │   (FastAPI Backend / Python Service)    │
                    │  • Entity reconciliation (Loc UUID)     │
                    │  • Real-time connectivity & SLA scoring │
                    │  • Multi-factor Bad Alert Engine        │
                    │  • Maintenance cycle auto-projector     │
                    │  • Tactical Sales CRM pipeline sync     │
                    └────────────────────┬────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │      Interactive Executive Dashboard    │
                    │         (Tailwind UI / Web App)         │
                    │  • Executive KPI Cards                  │
                    │  • Alert Triage Center                  │
                    │  • Client Fleet Directory               │
                    │  • Room Telemetry & Maintenance Drawer  │
                    │  • Tactical Sales CRM Summary & Deals   │
                    └─────────────────────────────────────────┘
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Healthcheck and telemetry cache status |
| `GET` | `/api/fleet/summary` | Top-level KPI counts, global SLA uptime %, and alert totals |
| `GET` | `/api/fleet/alerts` | Active Bad Alert feed (Critical & Warning) |
| `GET` | `/api/fleet/clients` | Filterable client directory with search, status, and maintenance dates |
| `GET` | `/api/fleet/client/{project_id}` | Detailed client breakdown (rooms, devices, milestones, reports) |
| `POST` | `/api/fleet/refresh` | Force-sync telemetry cache from live databases |
| `GET` | `/api/tactical/summary` | Live tactical sales pipeline metrics (Won MRR, TCV, deal stages) |
| `GET` | `/api/tactical/deals` | Filterable tactical deals directory (`?stage=...&search=...`) |

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `MYSQL_HOST` | `20.195.112.209` | MySQL Prod ProxySQL host |
| `MYSQL_PORT` | `6033` | MySQL Prod port |
| `MYSQL_DB` | `nafas_mydevice` | Device telemetry database |
| `PG_HOST` | `4.144.141.244` | NeonDB Mini-ERP PostgreSQL host (Azure replica) |
| `PG_PORT` | `5432` | NeonDB Mini-ERP port |
| `PG_DB` | `neondb` | Mini-ERP operational database |
| `MONGO_HOST` | `20.24.141.186` | MongoDB host |
| `MONGO_PORT` | `27017` | MongoDB port |
| `MONGO_DB` | `billing` | Financial invoices database |
| `TACTICAL_PG_URI` | `postgresql://...` | Tactical Sheet NeonDB connection string |
| `TACTICAL_PG_HOST` | `ep-misty-unit...` | Tactical Sheet NeonDB host |
| `TACTICAL_PG_DB` | `neondb` | Tactical Sheet CRM database |
| `CACHE_TTL_SECONDS` | `300` | In-memory cache validity window |

---

## License

Proprietary © 2026 Nafas (PT Nafas Solusi Kualitas Udara). All rights reserved.
