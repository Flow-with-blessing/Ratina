# Ratina.ai — Amazon Product Intelligence API & MCP Server

> **The Amazon Review Intelligence API, without the $99/mo subscription.**  
> Pay $0.018 per investigation through [Monid](https://monid.ai).

---

## ⚡ What Died

| | Helium 10 Review Insights | Ratina (via Monid) |
|---|---|---|
| **Price** | [$99.00 / month](https://www.helium10.com/pricing/) | **$0.018 / run** |
| **Model** | Monthly subscription | Pay-per-call |
| **5,500 analyses cost** | $99.00 | $99.00 |
| **Typical sourcing decision** | 1–3 runs = ~$0.05 | 1–3 runs = ~$0.05 |

> *Verified price: Helium 10 Platinum plan at [$99/mo on helium10.com/pricing](https://www.helium10.com/pricing/) as of September 2026.*

---

## 🔍 What Ratina Does

1. **Discovers competitors** — searches Amazon for any product category, dynamically selects the top 5 competitors by review volume, rating, and relevance.
2. **Scrapes real reviews** — retrieves 50 real customer reviews per competitor via live Monid API calls.
3. **Extracts failure patterns** — context-aware, evidence-weighted failure classification (handles negation, positive context, specification mentions).
4. **Builds a failure matrix** — cross-competitor failure frequency with severity scoring.
5. **Scores the opportunity** — calculates a 0–100 opportunity score from observed evidence.
6. **Generates sourcing specs** — engineering requirements, QA tests, and listing implications for each failure mode.
7. **Delivers a go/no-go decision** — INVESTIGATE / CONDITIONAL GO / STRONG GO with evidence confidence rating.

**Proven on:**
- French Press Coffee Makers (5 competitors, 250 reviews, $0.01815 total Monid cost)
- Portable Blenders (21 candidates discovered, 5 selected, 250 reviews)

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/Ratina.Ai.git
cd Ratina.Ai
npm install
```

### 2. Set your Monid API key
```bash
cp .env.example .env
# Edit .env and add your MONID_API_KEY
```

### 3. Run the API server
```bash
node server/index.js
```

### 4. Run the visual playground (optional)
```bash
npm run dev
```

---

## 🤖 MCP Server (for Claude Desktop / Cursor / Claude Code)

Ratina exposes 3 MCP tools that any AI agent can use:

| Tool | Description | Cost |
|---|---|---|
| `investigate_category` | Full live investigation on any Amazon category | ~$0.018/run |
| `get_failure_matrix` | Cross-competitor failure matrix for a cached category | $0.00 |
| `export_sourcing_brief` | Generate a formatted sourcing brief | $0.00 |

### Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ratina-ai": {
      "command": "node",
      "args": ["server/mcpServer.js"],
      "cwd": "/path/to/Ratina.Ai"
    }
  }
}
```

### Or use the HTTP MCP endpoint:
```bash
curl -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "investigate_category",
      "arguments": { "category": "Portable Blenders" }
    }
  }'
```

---

## 📡 HTTP API

| Endpoint | Method | Description |
|---|---|---|
| `/api/investigate` | POST | Run a full investigation (cached or live) |
| `/api/analyze` | POST | Single-ASIN live analysis |
| `/api/mcp` | POST | MCP-over-HTTP (JSON-RPC 2.0) |
| `/api/export/json` | GET | Download investigation as JSON |
| `/api/export/brief` | GET | Download sourcing brief as text |
| `/api/cache/status` | GET | View cached categories |
| `/api/health` | GET | Server health + budget status |

### Example: Investigate a category
```bash
curl -X POST http://localhost:3001/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"category": "Electric Kettles"}'
```

---

## 💰 Monid Cost Transparency

Every Monid API call is logged with:
- Unique call ID (`mc_...`)
- Timestamp and latency
- Individual and cumulative cost

**Measured costs:**
- Full 5-competitor investigation: **$0.01815**
- Cached repeat query: **$0.00** (instant, ~70ms)

Sprint budget guard: hardcoded $1.00 maximum to prevent runaway spend.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│  Visual Playground (Vite + React)           │
│  Hero "Kill" Banner + Analysis Dashboard    │
└────────────────────┬────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────┐
│  Express API Server (server/index.js)       │
│  /api/investigate  /api/mcp  /api/export/*  │
├─────────────────────────────────────────────┤
│  Investigation Engine  │  Cache Layer       │
│  (investigationEngine) │  (cache.js)        │
├─────────────────────────────────────────────┤
│  Monid Service (monidService.js)            │
│  Live Amazon data via Monid pay-per-call    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  MCP Server (server/mcpServer.js)           │
│  JSON-RPC 2.0 over stdio                   │
│  3 tools for Claude / Cursor / Claude Code  │
└─────────────────────────────────────────────┘
```

---

## 📋 Submission Checklist

- [x] **Target has a real, current, published price I verified** — Helium 10 Platinum [$99/mo](https://www.helium10.com/pricing/)
- [x] **Runs on live data, not mock data, with the Monid call visible** — 11 live Monid calls, $0.01815 receipt
- [x] **Repo or live URL, with commits inside the window** — This repo
- [x] **What died is clear in the first five seconds** — Hero Kill Banner: $99/mo → $0.018/run

---

## License

MIT
