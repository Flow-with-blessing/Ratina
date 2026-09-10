# Ratina.ai

**The Amazon review intelligence API, without the $99/mo subscription. Every analysis ships with a cryptographic receipt you can verify yourself.**

Ratina reads real Amazon customer reviews across a category's top competitors, extracts the recurring ways those products physically fail, and turns those failures into engineering and QA specs a sourcing agent can send to a factory. Then it signs the result, so nobody can quietly change a number afterwards.

---

## Product I killed

**Helium 10 Review Insights**, Platinum plan at [$99/mo](https://www.helium10.com/pricing/) (price verified September 2026).

| | Helium 10 Platinum | Ratina (via Monid) |
|---|---|---|
| Price | $99.00 / month | $0.018 per investigation |
| Model | Recurring subscription | Pay-per-call, your own Monid key |
| One sourcing decision (1 to 3 runs) | $99.00 | ~$0.05 |
| Repeat query on a known category | included | $0.00, ~70ms from cache |
| Committed before your first request | $99.00 | $0.00 |

**The honest version of the math:** break-even is about 5,500 investigations per month. Run more than that and the two cost the same. Run fewer, which is where every private-label seller I have talked to actually operates, and Ratina is cheaper by orders of magnitude. I would rather publish the break-even point than quote a headline multiple that only holds at one end of the range.

---

## What it actually does

Eight deterministic phases, each schema-validated before the next one is allowed to consume its output:

1. **Discovery** searches Amazon for the category and returns candidates
2. **Selection** ranks them by review volume, rating availability, organic placement and relevance
3. **Enrichment** pulls real customer reviews and product data per competitor
4. **Failure extraction** classifies each review clause against category failure dictionaries
5. **Failure matrix** builds cross-competitor frequency with evidence weighting
6. **Severity scoring** ranks failure modes 0 to 100, with a safety-hazard multiplier
7. **Sourcing specs** turns each failure into an engineering requirement, a QA test and a listing angle
8. **Verification** signs the whole result

**There is no LLM in the analysis path.** Classification is an explicit rule engine: clause splitting, negation detection (*"never leaks"* is not a leak), positive-context filtering, specification-mention filtering, and star-rating evidence weighting. Same input, same output, every time. Nothing in the pipeline is capable of inventing a defect that no reviewer reported.

---

## The part I have not seen anyone else do: you can prove the analysis wasn't tampered with

When an analysis drives a purchase order to a factory, "trust the dashboard" is not good enough. Every Ratina run is signed with four layers:

| Layer | Mechanism | What it catches |
|---|---|---|
| Content hash | SHA-256 over a canonicalized payload | Any figure in the report changed after issuance |
| Merkle root | Binary Merkle tree over every Monid data call, with per-call inclusion proofs | A data call added, removed or edited, and it proves any single call belongs to the run |
| Hash chain | Each receipt commits to the previous receipt's hash | Altering receipt N invalidates every receipt after it |
| Signature | HMAC-SHA256 over the receipt hash, constant-time compared | Forgery, without the server signing key |

### Try to fake one (60 seconds)

```bash
# 1. Pull a real signed investigation
curl -s https://ratina.up.railway.app/api/saved-benchmark | jq '.data' > report.json

# 2. Verify it. Passes.
curl -s -X POST https://ratina.up.railway.app/api/receipts/verify \
  -H 'Content-Type: application/json' -d @report.json | jq '.verified, .verdict'
# true
# "AUTHENTIC — receipt matches this exact analysis"

# 3. Inflate the opportunity score by five points
jq '.productOpportunityScore.score = 99' report.json > tampered.json

# 4. Verify again. Fails, and names the check that caught it.
curl -s -X POST https://ratina.up.railway.app/api/receipts/verify \
  -H 'Content-Type: application/json' -d @tampered.json | jq '.verified, .failedCheck, .reason'
# false
# "CONTENT_HASH"
# "Analysis payload has been modified since the receipt was issued."
```

Recomputing the content hash does not help: the receipt hash then fails. Recomputing that too does not help either: the HMAC signature fails, because forging it needs the server key. All four failure paths are tested.

Verify the full chain at `GET /api/receipts/chain/verify`. Inspect it at `GET /api/receipts/ledger`.

---

## Agent-ready

Four MCP tools over both stdio and HTTP JSON-RPC 2.0, so Claude Desktop, Cursor, Claude Code or an autonomous procurement agent can use Ratina directly:

| Tool | What it does | Cost |
|---|---|---|
| `investigate_category` | Full live investigation on any Amazon category | ~$0.018 |
| `get_failure_matrix` | Cross-competitor failure matrix for a cached category | $0.00 |
| `export_sourcing_brief` | Formatted brief, ready to send to a supplier | $0.00 |
| `verify_receipt` | Cryptographically verify an exported report, naming the failed check if it was altered | $0.00 |

```json
{
  "mcpServers": {
    "ratina": { "command": "node", "args": ["server/mcpServer.js"], "cwd": "/path/to/Ratina" }
  }
}
```

An agent can run an investigation and then independently verify the report it was handed. That second step is the one I care about.

---

## Proof it ran on live data

Figures below match the proof artifacts committed in `temp/`, so they can be checked against the repo rather than taken on trust:

| Run | Competitors | Reviews retrieved | Monid calls | Cost |
|---|---|---|---|---|
| Portable Blenders | 21 candidates discovered → 5 selected | 250 (50 each) | 11 | $0.01815 |
| French Press Coffee Makers | 5 | 117 (50 / 50 / 11 / 3 / 3) | 10 | $0.01800 |

Every Monid call is logged with its own call ID, endpoint, latency, HTTP status and individual cost. A hardcoded $1.00 sprint ceiling prevents runaway spend.

Note the French Press row: two competitors returned only 3 reviews each. Ratina labels that `SPARSE DATASET`, lowers its evidence confidence, and explicitly refuses to read a thin sample as "no defects found". That is the behaviour I most wanted to get right, because the failure mode of every review tool is quietly reporting silence as good news.

---

## What it does not do

- **Failure dictionaries are deep for two categories** (french press, portable blenders) and fall back to a generic six-mode dictionary elsewhere. The generic path works; it is less specific.
- **No LLM in the analysis path**, by design. That buys determinism and costs nuance on unusual phrasing.
- **Review depth is capped by the upstream scraper**, not by Ratina. When a competitor returns 3 reviews, that is what the receipt says.
- **The receipt ledger is per-instance.** Set `RATINA_RECEIPT_SECRET` in production or receipts stop verifying after a restart.
- **Prices and ratings are reported as `UNAVAILABLE` when a scrape misses them.** Nothing is filled in with a plausible-looking default.

---

## Code and project

- **GitHub:** https://github.com/Flow-with-blessing/Ratina
- **Live app:** https://ratina.up.railway.app
- **Verify endpoint:** https://ratina.up.railway.app/api/receipts/verify
- **Health + signing key:** https://ratina.up.railway.app/api/health
- **Docs:** https://github.com/Flow-with-blessing/Ratina#readme

Stack: Node/Express orchestrator, React + Vite dashboard, Monid pay-per-call gateway, MCP server over stdio and HTTP. `MONID_API_KEY` stays server-side; a user's own key travels in a request header and is never persisted or logged.
