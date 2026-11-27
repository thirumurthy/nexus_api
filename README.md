# Nexus Pulse EV — Scooter Sync & Fleet Telemetry API

> **⚠️ EDUCATIONAL & RESEARCH STUDY ONLY**  
> This backend service was built strictly for **educational purposes, reverse engineering (REA) telemetry analysis, and AI model orchestration research**. It is an independent, non-commercial proof-of-concept exploring cloud telemetry ingestion, multi-provider LLM benchmarking (Gemini, Mistral, Groq, NVIDIA NIM), and automotive data analytics.  
> **It is NOT an official API, is NOT affiliated with any vehicle manufacturer, and is NOT intended for commercial deployment.**

---

## 🔬 Educational Purpose, REA & AI Learning Testbed

This backend was built to explore cloud-scale automotive telemetry ingestion and modern AI orchestration:

### 1. Reverse Engineering (REA) Telemetry Ingestion
- **Protocol Decoding & Normalization**: Studying the architectural patterns needed to reliably ingest raw, decompiled IoT vehicle telemetry packets over high-throughput REST and WebSocket connections.
- **Battery & Telemetry Matrix Reconstruction**: Designing schema normalization pipelines for 16-cell LFP battery balance matrixes, odometer deltas, and energy dissipation calculations.
- **Device ID Privacy & Isolation**: Using cryptographic salting and hashing (`toDeviceKey`), ensuring multi-scooter isolation without storing plain-text hardware identifiers.

### 2. Multi-Provider AI Engine & Benchmark Lab
- **Swappable AI Architecture**: A unified abstraction layer allowing instant runtime switching between Google Gemini, Mistral AI, Groq Cloud, NVIDIA NIM, OpenRouter, Cohere, and local Ollama instances.
- **Neural Copilot & Dynamic Insights**: Benchmarking LLM latency, response accuracy, and cost when generating contextual EV driving critiques and maintenance forecasting from live telemetry.
- **Zero-Downtime Deterministic Fallback**: Automatic failover to local mathematical EV physics models when cloud AI providers exceed rate limits.

---

## 🏗️ Project Structure

```
api/index.js              Vercel serverless entry
src/app.js                Express app & middleware
src/server.js             Local dev server
src/config/               Environment & cached Mongo connection
src/ai/                   Swappable AI Provider System
  ├── aiProviderManager.js  Multi-provider orchestrator & auto-cascade engine
  ├── aiCoachService.js     Nexus Neural Copilot & Dynamic Insights generator
  └── providers/            Groq, Mistral, NVIDIA NIM, Google Gemini, OpenRouter, Cohere, Ollama, Fallback
src/models/               Scooter, Trip, DailyUsage, SyncLog
src/controllers/          Sync, Scooter, Trips, AI, Admin endpoints
src/services/             Insights & ownership savings calculations
src/middleware/           Zod validation, API key check, error handling
src/routes/               REST API route definitions
src/views/dashboard.html  Interactive Fleet Admin & AI Hub
vercel.json               Vercel serverless deployment config
```

---

## 🤖 Swappable Free AI Providers

The API features a dynamic AI adapter with runtime switching and auto-fallback cascading.

### Supported Providers:
| Provider | Default Model | Free Tier Details | Config Var |
|---|---|---|---|
| **Groq Cloud** | `openai/gpt-oss-120b` | Ultra-fast GPT-OSS 120B/20B, generous free limits | `GROQ_API_KEY` |
| **Mistral AI** | `mistral-small-latest` | Mistral Small & Open Mistral 7B free tier | `MISTRAL_API_KEY` |
| **NVIDIA NIM** | `nvidia/nemotron-3.5-lightning-30b-a3b` | Free developer inference credits at build.nvidia.com | `NVIDIA_API_KEY` |
| **Google AI (Gemini)** | `gemini-2.0-flash` | Gemini 2.0 Flash & 1.5 Flash generous free tier | `GEMINI_API_KEY` |
| **OpenRouter** | `nvidia/nemotron-3.5-lightning:free` | Free models aggregator (`:free` models) | `OPENROUTER_API_KEY` |
| **Cohere** | `command-r-08-2024` | Cohere trial keys | `COHERE_API_KEY` |
| **Local Ollama** | `llama3.2` | 100% offline, zero-cost inference (`http://localhost:11434`) | `OLLAMA_BASE_URL` |
| **Local Physics Fallback** | `nexus-physics-v1` | Deterministic EV physics engine (zero downtime fallback) | Built-in |

### Switching Providers:
1. **Via Environment Variable (`.env`):**
   ```env
   ACTIVE_AI_PROVIDER=auto    # 'auto' cascades through available keys
   # Or lock to a specific provider:
   ACTIVE_AI_PROVIDER=groq    # 'mistral', 'nvidia', 'google', 'openrouter'
   ```
2. **Via REST API (At runtime without restarting the server):**
   ```bash
   POST /api/ai/provider
   Content-Type: application/json

   {
     "provider": "mistral"
   }
   ```
3. **Via the Admin Dashboard (`/admin`):**
   - Click the **AI: Auto** button in the top navigation bar to open the AI Provider Manager modal.
   - Click "Switch To" on any provider or benchmark its latency in real-time.

---

## 📡 REST API Overview

### 1. AI & Copilot APIs
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/providers` | List all providers, active model, and key setup status |
| `POST` | `/api/ai/provider` | Dynamically switch active AI provider |
| `POST` | `/api/ai/test` | Test connectivity and benchmark response latency |
| `POST` | `/api/ai/chat` | Generic copilot chat query |
| `GET` | `/api/scooter/:deviceId/ai-coach` | Get AI Neural Copilot Coaching & Eco Score |
| `POST` | `/api/scooter/:deviceId/ai-coach/refresh` | Force regenerate AI coaching tips with fresh telemetry |
| `POST` | `/api/scooter/:deviceId/ai-copilot/chat` | Contextual conversational copilot injected with scooter live telemetry |

### 2. Core Telemetry & Home HUD APIs
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scooter/sync` | Ingest vehicle live state (`0xFF11`) & battery (`0xFF12`) packets |
| `GET` | `/api/scooter/:deviceId/live` | Live HUD telemetry: today's km, avg speed, battery used, goal % |
| `GET` | `/api/scooter/:deviceId/insights` | Full insights: ownership savings (₹), CO2 offset, energy dynamics |

### 3. Trips & Cadence APIs (Trips Tab)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scooter/:deviceId/cadence?range=7D` | Cadence trend aggregation (`3D`, `7D`, `30D`, `1Y`) |
| `GET` | `/api/scooter/:deviceId/trips` | Recent ride journeys list + latest completed ride spotlight |
| `POST` | `/api/scooter/:deviceId/trips` | Record a completed trip session with GPS and telemetry |
| `GET` | `/api/scooter/:deviceId/trips/:tripId` | Get detailed trip metrics & velocity profiles |
| `POST` | `/api/scooter/:deviceId/trips/:tripId/analyze` | Request AI ride critique and efficiency feedback |
| `GET` | `/api/scooter/:deviceId/daily?from=&to=` | Day-by-day travel distance and SoC consumed |
| `GET` | `/api/scooter/:deviceId/monthly?months=6` | Month-over-month usage trends |

### 4. Hardware Controls & Diagnostics (Scooter Tab)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scooter/:deviceId/control` | Remote commands: `LOCK`, `UNLOCK`, `BOOT_RELEASE`, `SIREN_PING`, `FLASH_HAZARDS`, `SET_CLUSTER_MODE` |
| `GET` | `/api/scooter/:deviceId/diagnostics` | LFP 16-cell voltage delta matrix (51.2V, cell delta, SOH) & MCU status |
| `POST` | `/api/scooter/:deviceId/diagnostics/scan` | Trigger full diagnostic scan & cell balancing calibration |

### 5. Settings & Maintenance APIs
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scooter/:deviceId/settings` | Riding modes, regen strength, hill hold, reverse assist toggles |
| `PATCH` | `/api/scooter/:deviceId/settings` | Update rider preferences & cluster configuration |
| `GET` | `/api/scooter/:deviceId/export?format=json|csv` | Export ride data in CSV or JSON |
| `GET` | `/api/scooter/:deviceId/maintenance` | Official maintenance checklist & service schedule roadmap |

### 6. Admin & Fleet Insights APIs
| Method | Path | Description |
|---|---|---|
| `GET` | `/admin` or `/dashboard` | **Interactive Admin & Fleet Insights Web Dashboard** |
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/admin/overview` | Fleet-wide analytics: total distance, petrol/CO2 savings, 14d trend |
| `GET` | `/api/admin/scooters?search=` | List and search all registered scooters |
| `GET` | `/api/admin/scooter/:deviceKey` | Single scooter telemetry, battery health, trips, and raw sync logs |
| `PATCH` | `/api/admin/scooter/:deviceKey/name` | Assign friendly scooter name (e.g. `{ "name": "Thiru's Nexus" }`) |

---

## 🚀 Running Locally

```bash
cd F:\Thiru\nexus_api

# 1. Install dependencies
npm install

# 2. Configure environment variables
# Copy .env.example to .env and fill in MONGODB_URI and your AI keys:
# GROQ_API_KEY, MISTRAL_API_KEY, NVIDIA_API_KEY, GEMINI_API_KEY
npm run dev

# 3. Open browser
http://localhost:3000/admin
```

---

## ☁️ Deploying on Vercel

1. Push your repository to GitHub.
2. In Vercel, click **Add New > Project** and import the repository.
3. In **Settings > Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas connection URI
   - `DEVICE_SALT`: Long random string for MAC hashing
   - `ACTIVE_AI_PROVIDER`: `auto`
   - `GROQ_API_KEY`, `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, `GEMINI_API_KEY` (as available)
   - `API_KEY`: (Optional) Secret key to protect endpoints with `x-api-key` header
4. In MongoDB Atlas **Network Access**, ensure `0.0.0.0/0` is allowed (Vercel serverless IPs are dynamic).
5. Deploy and visit `https://<your-project>.vercel.app/admin`.

---

## ⚠️ Legal Notice & Disclaimers

1. **Non-Affiliation**: This backend service has **no affiliation, association, authorization, endorsement by, or any official connection with Greaves Electric Mobility Ltd., Ampere Vehicles, or any of their subsidiaries or affiliates**.
2. **Trademarks**: The names "Ampere", "Nexus", and related trademarks, trade names, emblems, and images are registered trademarks of their respective owners. Their mention in this repository is strictly for identification, nominative reference, and educational research purposes under fair use.
3. **Strictly Non-Commercial**: This repository is developed solely for academic and educational learning regarding EV telemetry architectures, reverse engineering (REA) concepts, and AI provider integrations. It is not intended for commercial usage.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
