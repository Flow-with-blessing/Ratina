/**
 * Ratina.ai Run Store
 *
 * Replaces the previous single shared `lastInvestigationResult` module
 * variable, which caused concurrent users to overwrite each other's results
 * (user B's investigation would silently become user A's export).
 *
 * Each run is tracked independently by runId and owned by a client key, with:
 *   - a buffered progress event log (so an SSE client that connects late,
 *     reconnects, or is slow still receives every phase in order)
 *   - live subscribers for streaming
 *   - terminal state (result or error)
 *   - TTL eviction so long-lived processes don't leak memory
 */

import { secureId } from './receiptService.js';

const RUN_TTL_MS = 30 * 60 * 1000;   // keep completed runs for 30 minutes
const MAX_RUNS = 200;                // hard cap on retained runs
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** runId -> run record */
const runs = new Map();

/** clientKey -> most recent runId (used for export fallback) */
const latestByClient = new Map();

export function createRun({ clientKey, category, mode = 'INVESTIGATION', authMode = 'SPONSORED_TRIAL' }) {
  const runId = secureId('run');

  const run = {
    runId,
    clientKey,
    category,
    mode,
    authMode,
    status: 'QUEUED',          // QUEUED | RUNNING | COMPLETE | ERROR
    events: [],
    subscribers: new Set(),
    result: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null
  };

  runs.set(runId, run);
  if (clientKey) latestByClient.set(clientKey, runId);

  evictIfNeeded();
  return run;
}

export function getRun(runId) {
  return runs.get(runId) || null;
}

/**
 * Resolve a run for an export/read request.
 * Explicit runId wins; otherwise fall back to this client's own latest run —
 * never to a global "last result" that could belong to another user.
 */
export function resolveRun(runId, clientKey) {
  if (runId) {
    const run = runs.get(runId);
    if (run) return run;
    // Expired or from a previous process (e.g. a cached result carrying its
    // original run id). Fall back to this client's own latest run — never to
    // a global "last result" that could belong to somebody else.
  }
  const latestId = latestByClient.get(clientKey);
  return latestId ? runs.get(latestId) || null : null;
}

/**
 * Append a progress event: buffered for replay AND pushed to live subscribers.
 */
export function emitEvent(runId, event) {
  const run = runs.get(runId);
  if (!run) return;

  const enriched = {
    ...event,
    seq: run.events.length + 1,
    at: new Date().toISOString()
  };

  run.events.push(enriched);

  for (const send of run.subscribers) {
    try {
      send(enriched);
    } catch (e) {
      // A broken pipe must never interrupt the pipeline.
    }
  }
}

export function subscribe(runId, send) {
  const run = runs.get(runId);
  if (!run) return () => {};

  // Replay everything already emitted so late joiners see the full history.
  for (const event of run.events) {
    try {
      send(event);
    } catch (e) {
      /* ignore */
    }
  }

  run.subscribers.add(send);
  return () => run.subscribers.delete(send);
}

export function markRunning(runId) {
  const run = runs.get(runId);
  if (run) run.status = 'RUNNING';
}

export function completeRun(runId, result) {
  const run = runs.get(runId);
  if (!run) return;
  run.status = 'COMPLETE';
  run.result = result;
  run.completedAt = Date.now();
}

export function failRun(runId, error) {
  const run = runs.get(runId);
  if (!run) return;
  run.status = 'ERROR';
  run.error = error;
  run.completedAt = Date.now();
}

export function isTerminal(run) {
  return run && (run.status === 'COMPLETE' || run.status === 'ERROR');
}

export function getStats() {
  let running = 0;
  let complete = 0;
  let errored = 0;
  for (const run of runs.values()) {
    if (run.status === 'RUNNING' || run.status === 'QUEUED') running++;
    else if (run.status === 'COMPLETE') complete++;
    else errored++;
  }
  return { tracked: runs.size, running, complete, errored };
}

// ─── EVICTION ─────────────────────────────────────────────────────────────────

function evictIfNeeded() {
  if (runs.size <= MAX_RUNS) return;
  const sorted = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const run of sorted) {
    if (runs.size <= MAX_RUNS) break;
    if (isTerminal(run)) dropRun(run);
  }
}

function dropRun(run) {
  runs.delete(run.runId);
  if (run.clientKey && latestByClient.get(run.clientKey) === run.runId) {
    latestByClient.delete(run.clientKey);
  }
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const run of runs.values()) {
    if (isTerminal(run) && run.completedAt && run.completedAt < cutoff && run.subscribers.size === 0) {
      dropRun(run);
    }
  }
}, SWEEP_INTERVAL_MS);

// Never hold the event loop open just for cache sweeping.
if (typeof sweeper.unref === 'function') sweeper.unref();
