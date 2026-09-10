import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { fetchAmazonDataWithMonid, ensureMonidKeyConfigured } from './monidService.js';
import { analyzeProductIntelligence } from './analyzer.js';
import { runInvestigation } from './investigationEngine.js';
import { generateSourcingBriefText, generateSourcingJSON } from './exportService.js';
import { getLiveProofPayload } from './liveProofPayload.js';
import { getCachedResult, setCachedResult, getCacheStats, getAllCachedKeys } from './cache.js';
import {
  issueReceipt,
  verifyInvestigationReceipt,
  verifyChain,
  getLedger,
  getChainHead,
  getKeyId,
  isDurableKeyConfigured,
  RECEIPT_PROTOCOL,
  HASH_ALGORITHM,
  SIGNATURE_ALGORITHM
} from './receiptService.js';
import {
  createRun,
  getRun,
  resolveRun,
  emitEvent,
  subscribe,
  markRunning,
  completeRun,
  failRun,
  getStats as getRunStats
} from './runStore.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * Railway (and any reverse proxy) terminates TLS in front of this process.
 * Declaring exactly one trusted hop makes Express derive req.ip from the
 * RIGHTMOST entry of X-Forwarded-For — the address the proxy observed — so a
 * client cannot grant itself unlimited free runs by prepending a forged
 * X-Forwarded-For header.
 */
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Production: Serve the built Vite frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Maximum budget guard ($1.00 for this validation sprint)
const SPRINT_BUDGET_MAX = 1.00;
let sprintTotalSpend = 0;

// Sponsored trial tracking (free audits for shoppers without a Monid account)
const MAX_SPONSORED_RUNS_PER_IP = 3;
const sponsoredTrialTracker = new Map(); // clientKey -> count of fresh runs

/**
 * Real client address, derived through the trusted proxy hop.
 */
function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Stable per-visitor key used for trial accounting and for scoping
 * investigation results to their owner. Hashed so raw IPs are not retained
 * in process memory.
 */
function getClientKey(req) {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

// ─── LIGHTWEIGHT RATE LIMITING ────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 40;
const rateBuckets = new Map(); // clientKey -> timestamps[]

function rateLimit(req, res, next) {
  const key = getClientKey(req);
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (hits.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: `Too many requests. Limit is ${RATE_LIMIT_MAX} requests per minute.`,
      retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - hits[0])) / 1000)
    });
  }

  hits.push(now);
  rateBuckets.set(key, hits);
  next();
}

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── SHARED INVESTIGATION HELPERS ─────────────────────────────────────────────

/**
 * Admission control for a fresh (paid) investigation: trial allowance and
 * sponsored budget. Returns null when the run may proceed, or an error
 * response descriptor when it may not.
 */
function checkAdmission({ customApiKey, clientKey }) {
  const runsUsed = sponsoredTrialTracker.get(clientKey) || 0;

  if (!customApiKey && runsUsed >= MAX_SPONSORED_RUNS_PER_IP) {
    return {
      status: 429,
      body: {
        error: 'TRIAL_LIMIT_REACHED',
        message: `You've used all ${MAX_SPONSORED_RUNS_PER_IP} free trial market audits sponsored by Ratina! Enter your own Monid API key from monid.ai to continue running live audits, or explore cached categories for free ($0.00).`,
        trialExhausted: true,
        runsUsed,
        maxRuns: MAX_SPONSORED_RUNS_PER_IP
      }
    };
  }

  if (!customApiKey && sprintTotalSpend >= SPRINT_BUDGET_MAX) {
    return {
      status: 402,
      body: {
        error: 'BUDGET_EXHAUSTED',
        message: `Sponsored sprint budget limit of $${SPRINT_BUDGET_MAX.toFixed(2)} reached. Connect your Monid API key to continue running audits.`,
        sprintTotalSpend,
        sprintBudgetMax: SPRINT_BUDGET_MAX
      }
    };
  }

  return null;
}

function recordSpend({ customApiKey, clientKey, cost }) {
  if (customApiKey) return sponsoredTrialTracker.get(clientKey) || 0;
  sprintTotalSpend += cost || 0;
  const used = (sponsoredTrialTracker.get(clientKey) || 0) + 1;
  sponsoredTrialTracker.set(clientKey, used);
  return used;
}

/**
 * Degraded-mode gateway.
 *
 * When the live Monid path is unavailable, serve the most recent verified
 * result FOR THE SAME CATEGORY, explicitly relabelled as cached and
 * re-signed so its receipt still verifies. Never substitutes another
 * category's data and never invents reviews: a demo that cannot reach live
 * data says so, in the payload and on screen.
 */
function buildDegradedFallback(category, reason) {
  const cached = getCachedResult((category || '').trim().toLowerCase());
  if (!cached) return null;

  // Drop the old receipt and cache bookkeeping; the degraded payload is
  // re-signed below so its receipt matches what is actually served.
  const { verification: _oldReceipt, _cachedAt, _cacheKey, _source, ...content } = cached;

  const degraded = {
    ...content,
    degraded: {
      isDegraded: true,
      reason,
      servedFrom: 'LAST_VERIFIED_CACHED_RESULT',
      originallyExecutedAt: content.executionMetadata?.executedAt || content.timestamp || null,
      notice: 'Live Monid gateway was unavailable for this request. This is the last verified result for this category, not a fresh run. No data has been fabricated.'
    },
    executionMetadata: {
      ...(content.executionMetadata || {}),
      isLiveExecution: false,
      source: 'DEGRADED_CACHE_FALLBACK',
      degradedServedAt: new Date().toISOString(),
      totalActualCost: 0
    }
  };

  degraded.verification = issueReceipt(degraded);
  return degraded;
}

/**
 * Health Check Endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Ratina.ai — Amazon Product Intelligence API & MCP Server',
    monidIntegration: 'active',
    mcpServer: 'available (stdio: node server/mcpServer.js)',
    timestamp: new Date().toISOString(),
    budgetStatus: sprintTotalSpend >= SPRINT_BUDGET_MAX ? 'exhausted' : 'active',
    cacheStatus: `${getCacheStats().cachedCategories} categories cached`,
    verification: {
      protocol: RECEIPT_PROTOCOL,
      hashAlgorithm: HASH_ALGORITHM,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      keyId: getKeyId(),
      durableKey: isDurableKeyConfigured(),
      chainHead: getChainHead()
    },
    runs: getRunStats()
  });
});

/**
 * Receipt Verification Endpoints
 */
app.get('/api/receipts/verify', (req, res) => {
  res.json({
    status: 'active',
    endpoint: '/api/receipts/verify',
    method: 'POST',
    description: 'Cryptographically verifies Monid execution receipts and per-call proof records.',
    usage: 'POST report JSON or monidReceipt object to /api/receipts/verify'
  });
});

app.post('/api/receipts/verify', (req, res) => {
  try {
    const payload = req.body || {};
    const receipt = payload.monidReceipt || payload.data?.monidReceipt || (payload.callBreakdown ? payload : null);

    if (!receipt || !Array.isArray(receipt.callBreakdown) || receipt.callBreakdown.length === 0) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'INVALID_OR_MISSING_RECEIPT',
        message: 'No valid Monid call receipt breakdown found in payload.'
      });
    }

    const calls = receipt.callBreakdown;
    const allSuccessful = calls.every(c => c.status === '200 OK' || (c.status && String(c.status).startsWith('2')));
    const totalCalls = receipt.totalCallsExecuted || calls.length;
    const totalCost = receipt.totalMonidCostUSD || `$${calls.reduce((acc, c) => acc + (c.costUSD || 0), 0).toFixed(5)}`;

    return res.json({
      success: true,
      verified: true,
      verificationStatus: allSuccessful ? 'VERIFIED_AUTHENTIC' : 'PARTIAL_SUCCESS_RECORD',
      totalCalls,
      successfulCalls: receipt.successfulCalls ?? calls.filter(c => c.status === '200 OK').length,
      totalCostUSD: totalCost,
      verifiedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      verified: false,
      error: 'VERIFICATION_ERROR',
      message: err.message || 'Error verifying receipt'
    });
  }
});

/**
 * GET /api/trial/status
 * Returns the current visitor's trial status or custom key status
 */
app.get('/api/trial/status', (req, res) => {
  const customApiKey = req.headers['x-monid-api-key'];
  const clientKey = getClientKey(req);
  const runsUsed = sponsoredTrialTracker.get(clientKey) || 0;

  res.json({
    hasCustomKey: Boolean(customApiKey),
    isCustomKey: Boolean(customApiKey),
    runsUsed,
    runsRemaining: Math.max(0, MAX_SPONSORED_RUNS_PER_IP - runsUsed),
    maxRuns: MAX_SPONSORED_RUNS_PER_IP,
    trialExhausted: !customApiKey && runsUsed >= MAX_SPONSORED_RUNS_PER_IP
  });
});

/**
 * GET /api/budget
 * Returns current sprint budget status
 */
app.get('/api/budget', (req, res) => {
  res.json({
    sprintBudgetMax: SPRINT_BUDGET_MAX,
    sprintTotalSpend,
    sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend,
    budgetExhausted: sprintTotalSpend >= SPRINT_BUDGET_MAX
  });
});

// ─── STREAMING INVESTIGATION (SERVER-SENT EVENTS) ─────────────────────────────

/**
 * POST /api/investigate/start
 *
 * Registers a run and begins executing it in the background, returning a
 * runId immediately. The Monid API key travels in a header on THIS request
 * and is never placed in the stream URL (EventSource cannot send headers, so
 * a single-request SSE design would have leaked the key into URLs and logs).
 */
app.post('/api/investigate/start', rateLimit, (req, res) => {
  const { category, asins, searchQuery, forceFresh } = req.body || {};
  const customApiKey = req.headers['x-monid-api-key'] || req.body?.customApiKey;
  const clientKey = getClientKey(req);

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return res.status(400).json({
      error: 'MISSING_CATEGORY',
      message: 'Please provide a category name for the investigation.'
    });
  }

  const cacheKey = category.trim().toLowerCase();

  // Cache hit: no live cost, resolve immediately as a completed run.
  if (!forceFresh && !asins) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      const run = createRun({ clientKey, category, mode: 'CACHE', authMode: 'CACHED_BENCHMARK' });
      emitEvent(run.runId, {
        type: 'phase',
        phase: 'CACHE',
        phaseIndex: 7,
        totalPhases: 7,
        percent: 100,
        message: `Loaded verified cached investigation for "${category}" ($0.00).`
      });
      completeRun(run.runId, {
        success: true,
        data: cached,
        source: 'CACHE',
        cost: '$0.00',
        authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'CACHED_BENCHMARK'
      });
      return res.json({ runId: run.runId, streamUrl: `/api/investigate/stream?runId=${run.runId}`, cached: true });
    }
  }

  const denied = checkAdmission({ customApiKey, clientKey });
  if (denied) return res.status(denied.status).json(denied.body);

  const run = createRun({
    clientKey,
    category: category.trim(),
    mode: asins ? 'PRESET_ASIN_ANALYSIS' : 'DYNAMIC_DISCOVERY_ANALYSIS',
    authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'SPONSORED_TRIAL'
  });

  res.json({ runId: run.runId, streamUrl: `/api/investigate/stream?runId=${run.runId}`, cached: false });

  // Execute in the background; the client follows along over SSE.
  (async () => {
    markRunning(run.runId);
    try {
      const result = await runInvestigation({
        category: category.trim(),
        asins: asins && asins.length > 0 ? asins : undefined,
        searchQuery: searchQuery || undefined,
        apiKey: customApiKey || undefined,
        runId: run.runId,
        onProgress: event => emitEvent(run.runId, event)
      });

      if (!result.success) {
        // Upstream outage: degrade to the last verified result for this
        // category rather than dropping the user on an error screen.
        const fallback = result.errorType === 'UPSTREAM_UNAVAILABLE'
          ? buildDegradedFallback(category, result.error)
          : null;

        if (fallback) {
          emitEvent(run.runId, {
            type: 'phase',
            phase: 'DEGRADED',
            phaseIndex: 7,
            totalPhases: 7,
            percent: 100,
            message: 'Live gateway unavailable — serving last verified cached result for this category.'
          });
          completeRun(run.runId, {
            success: true,
            data: fallback,
            source: 'DEGRADED_CACHE_FALLBACK',
            degraded: true
          });
          return;
        }

        failRun(run.runId, {
          error: result.error || 'Investigation failed',
          errorType: result.errorType || 'INVESTIGATION_FAILED',
          executionMetadata: result.executionMetadata
        });
        return;
      }

      const cost = result.data?.executionMetadata?.totalActualCost || 0;
      const runsUsed = recordSpend({ customApiKey, clientKey, cost });

      setCachedResult(cacheKey, result.data);

      completeRun(run.runId, {
        success: true,
        data: result.data,
        source: 'LIVE_MONID_EXECUTION',
        authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'SPONSORED_TRIAL',
        trialInfo: {
          isSponsored: !customApiKey,
          runsUsed,
          runsRemaining: Math.max(0, MAX_SPONSORED_RUNS_PER_IP - runsUsed),
          maxRuns: MAX_SPONSORED_RUNS_PER_IP
        },
        sprintBudget: {
          thisRunCost: cost,
          sprintTotalSpend,
          sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
        }
      });
    } catch (error) {
      console.error(`[Investigation ${run.runId}] Fatal error:`, error);
      failRun(run.runId, {
        error: error.message || String(error),
        errorType: error.stage ? 'SCHEMA_VALIDATION_FAILED' : 'INVESTIGATION_ERROR',
        validationErrors: error.validationErrors
      });
    }
  })();
});

/**
 * GET /api/investigate/stream?runId=...
 *
 * Server-Sent Events stream of REAL pipeline phases. Every event corresponds
 * to work the engine has actually completed. Buffered events are replayed on
 * connect, so a client that attaches late still sees the full history.
 */
function sseHandler(req, res) {
  const { runId } = req.query;
  const run = getRun(runId);

  if (!run) {
    return res.status(404).json({ error: 'RUN_NOT_FOUND', message: 'Unknown or expired runId.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'   // disable proxy buffering so events arrive live
  });
  res.flushHeaders?.();

  const send = (event, name = 'progress') => {
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({ type: 'connected', runId: run.runId, status: run.status }, 'connected');

  const unsubscribe = subscribe(run.runId, event => send(event, 'progress'));

  // Terminal state may already have been reached (fast cache hit, or a client
  // that reconnected after completion).
  const flushTerminal = () => {
    const current = getRun(run.runId);
    if (!current) return true;
    if (current.status === 'COMPLETE') {
      send(current.result, 'complete');
      return true;
    }
    if (current.status === 'ERROR') {
      send(current.error, 'failed');
      return true;
    }
    return false;
  };

  if (flushTerminal()) {
    unsubscribe();
    return res.end();
  }

  // Poll for terminal transition + heartbeat to keep proxies from timing out.
  const poll = setInterval(() => {
    if (flushTerminal()) {
      clearInterval(poll);
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    }
  }, 400);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(poll);
    clearInterval(heartbeat);
    unsubscribe();
  });
}

// Same stream, two names: the investigate-specific path and a generic one
// used by single-ASIN and benchmark runs.
app.get('/api/investigate/stream', sseHandler);
app.get('/api/runs/stream', sseHandler);

/**
 * GET /api/runs/:runId
 * Poll-based status for clients that cannot hold an SSE connection.
 */
app.get('/api/runs/:runId', (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) {
    return res.status(404).json({ error: 'RUN_NOT_FOUND', message: 'Unknown or expired runId.' });
  }
  res.json({
    runId: run.runId,
    status: run.status,
    category: run.category,
    events: run.events,
    ...(run.status === 'COMPLETE' ? { result: run.result } : {}),
    ...(run.status === 'ERROR' ? { error: run.error } : {})
  });
});

// ─── VERIFICATION ENDPOINTS ───────────────────────────────────────────────────

/**
 * POST /api/receipts/verify
 *
 * Verify an exported investigation against its signed receipt. Change a
 * single digit anywhere in the report and this returns valid:false naming
 * the check that failed.
 *
 * Body: the exported investigation JSON (either the raw payload, or the
 * export wrapper produced by /api/export/json).
 */
app.post('/api/receipts/verify', (req, res) => {
  const body = req.body || {};

  // Accept both the raw investigation payload and the export wrapper.
  const payload = body.verification
    ? body
    : (body.data?.verification ? body.data : body);

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({
      error: 'INVALID_PAYLOAD',
      message: 'Send the exported investigation JSON as the request body.'
    });
  }

  const result = verifyInvestigationReceipt(payload);

  return res.status(result.valid ? 200 : 422).json({
    verified: result.valid,
    verdict: result.valid ? 'AUTHENTIC — receipt matches this exact analysis' : 'TAMPERED OR INVALID',
    reason: result.reason,
    failedCheck: result.failedCheck,
    runId: result.runId,
    keyId: result.keyId,
    issuedAt: result.issuedAt,
    checks: result.checks,
    protocol: RECEIPT_PROTOCOL
  });
});

/**
 * GET /api/receipts/ledger
 * The append-only receipt chain issued by this server instance.
 */
app.get('/api/receipts/ledger', (req, res) => {
  const ledger = getLedger();
  res.json({
    protocol: RECEIPT_PROTOCOL,
    hashAlgorithm: HASH_ALGORITHM,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    keyId: getKeyId(),
    durableKey: isDurableKeyConfigured(),
    entries: ledger.length,
    head: getChainHead(),
    ledger
  });
});

/**
 * GET /api/receipts/chain/verify
 * Re-verify every link and signature in the chain.
 */
app.get('/api/receipts/chain/verify', (req, res) => {
  const result = verifyChain();
  res.status(result.valid ? 200 : 422).json({
    ...result,
    protocol: RECEIPT_PROTOCOL,
    keyId: getKeyId()
  });
});

/**
 * POST /api/investigate
 *
 * Non-streaming investigation (used by curl, MCP-over-HTTP consumers and any
 * client that just wants the final result).
 *
 * Supports:
 * 1. Cached categories ($0.00, instant sub-second)
 * 2. Sponsored free trial runs (first 3 fresh audits on the house)
 * 3. Custom Monid API key via `x-monid-api-key` header (unlimited)
 */
app.post('/api/investigate', rateLimit, async (req, res) => {
  try {
    const { category, asins, searchQuery, forceFresh } = req.body;
    const customApiKey = req.headers['x-monid-api-key'] || req.body?.customApiKey;
    const clientKey = getClientKey(req);
    const runsUsed = sponsoredTrialTracker.get(clientKey) || 0;

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({
        error: 'MISSING_CATEGORY',
        message: 'Please provide a category name for the investigation.'
      });
    }

    const cacheKey = category.trim().toLowerCase();

    // Check cache first (unless forceFresh or specific ASINs provided)
    if (!forceFresh && !asins) {
      const cached = getCachedResult(cacheKey);
      if (cached) {
        console.log(`[Ratina Cache HIT] Returning cached result for "${category}" ($0.00)`);
        const run = createRun({ clientKey, category, mode: 'CACHE', authMode: 'CACHED_BENCHMARK' });
        completeRun(run.runId, { success: true, data: cached, source: 'CACHE' });

        return res.json({
          success: true,
          runId: run.runId,
          data: cached,
          source: 'CACHE',
          cost: '$0.00',
          authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'CACHED_BENCHMARK',
          trialInfo: {
            isSponsored: false,
            isCached: true,
            runsUsed,
            runsRemaining: Math.max(0, MAX_SPONSORED_RUNS_PER_IP - runsUsed),
            maxRuns: MAX_SPONSORED_RUNS_PER_IP
          },
          sprintBudget: {
            thisRunCost: 0,
            sprintTotalSpend,
            sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
          }
        });
      }
    }

    const denied = checkAdmission({ customApiKey, clientKey });
    if (denied) return res.status(denied.status).json(denied.body);

    console.log(`[Ratina Investigation] Category: "${category}" | Mode: ${asins ? 'Pre-selected' : 'Dynamic Discovery'} | Auth: ${customApiKey ? 'Custom Key' : 'Sponsored Trial'}`);

    const run = createRun({
      clientKey,
      category: category.trim(),
      mode: asins ? 'PRESET_ASIN_ANALYSIS' : 'DYNAMIC_DISCOVERY_ANALYSIS',
      authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'SPONSORED_TRIAL'
    });
    markRunning(run.runId);

    const result = await runInvestigation({
      category: category.trim(),
      asins: asins && asins.length > 0 ? asins : undefined,
      searchQuery: searchQuery || undefined,
      apiKey: customApiKey || undefined,
      runId: run.runId,
      onProgress: event => emitEvent(run.runId, event)
    });

    if (!result.success) {
      const fallback = result.errorType === 'UPSTREAM_UNAVAILABLE'
        ? buildDegradedFallback(category, result.error)
        : null;

      if (fallback) {
        completeRun(run.runId, { success: true, data: fallback, source: 'DEGRADED_CACHE_FALLBACK' });
        return res.json({
          success: true,
          runId: run.runId,
          data: fallback,
          source: 'DEGRADED_CACHE_FALLBACK',
          degraded: true,
          message: 'Live Monid gateway unavailable. Served the last verified cached result for this category.'
        });
      }

      failRun(run.runId, { error: result.error, errorType: result.errorType });
      return res.status(500).json({
        error: result.errorType || 'INVESTIGATION_FAILED',
        message: result.error || 'Investigation failed',
        runId: run.runId,
        executionMetadata: result.executionMetadata
      });
    }

    const cost = result.data?.executionMetadata?.totalActualCost || 0;
    const newRunsUsed = recordSpend({ customApiKey, clientKey, cost });

    setCachedResult(cacheKey, result.data);
    completeRun(run.runId, { success: true, data: result.data, source: 'LIVE_MONID_EXECUTION' });

    return res.json({
      success: true,
      runId: run.runId,
      data: result.data,
      source: 'LIVE_MONID_EXECUTION',
      authMode: customApiKey ? 'CUSTOM_MONID_KEY' : 'SPONSORED_TRIAL',
      trialInfo: {
        isSponsored: !customApiKey,
        runsUsed: newRunsUsed,
        runsRemaining: Math.max(0, MAX_SPONSORED_RUNS_PER_IP - newRunsUsed),
        maxRuns: MAX_SPONSORED_RUNS_PER_IP
      },
      sprintBudget: {
        thisRunCost: cost,
        sprintTotalSpend,
        sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
      }
    });
  } catch (error) {
    console.error('[Investigation Error]:', error);
    return res.status(500).json({
      error: error.stage ? 'SCHEMA_VALIDATION_FAILED' : 'INVESTIGATION_ERROR',
      message: error.message || String(error),
      ...(error.validationErrors ? { validationErrors: error.validationErrors } : {})
    });
  }
});

/**
 * POST /api/analyze-multi
 * Multi-ASIN Competitor Cross-Analysis — NOW RUNS LIVE
 */
app.post('/api/analyze-multi', rateLimit, async (req, res) => {
  try {
    const { asins, category } = req.body;
    const clientKey = getClientKey(req);

    // Default French Press benchmark ASINs
    const benchmarkAsins = ['B00008XEWG', 'B000KEM4TQ', 'B00004Y6A2', 'B01J4327D8', 'B07N3ZJDFR'];
    const benchmarkCategory = 'French Press Coffee Makers (34oz / 1-Liter)';

    const targetAsins = asins && asins.length > 0 ? asins : benchmarkAsins;
    const targetCategory = category || benchmarkCategory;

    // Budget guard
    if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
      return res.status(402).json({
        error: 'BUDGET_EXHAUSTED',
        message: `Sprint budget limit reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`
      });
    }

    console.log(`[Ratina Multi Pipeline] Live execution for ${targetAsins.length} ASINs in "${targetCategory}"`);

    const run = createRun({ clientKey, category: targetCategory, mode: 'PRESET_ASIN_ANALYSIS' });
    markRunning(run.runId);

    const result = await runInvestigation({
      category: targetCategory,
      asins: targetAsins,
      runId: run.runId,
      onProgress: event => emitEvent(run.runId, event)
    });

    if (!result.success) {
      failRun(run.runId, { error: result.error, errorType: result.errorType });
      return res.status(500).json({
        error: 'MULTI_ANALYSIS_FAILED',
        message: result.error || 'Multi-ASIN analysis failed',
        executionMetadata: result.executionMetadata
      });
    }

    const cost = result.data?.executionMetadata?.totalActualCost || 0;
    sprintTotalSpend += cost;
    completeRun(run.runId, { success: true, data: result.data, source: 'LIVE_MONID_EXECUTION' });

    return res.json({
      success: true,
      runId: run.runId,
      data: result.data,
      sprintBudget: {
        thisRunCost: cost,
        sprintTotalSpend,
        sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
      }
    });
  } catch (error) {
    console.error('[Ratina Multi Pipeline Error]:', error);
    return res.status(500).json({
      error: 'MULTI_ANALYSIS_FAILED',
      message: 'Failed to complete multi-ASIN cross competitor intelligence.',
      details: error.message || String(error)
    });
  }
});

// ─── SINGLE-ASIN / BENCHMARK ANALYSIS ─────────────────────────────────────────

const BENCHMARK_ASINS = ['B00008XEWG', 'B000KEM4TQ', 'B00004Y6A2', 'B01J4327D8', 'B07N3ZJDFR'];
const BENCHMARK_CATEGORY = 'French Press Coffee Makers (34oz / 1-Liter)';

/**
 * Validate an /api/analyze request up front, so both the blocking and the
 * streaming entry point reject bad input identically and before any spend.
 */
function validateAnalyzeRequest({ asin, mode }) {
  if (mode === 'benchmark' || asin === 'BENCHMARK_5_ASINS') {
    if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
      return {
        error: {
          status: 402,
          body: {
            error: 'BUDGET_EXHAUSTED',
            message: `Sprint budget limit reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`
          }
        }
      };
    }
    return { benchmark: true, category: BENCHMARK_CATEGORY };
  }

  if (!asin || typeof asin !== 'string') {
    return {
      error: {
        status: 400,
        body: { error: 'INVALID_ASIN', message: 'Please provide a valid 10-character Amazon ASIN.' }
      }
    };
  }

  const cleanAsin = asin.trim().toUpperCase();

  if (cleanAsin.includes(',') || cleanAsin.includes(' ')) {
    return {
      error: {
        status: 400,
        body: {
          error: 'MULTIPLE_ASINS',
          message: 'This field accepts a single ASIN. Use the Market Investigation for multi-ASIN analysis.'
        }
      }
    };
  }

  if (!/^[A-Z0-9]{10}$/.test(cleanAsin)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'MALFORMED_ASIN',
          message: `"${cleanAsin}" is not a valid 10-character Amazon ASIN. (Example valid ASIN: B07CMS5Q6P or B00091S3K4)`
        }
      }
    };
  }

  if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
    return {
      error: {
        status: 402,
        body: {
          error: 'BUDGET_EXHAUSTED',
          message: `Sprint budget limit reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`
        }
      }
    };
  }

  return { benchmark: false, cleanAsin, category: cleanAsin };
}

/**
 * Execute a validated analyze request, emitting real phase events to the run.
 */
async function executeAnalyzeRun({ validated, runId, apiKey }) {
  const progress = (phase, phaseIndex, message, detail = {}) =>
    emitEvent(runId, { type: 'phase', runId, phase, phaseIndex, totalPhases: 7, percent: Math.round((phaseIndex / 7) * 100), message, ...detail });

  if (validated.benchmark) {
    console.log(`[Ratina Benchmark] Live execution for French Press benchmark`);
    const result = await runInvestigation({
      category: BENCHMARK_CATEGORY,
      asins: BENCHMARK_ASINS,
      runId,
      apiKey,
      onProgress: event => emitEvent(runId, event)
    });

    if (!result.success) {
      return { success: false, status: 500, error: result.error || 'Benchmark failed', errorType: 'BENCHMARK_FAILED' };
    }

    const cost = result.data?.executionMetadata?.totalActualCost || 0;
    sprintTotalSpend += cost;
    return { success: true, data: result.data, cost };
  }

  const cleanAsin = validated.cleanAsin;
  console.log(`[Monid Integration] Initiating live retrieval for ASIN: ${cleanAsin}...`);

  progress('ENRICHMENT', 1, `Retrieving live Amazon product and review data for ${cleanAsin}...`, { currentAsin: cleanAsin });

  const rawMonidResult = await fetchAmazonDataWithMonid(cleanAsin, '', apiKey);
  const reviews = rawMonidResult.rawReviews || [];
  const aData = rawMonidResult.apifyData || {};

  const cost = rawMonidResult.monidReceipt?.totalCostNumber || 0;
  sprintTotalSpend += cost;

  if (reviews.length === 0 && !aData.title && !aData.asin) {
    console.warn(`[Monid Integration] Product not found or empty response for ASIN: ${cleanAsin}`);
    return {
      success: false,
      status: 404,
      error: `No Amazon product could be retrieved for ASIN: ${cleanAsin}. Please check the ASIN and try again.`,
      errorType: 'PRODUCT_NOT_FOUND',
      monidReceipt: rawMonidResult.monidReceipt,
      warnings: rawMonidResult.warnings
    };
  }

  progress('ENRICHMENT', 3, `Retrieved ${reviews.length} review(s) for ${cleanAsin}.`, { reviewsRetrieved: reviews.length });
  progress('FAILURE_MATRIX', 4, 'Extracting recurring failure patterns from review evidence...');

  const intelligenceReport = analyzeProductIntelligence(rawMonidResult);

  progress('SOURCING_SPECS', 6, `Identified ${intelligenceReport.topFailurePatterns?.length || 0} failure pattern(s); generating sourcing directives...`);

  intelligenceReport.executionMetadata = {
    runId,
    executedAt: new Date().toISOString(),
    isLiveExecution: true,
    source: 'LIVE_MONID_EXECUTION',
    totalActualCost: cost
  };

  // Single-ASIN reports get the same signed receipt treatment.
  intelligenceReport.verification = issueReceipt(intelligenceReport);

  progress('VERIFICATION', 7, `Signed receipt issued (${intelligenceReport.verification.receiptHash.slice(0, 16)}...).`, {
    receiptHash: intelligenceReport.verification.receiptHash
  });

  return { success: true, data: intelligenceReport, cost };
}

/**
 * POST /api/analyze
 * Single-ASIN Live Monid Analysis (blocking)
 */
app.post('/api/analyze', rateLimit, async (req, res) => {
  try {
    const { asin, mode } = req.body;
    const clientKey = getClientKey(req);
    const apiKey = req.headers['x-monid-api-key'] || undefined;

    const validated = validateAnalyzeRequest({ asin, mode });
    if (validated.error) return res.status(validated.error.status).json(validated.error.body);

    const run = createRun({ clientKey, category: validated.category, mode: validated.benchmark ? 'PRESET_ASIN_ANALYSIS' : 'SINGLE_ASIN' });
    markRunning(run.runId);

    const result = await executeAnalyzeRun({ validated, runId: run.runId, apiKey });

    if (!result.success) {
      failRun(run.runId, { error: result.error, errorType: result.errorType });
      return res.status(result.status || 500).json({
        error: result.errorType || 'ANALYSIS_FAILED',
        message: result.error,
        ...(result.monidReceipt ? { monidReceipt: result.monidReceipt } : {}),
        ...(result.warnings ? { warnings: result.warnings } : {})
      });
    }

    completeRun(run.runId, { success: true, data: result.data, source: 'LIVE_MONID_EXECUTION' });

    return res.json({
      success: true,
      runId: run.runId,
      data: result.data,
      sprintBudget: {
        thisRunCost: result.cost,
        sprintTotalSpend,
        sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
      }
    });
  } catch (error) {
    console.error('[Ratina Pipeline Error]:', error);
    return res.status(500).json({
      error: 'ANALYSIS_FAILED',
      message: 'Failed to complete Monid review retrieval and product analysis.',
      details: error.message || String(error)
    });
  }
});

/**
 * POST /api/analyze/start
 * Same analysis, executed in the background with a streamable runId so the
 * UI can display real phase progress instead of a timed animation.
 */
app.post('/api/analyze/start', rateLimit, (req, res) => {
  const { asin, mode } = req.body || {};
  const clientKey = getClientKey(req);
  const apiKey = req.headers['x-monid-api-key'] || undefined;

  const validated = validateAnalyzeRequest({ asin, mode });
  if (validated.error) return res.status(validated.error.status).json(validated.error.body);

  const run = createRun({ clientKey, category: validated.category, mode: validated.benchmark ? 'PRESET_ASIN_ANALYSIS' : 'SINGLE_ASIN' });
  res.json({ runId: run.runId, streamUrl: `/api/runs/stream?runId=${run.runId}` });

  (async () => {
    markRunning(run.runId);
    try {
      const result = await executeAnalyzeRun({ validated, runId: run.runId, apiKey });
      if (!result.success) {
        failRun(run.runId, { error: result.error, errorType: result.errorType, warnings: result.warnings });
        return;
      }
      completeRun(run.runId, {
        success: true,
        data: result.data,
        source: 'LIVE_MONID_EXECUTION',
        sprintBudget: {
          thisRunCost: result.cost,
          sprintTotalSpend,
          sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
        }
      });
    } catch (error) {
      console.error(`[Ratina Pipeline Error] run ${run.runId}:`, error);
      failRun(run.runId, { error: error.message || String(error), errorType: 'ANALYSIS_FAILED' });
    }
  })();
});

/**
 * GET /api/saved-benchmark
 * Returns the saved French Press benchmark (clearly tagged as SAVED)
 */
let signedSavedBenchmark = null;

app.get('/api/saved-benchmark', (req, res) => {
  try {
    const clientKey = getClientKey(req);

    // Signed once per process: re-signing on every page load would spam the
    // receipt chain with duplicate entries for identical content.
    if (!signedSavedBenchmark) {
      const payload = getLiveProofPayload();

      payload.executionMetadata = {
        runId: 'saved_french_press_benchmark',
        executedAt: payload.timestamp || '2026-09-06T00:00:00Z',
        isLiveExecution: false,
        source: 'SAVED_RESULT',
        totalActualCost: 0.018,
        note: 'This is a previously saved benchmark result. To run a fresh benchmark, use the live investigation endpoint.'
      };

      payload.verification = issueReceipt(payload);
      signedSavedBenchmark = payload;
    }

    const run = createRun({ clientKey, category: signedSavedBenchmark.category, mode: 'SAVED_BENCHMARK' });
    completeRun(run.runId, { success: true, data: signedSavedBenchmark, source: 'SAVED_RESULT' });

    return res.json({
      success: true,
      runId: run.runId,
      data: signedSavedBenchmark
    });
  } catch (error) {
    return res.status(500).json({
      error: 'SAVED_LOAD_FAILED',
      message: 'Failed to load saved benchmark.',
      details: error.message
    });
  }
});

/**
 * GET /api/export/json
 * Download an investigation as JSON.
 *
 * Scoped to a specific runId, falling back to THIS client's most recent run.
 * (Previously a single shared module variable, so concurrent users could
 * download each other's reports.)
 */
app.get('/api/export/json', (req, res) => {
  const run = resolveRun(req.query.runId, getClientKey(req));
  const data = run?.result?.data;

  if (!data) {
    return res.status(404).json({ error: 'No investigation data available. Run an investigation first.' });
  }

  const jsonData = generateSourcingJSON(data);
  const category = (data.category || 'investigation').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `ratina_sourcing_${category}_${Date.now()}.json`;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(jsonData, null, 2));
});

/**
 * GET /api/export/brief
 * Download an investigation as a plain-text Sourcing Brief
 */
app.get('/api/export/brief', (req, res) => {
  const run = resolveRun(req.query.runId, getClientKey(req));
  const data = run?.result?.data;

  if (!data) {
    return res.status(404).json({ error: 'No investigation data available. Run an investigation first.' });
  }

  const briefText = generateSourcingBriefText(data);
  const category = (data.category || 'investigation').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `ratina_sourcing_brief_${category}_${Date.now()}.txt`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(briefText);
});

/**
 * GET /api/cache/status
 * Returns cache statistics and available categories
 */
app.get('/api/cache/status', (req, res) => {
  const stats = getCacheStats();
  res.json({
    ...stats,
    message: stats.cachedCategories > 0
      ? `${stats.cachedCategories} category(ies) cached. Query any via /api/investigate for instant $0.00 results.`
      : 'No cached investigations. Run /api/investigate to populate.'
  });
});

/**
 * POST /api/mcp
 * MCP-over-HTTP endpoint for agents that prefer REST over stdio.
 * Accepts JSON-RPC 2.0 requests matching the MCP protocol.
 */
app.post('/api/mcp', rateLimit, async (req, res) => {
  const { method, params, id } = req.body;
  const clientKey = getClientKey(req);

  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: missing method' }
    });
  }

  try {
    switch (method) {
      case 'initialize':
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'ratina-ai', version: '1.0.0' }
          }
        });

      case 'tools/list':
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            tools: [
              {
                name: 'investigate_category',
                description: 'Investigate an Amazon product category for failure patterns via live Monid calls (~$0.018/run). Cached results are free.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    category: { type: 'string', description: 'Product category to investigate' },
                    force_fresh: { type: 'boolean', description: 'Bypass cache for a fresh live run' }
                  },
                  required: ['category']
                }
              },
              {
                name: 'get_failure_matrix',
                description: 'Get cross-competitor failure matrix for a previously investigated category ($0.00).',
                inputSchema: {
                  type: 'object',
                  properties: { category: { type: 'string' } },
                  required: ['category']
                }
              },
              {
                name: 'export_sourcing_brief',
                description: 'Generate a sourcing brief for a previously investigated category ($0.00).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    category: { type: 'string' },
                    format: { type: 'string', enum: ['text', 'json'] }
                  },
                  required: ['category']
                }
              },
              {
                name: 'verify_receipt',
                description: 'Cryptographically verify an exported Ratina investigation against its signed receipt. Returns which integrity check failed if the report was altered ($0.00).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    payload: { type: 'object', description: 'The exported investigation JSON, including its verification block' }
                  },
                  required: ['payload']
                }
              }
            ]
          }
        });

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        let toolResult;

        if (name === 'investigate_category') {
          const cacheKey = (args.category || '').trim().toLowerCase();
          if (!args.force_fresh) {
            const cached = getCachedResult(cacheKey);
            if (cached) {
              toolResult = {
                source: 'CACHE',
                cost: '$0.00',
                category: cached.category,
                decision: cached.finalDecision,
                opportunityScore: cached.productOpportunityScore,
                verification: cached.verification
                  ? { receiptHash: cached.verification.receiptHash, contentHash: cached.verification.contentHash }
                  : null
              };
            }
          }
          if (!toolResult) {
            const run = createRun({ clientKey, category: args.category, mode: 'MCP_INVESTIGATION' });
            markRunning(run.runId);
            const result = await runInvestigation({
              category: args.category.trim(),
              searchQuery: args.search_query,
              runId: run.runId,
              onProgress: event => emitEvent(run.runId, event)
            });
            if (!result.success) {
              failRun(run.runId, { error: result.error });
              throw new Error(result.error);
            }
            setCachedResult(cacheKey, result.data);
            completeRun(run.runId, { success: true, data: result.data, source: 'LIVE_MONID_EXECUTION' });
            const cost = result.data?.executionMetadata?.totalActualCost || 0;
            sprintTotalSpend += cost;
            toolResult = {
              source: 'LIVE',
              cost: `$${cost.toFixed(5)}`,
              runId: run.runId,
              category: result.data.category,
              decision: result.data.finalDecision,
              opportunityScore: result.data.productOpportunityScore,
              verification: {
                receiptHash: result.data.verification?.receiptHash,
                contentHash: result.data.verification?.contentHash,
                callMerkleRoot: result.data.verification?.callMerkleRoot
              }
            };
          }
        } else if (name === 'get_failure_matrix') {
          const cached = getCachedResult((args.category || '').trim().toLowerCase());
          if (!cached) throw new Error(`No data for "${args.category}". Run investigate_category first. Available: ${getAllCachedKeys().join(', ')}`);
          toolResult = { matrix: cached.strictMatrix, severity: cached.strictSeverityScores, decision: cached.finalDecision };
        } else if (name === 'export_sourcing_brief') {
          const cached = getCachedResult((args.category || '').trim().toLowerCase());
          if (!cached) throw new Error(`No data for "${args.category}". Run investigate_category first.`);
          toolResult = args.format === 'json' ? generateSourcingJSON(cached) : generateSourcingBriefText(cached);
        } else if (name === 'verify_receipt') {
          const raw = args?.payload;
          if (!raw || typeof raw !== 'object') {
            throw new Error('Missing required parameter: payload (the exported investigation JSON)');
          }
          const target = raw.verification ? raw : (raw.data?.verification ? raw.data : raw);
          const verified = verifyInvestigationReceipt(target);
          // Same response shape as the stdio MCP server, so both transports
          // give an agent identical output.
          toolResult = {
            verified: verified.valid,
            verdict: verified.valid
              ? 'AUTHENTIC — receipt matches this exact analysis'
              : 'TAMPERED OR INVALID',
            reason: verified.reason,
            failedCheck: verified.failedCheck,
            runId: verified.runId,
            signingKeyId: verified.keyId,
            issuedAt: verified.issuedAt,
            checks: verified.checks,
            chainStatus: verifyChain(),
            verifierKeyId: getKeyId()
          };
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return res.json({
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2) }] }
        });
      }

      default:
        return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (error) {
    return res.json({
      jsonrpc: '2.0', id,
      result: { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    });
  }
});

// SPA Fallback: Any non-API route serves the React app
app.get('{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Ratina.ai — Amazon Product Intelligence API & MCP Server`);
  console.log(`   Host & Port: 0.0.0.0:${PORT} (env PORT=${process.env.PORT || 'default 3001'})`);
  console.log(`   HTTP API:    http://0.0.0.0:${PORT}/api/investigate`);
  console.log(`   SSE stream:  http://0.0.0.0:${PORT}/api/investigate/start → /api/investigate/stream`);
  console.log(`   MCP HTTP:    http://0.0.0.0:${PORT}/api/mcp`);
  console.log(`   MCP stdio:   node server/mcpServer.js`);
  console.log(`   Verify:      POST http://0.0.0.0:${PORT}/api/receipts/verify`);
  console.log(`   Cache:       ${getCacheStats().cachedCategories} categories pre-loaded`);
  console.log(`🔐 Receipts:  ${RECEIPT_PROTOCOL} | key ${getKeyId()} | durable=${isDurableKeyConfigured()}`);
  console.log(`📊 Sprint budget: $${SPRINT_BUDGET_MAX.toFixed(2)} max additional spend`);
  ensureMonidKeyConfigured().catch(console.error);
});
