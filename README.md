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
2. **Scrapes real reviews** — retrieves real customer reviews per competitor via live Monid API calls.
3. **Extracts failure patterns** — context-aware, evidence-weighted failure classification (handles negation, positive context, specification mentions).
4. **Builds a failure matrix** — cross-competitor failure frequency with severity scoring.
5. **Scores the opportunity** — calculates a 0–100 opportunity score from observed evidence.
6. **Generates sourcing specs** — engineering requirements, QA tests, and listing implications for each failure mode.
7. **Delivers a go/no-go decision** — INVESTIGATE / CONDITIONAL GO / STRONG GO with evidence confidence rating.
8. **Signs the result** — issues a cryptographic receipt so the report can be verified as untampered.

Every stage is schema-validated before the next one consumes it, and every stage
boundary is streamed to the UI over SSE as it actually completes.

### How the analysis works (and what it is not)

The classification engine is **deterministic**, not generative. Failure
extraction runs on an explicit rule set — per-category failure dictionaries,
clause splitting, negation detection ("never leaks" is not a leak), positive
context filtering, spec-mention filtering, and star-rating evidence weighting.

There is **no LLM in the analysis path**, which is why the same input always
produces the same output, and why there is nothing in the pipeline that can
hallucinate a defect that no reviewer reported.

**Proven on** (figures below match the committed proof artifacts in `temp/`, so you can check them):

| Run | Competitors | Reviews retrieved | Monid calls | Cost |
|---|---|---|---|---|
| Portable Blenders | 21 candidates discovered → 5 selected | 250 (50 each) | 11 | $0.01815 |
| French Press Coffee Makers | 5 | 117 (50/50/11/3/3) | 10 | $0.01800 |

The French Press run is the weaker of the two on purpose: two competitors returned
only 3 reviews each. Ratina reports that as `SPARSE DATASET` and reduces its
evidence confidence rather than treating a thin sample as "no defects found".

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

## 🔐 Verifiable Receipts (cryptographic, not cosmetic)

Every investigation is signed. The receipt is not a metadata label — it is a
real integrity structure:

| Layer | Mechanism | What it proves |
|---|---|---|
| **Content hash** | SHA-256 over canonicalized payload (deterministic key ordering) | No figure in the report changed after issuance |
| **Merkle root** | Binary Merkle tree over every Monid call record, with per-call inclusion proofs | No data call was added, removed, or edited — and any single call can be proven to belong to the run |
| **Hash chain** | Each receipt commits to the previous receipt's hash | Altering receipt N invalidates every receipt after it |
| **Signature** | HMAC-SHA256 over the receipt hash, constant-time compared | The receipt cannot be forged without the server key |

### Try to fake one

```bash
# 1. Export a real investigation
curl -s localhost:3001/api/saved-benchmark | jq '.data' > report.json

# 2. Verify it — passes
curl -s -X POST localhost:3001/api/receipts/verify \
  -H 'Content-Type: application/json' -d @report.json | jq '.verified, .verdict'
# true
# "AUTHENTIC — receipt matches this exact analysis"

# 3. Change one number — inflate the opportunity score
jq '.productOpportunityScore.score = 99' report.json > tampered.json

# 4. Verify again — fails, and names the check that caught it
curl -s -X POST localhost:3001/api/receipts/verify \
  -H 'Content-Type: application/json' -d @tampered.json | jq '.verified, .failedCheck, .reason'
# false
# "CONTENT_HASH"
# "Analysis payload has been modified since the receipt was issued."
```

Recomputing the hashes doesn't help: the receipt hash then fails. Recomputing
that too doesn't help either — the HMAC signature fails, because forging it
requires `RATINA_RECEIPT_SECRET`.

Verify the whole chain: `GET /api/receipts/chain/verify` · Inspect it: `GET /api/receipts/ledger`

> **Set `RATINA_RECEIPT_SECRET` in production.** Without it the server generates
> an ephemeral key at boot and receipts stop verifying after a restart. Generate
> one with `openssl rand -hex 32`.

---

## 📡 Live Progress Streaming (SSE)

Investigations are executed in the background and stream **real** pipeline
phases — every event corresponds to work that actually completed, so a 40-second
Monid call holds the step for 40 seconds instead of advancing on a timer.

```bash
# Start a run (Monid key travels in a header, never in the stream URL)
RUN=$(curl -s -X POST localhost:3001/api/investigate/start \
  -H 'Content-Type: application/json' \
  -d '{"category":"Portable Blenders"}' | jq -r .runId)

# Follow it
curl -N "localhost:3001/api/runs/stream?runId=$RUN"
```

```
event: progress
data: {"phase":"ENRICHMENT","percent":29,"message":"Scraping reviews for B0XXXX (3/5)..."}

event: progress
data: {"phase":"VERIFICATION","percent":100,"message":"Signed receipt issued (1007ccf4ff41f261...)."}

event: complete
data: {"success":true,"data":{...}}
```

Events are buffered per run, so a client that connects late or reconnects still
receives the full history. `GET /api/runs/:runId` is the polling fallback for
environments that block `text/event-stream`.

---

## 🛡 Resilience

- **Retry with exponential backoff** on 429 / 5xx / timeout (1s → 2s → 4s)
- **Partial-failure tolerance** — a competitor that fails retrieval is reported
  as failed and the run continues with the rest; its zero counts are never
  presented as "no defects"
- **Degraded mode** — if the Monid gateway is unreachable, the last *verified
  cached result for that same category* is served, explicitly labelled
  (`degraded.isDegraded`, `source: DEGRADED_CACHE_FALLBACK`) and re-signed. It
  never substitutes another category's data, and it never invents reviews
- **Budget + trial guards** — hard $1.00 sponsored spend ceiling, 3 free runs
  per visitor, per-minute rate limiting

---

## 🤖 MCP Server (for Claude Desktop / Cursor / Claude Code)

Ratina exposes 4 MCP tools that any AI agent can use:

| Tool | Description | Cost |
|---|---|---|
| `investigate_category` | Full live investigation on any Amazon category | ~$0.018/run |
| `get_failure_matrix` | Cross-competitor failure matrix for a cached category | $0.00 |
| `export_sourcing_brief` | Generate a formatted sourcing brief | $0.00 |
| `verify_receipt` | Cryptographically verify an exported report; names the failed check if altered | $0.00 |

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
| `/api/investigate` | POST | Run a full investigation (cached or live), blocking |
| `/api/investigate/start` | POST | Start an investigation, returns a streamable `runId` |
| `/api/runs/stream?runId=` | GET | SSE stream of real pipeline phases |
| `/api/runs/:runId` | GET | Poll fallback for run status + buffered events |
| `/api/analyze` | POST | Single-ASIN live analysis |
| `/api/analyze/start` | POST | Single-ASIN analysis with a streamable `runId` |
| `/api/receipts/verify` | POST | Verify an exported report against its signed receipt |
| `/api/receipts/ledger` | GET | Append-only receipt chain |
| `/api/receipts/chain/verify` | GET | Re-verify every link and signature in the chain |
| `/api/mcp` | POST | MCP-over-HTTP (JSON-RPC 2.0) |
| `/api/export/json` | GET | Download investigation as JSON (`?runId=` scoped) |
| `/api/export/brief` | GET | Download sourcing brief as text (`?runId=` scoped) |
| `/api/cache/status` | GET | View cached categories |
| `/api/health` | GET | Server health, budget, verification key, run stats |

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
┌─────────────────────────────────────────────────────────┐
│  Visual Playground (Vite + React)                       │
│  Hero "Kill" Banner + Analysis Dashboard                │
└──────────────┬───────────────────────┬──────────────────┘
               │ HTTP                  │ SSE (real phases)
┌──────────────▼───────────────────────▼──────────────────┐
│  Express API Server (server/index.js)                   │
│  /api/investigate  /api/runs/stream  /api/receipts/*    │
│  trust proxy · rate limit · trial + budget guards       │
├─────────────────────────────────────────────────────────┤
│  Run Store (runStore.js)                                │
│  Per-run isolation, buffered events, TTL eviction       │
├─────────────────────────────────────────────────────────┤
│  Investigation Engine   │  Schema Gates  │  Cache Layer │
│  (investigationEngine)  │  (schemas.js)  │  (cache.js)  │
│  8 phases, each validated before the next consumes it   │
├─────────────────────────────────────────────────────────┤
│  Receipt Service (receiptService.js)                    │
│  SHA-256 · Merkle root · hash chain · HMAC-SHA256       │
├─────────────────────────────────────────────────────────┤
│  Monid Service (monidService.js)                        │
│  Live Amazon data · retry + backoff · cost metering     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  MCP Server (server/mcpServer.js)                       │
│  JSON-RPC 2.0 over stdio (stdout kept protocol-pure)    │
│  4 tools for Claude / Cursor / Claude Code              │
└─────────────────────────────────────────────────────────┘
```

---

## 🚂 Deploy to Railway

`railway.json` is already configured (Nixpacks build, `node server/index.js`
start, binds `0.0.0.0:$PORT`). Set these variables in the Railway service:

| Variable | Required | Notes |
|---|---|---|
| `MONID_API_KEY` | Yes | Live Monid gateway key |
| `RATINA_RECEIPT_SECRET` | Yes | `openssl rand -hex 32` — receipts stop verifying across restarts without it |
| `PORT` | No | Railway injects it automatically |

The Monid CLI ships as an npm dependency (`@monid-ai/cli`) and is invoked from
`node_modules/.bin`, so no global install step is needed on the host.

---

## 📋 Submission Checklist

- [x] **Target has a real, current, published price I verified** — Helium 10 Platinum [$99/mo](https://www.helium10.com/pricing/)
- [x] **Runs on live data, not mock data, with the Monid call visible** — 11 live Monid calls, $0.01815 receipt
- [x] **Repo or live URL, with commits inside the window** — This repo
- [x] **What died is clear in the first five seconds** — Hero Kill Banner: $99/mo → $0.018/run
- [x] **Multi-stage deterministic pipeline, not one prompt** — 8 phases, 13 schema gates per run, no LLM in the analysis path
- [x] **Cryptographic verification is real and demoable** — SHA-256 + Merkle + hash chain + HMAC; tamper any figure and `/api/receipts/verify` names the failed check
- [x] **Agent-ready** — 4 MCP tools over both stdio and HTTP JSON-RPC 2.0
- [x] **Production resilience** — retry/backoff, partial-failure tolerance, labelled degraded mode, per-run isolation, rate limiting

---

## License

MIT
