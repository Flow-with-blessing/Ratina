/**
 * Ratina.ai Verifiable Receipt Service
 *
 * Produces tamper-evident, cryptographically signed receipts for every
 * investigation run. This is real cryptography, not metadata labelling:
 *
 *   1. CANONICAL SERIALIZATION — deterministic key ordering so the same
 *      analysis always hashes to the same digest on any machine.
 *   2. CONTENT HASH — SHA-256 over the canonicalized analysis payload.
 *   3. MERKLE ROOT — binary Merkle tree over per-Monid-call digests, so any
 *      single upstream data call can be proven to belong to the run without
 *      revealing the rest (inclusion proofs supported).
 *   4. HASH CHAIN — every receipt commits to the previous receipt's hash,
 *      producing an append-only ledger: altering receipt N invalidates every
 *      receipt after it.
 *   5. HMAC-SHA256 SIGNATURE — the receipt hash is signed with a server-held
 *      secret, so a third party cannot forge a receipt that verifies.
 *
 * Verification is exposed at POST /api/receipts/verify — tamper with a single
 * digit of an exported report and verification fails with the exact reason.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECEIPT_DIR = path.join(__dirname, '..', 'temp', 'receipts');
const LEDGER_FILE = path.join(RECEIPT_DIR, 'ledger.json');

export const RECEIPT_PROTOCOL = 'ratina-verifiable-receipt-v1';
export const HASH_ALGORITHM = 'SHA-256';
export const SIGNATURE_ALGORITHM = 'HMAC-SHA256';

// Genesis hash anchors the chain. Fixed constant, publicly reproducible.
export const GENESIS_HASH = sha256Hex('ratina.ai/receipt-chain/genesis/v1');

// ─── SIGNING KEY ──────────────────────────────────────────────────────────────

let EPHEMERAL_KEY_WARNING_SHOWN = false;

function getSigningSecret() {
  const configured = process.env.RATINA_RECEIPT_SECRET;
  if (configured && configured.length >= 16) return configured;

  // No configured secret: derive a stable-per-process ephemeral key so the
  // demo still produces verifiable receipts, but warn loudly — receipts will
  // not verify across restarts without RATINA_RECEIPT_SECRET set.
  if (!globalThis.__ratinaEphemeralReceiptKey) {
    globalThis.__ratinaEphemeralReceiptKey = crypto.randomBytes(32).toString('hex');
  }
  if (!EPHEMERAL_KEY_WARNING_SHOWN) {
    console.warn(
      '[Ratina Receipts] RATINA_RECEIPT_SECRET is not set. Using an ephemeral ' +
      'signing key — receipts issued now will NOT verify after a restart. ' +
      'Set RATINA_RECEIPT_SECRET in your environment for durable verification.'
    );
    EPHEMERAL_KEY_WARNING_SHOWN = true;
  }
  return globalThis.__ratinaEphemeralReceiptKey;
}

/**
 * Public key identifier — a digest of the secret, safe to publish.
 * Lets a verifier confirm which key signed a receipt without exposing it.
 */
export function getKeyId() {
  return sha256Hex(`ratina-key-id:${getSigningSecret()}`).slice(0, 16);
}

export function isDurableKeyConfigured() {
  const configured = process.env.RATINA_RECEIPT_SECRET;
  return Boolean(configured && configured.length >= 16);
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministic JSON serialization: object keys sorted recursively so that
 * two structurally identical payloads always produce an identical string
 * (and therefore an identical hash) regardless of insertion order.
 */
export function canonicalize(value) {
  if (value === null || value === undefined) return 'null';

  const type = typeof value;
  if (type === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (type === 'boolean' || type === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value)
      .filter(k => value[k] !== undefined && typeof value[k] !== 'function')
      .sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return 'null';
}

export function hashObject(obj) {
  return sha256Hex(canonicalize(obj));
}

/**
 * Strip fields that are transport metadata rather than signed content:
 *   - `verification` (a receipt cannot commit to itself)
 *   - any top-level `_`-prefixed key (cache bookkeeping such as `_cachedAt`,
 *     `_cacheKey`, `_source`), which is attached after signing and must not
 *     invalidate an otherwise-intact payload.
 */
export function stripUnsigned(payload) {
  const content = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (key === 'verification' || key.startsWith('_')) continue;
    content[key] = value;
  }
  return content;
}

function hmacHex(message) {
  return crypto.createHmac('sha256', getSigningSecret()).update(message, 'utf8').digest('hex');
}

/**
 * Constant-time comparison to avoid timing side channels on signature checks.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── MERKLE TREE OVER MONID CALLS ─────────────────────────────────────────────

/**
 * Hash a single Monid call record. Only the fields that constitute evidence
 * are committed to — volatile fields are excluded so replays stay stable.
 */
export function hashCallRecord(call) {
  return hashObject({
    callId: call.callId ?? null,
    endpoint: call.endpoint ?? null,
    provider: call.provider ?? null,
    asin: call.asin ?? null,
    httpStatus: call.httpStatus ?? call.status ?? null,
    costUSD: call.costUSD ?? 0,
    latencyMs: call.latencyMs ?? 0,
    startTime: call.startTime ?? null,
    attempt: call.attempt ?? null,
    error: call.error ?? null
  });
}

/**
 * Build a binary Merkle tree. Returns the root plus every level, so
 * inclusion proofs can be derived for any individual call.
 */
export function buildMerkleTree(leafHashes) {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
    return { root: sha256Hex('ratina:empty-merkle'), levels: [[]], leafCount: 0 };
  }

  const levels = [leafHashes.slice()];
  let current = leafHashes.slice();

  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      // Odd node out is promoted by hashing with itself (standard practice).
      const right = current[i + 1] ?? current[i];
      next.push(sha256Hex(`${left}${right}`));
    }
    levels.push(next);
    current = next;
  }

  return { root: current[0], levels, leafCount: leafHashes.length };
}

/**
 * Merkle inclusion proof for the call at `index`: the sibling hashes needed
 * to recompute the root. Lets a judge verify one specific Monid call was part
 * of the run without needing the full payload.
 */
export function buildInclusionProof(levels, index) {
  const proof = [];
  let idx = index;

  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : (idx + 1 < nodes.length ? idx + 1 : idx);
    proof.push({ position: isRight ? 'left' : 'right', hash: nodes[siblingIdx] });
    idx = Math.floor(idx / 2);
  }

  return proof;
}

export function verifyInclusionProof(leafHash, proof, expectedRoot) {
  let computed = leafHash;
  for (const step of proof) {
    computed = step.position === 'left'
      ? sha256Hex(`${step.hash}${computed}`)
      : sha256Hex(`${computed}${step.hash}`);
  }
  return computed === expectedRoot;
}

// ─── LEDGER (APPEND-ONLY HASH CHAIN) ──────────────────────────────────────────

let ledger = [];
let ledgerLoaded = false;

function loadLedger() {
  if (ledgerLoaded) return;
  ledgerLoaded = true;
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
      if (Array.isArray(parsed)) ledger = parsed;
    }
  } catch (e) {
    console.warn('[Ratina Receipts] Could not load ledger:', e.message);
  }
}

function persistLedger() {
  try {
    if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf8');
  } catch (e) {
    // Ephemeral filesystems (Railway) may not persist — chain still valid in-process.
    console.warn('[Ratina Receipts] Could not persist ledger:', e.message);
  }
}

export function getChainHead() {
  loadLedger();
  return ledger.length > 0 ? ledger[ledger.length - 1].receiptHash : GENESIS_HASH;
}

export function getLedger() {
  loadLedger();
  return ledger.slice();
}

/**
 * Re-verify the entire chain: every link must point at its predecessor and
 * every signature must still validate.
 */
export function verifyChain() {
  loadLedger();
  let expectedPrev = GENESIS_HASH;

  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];

    if (entry.prevReceiptHash !== expectedPrev) {
      return {
        valid: false,
        brokenAtIndex: i,
        runId: entry.runId,
        reason: `Chain break at entry ${i}: prevReceiptHash does not match the previous receipt.`
      };
    }

    const recomputed = computeReceiptHash(entry);
    if (recomputed !== entry.receiptHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        runId: entry.runId,
        reason: `Entry ${i} has been altered: recomputed receipt hash does not match.`
      };
    }

    if (!safeEqual(hmacHex(entry.receiptHash), entry.signature)) {
      return {
        valid: false,
        brokenAtIndex: i,
        runId: entry.runId,
        reason: `Entry ${i} signature is invalid for the current signing key.`
      };
    }

    expectedPrev = entry.receiptHash;
  }

  return { valid: true, entries: ledger.length, head: expectedPrev };
}

// ─── RECEIPT ISSUANCE ─────────────────────────────────────────────────────────

/**
 * The receipt hash commits to all identifying fields. Kept in one place so
 * issuance and verification can never drift apart.
 */
function computeReceiptHash(receipt) {
  return hashObject({
    protocol: receipt.protocol,
    runId: receipt.runId,
    category: receipt.category,
    contentHash: receipt.contentHash,
    callMerkleRoot: receipt.callMerkleRoot,
    callCount: receipt.callCount,
    totalCostUSD: receipt.totalCostUSD,
    isLiveExecution: receipt.isLiveExecution,
    dataSource: receipt.dataSource,
    issuedAt: receipt.issuedAt,
    prevReceiptHash: receipt.prevReceiptHash,
    keyId: receipt.keyId
  });
}

/**
 * Issue a signed, chained receipt for a completed investigation payload.
 *
 * The `verification` block is excluded from the content hash (it cannot
 * commit to itself), so verification recomputes over the payload minus that
 * block — exactly what verifyInvestigationReceipt does.
 *
 * @param {Object} payload - Full investigation result
 * @returns {Object} verification block to attach to the payload
 */
export function issueReceipt(payload) {
  loadLedger();

  const content = stripUnsigned(payload);

  const callRecords = payload?.monidReceipt?.callBreakdown || [];
  const leafHashes = callRecords.map(hashCallRecord);
  const { root: callMerkleRoot, levels } = buildMerkleTree(leafHashes);

  const receipt = {
    protocol: RECEIPT_PROTOCOL,
    hashAlgorithm: HASH_ALGORITHM,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    runId: payload?.executionMetadata?.runId || 'unknown',
    category: payload?.category || 'unknown',
    contentHash: hashObject(content),
    callMerkleRoot,
    callCount: leafHashes.length,
    totalCostUSD: payload?.monidReceipt?.totalMonidCostNumber ?? 0,
    isLiveExecution: Boolean(payload?.executionMetadata?.isLiveExecution),
    dataSource: payload?.executionMetadata?.source || 'UNKNOWN',
    issuedAt: new Date().toISOString(),
    prevReceiptHash: getChainHead(),
    keyId: getKeyId()
  };

  receipt.receiptHash = computeReceiptHash(receipt);
  receipt.signature = hmacHex(receipt.receiptHash);

  // Per-call digests + inclusion proofs, so a single Monid call is provable.
  receipt.callDigests = callRecords.map((call, i) => ({
    callIndex: i + 1,
    callId: call.callId,
    endpoint: call.endpoint,
    leafHash: leafHashes[i],
    inclusionProof: buildInclusionProof(levels, i)
  }));

  receipt.durableKey = isDurableKeyConfigured();
  receipt.verifyEndpoint = 'POST /api/receipts/verify';

  // Append to the chain (ledger stores the receipt without the bulky proofs).
  const { callDigests, ...ledgerEntry } = receipt;
  ledger.push(ledgerEntry);
  persistLedger();

  return receipt;
}

/**
 * Verify a receipt against the payload it claims to describe.
 *
 * Checks, in order:
 *   - the receipt is structurally a Ratina receipt
 *   - the content hash still matches the payload (detects ANY data tampering)
 *   - the Merkle root still matches the Monid call records
 *   - the receipt hash is internally consistent
 *   - the HMAC signature validates under the current signing key
 *
 * @param {Object} payload - Investigation payload including its `verification` block
 * @returns {Object} { valid, checks[], failedCheck, reason }
 */
export function verifyInvestigationReceipt(payload) {
  const checks = [];
  const receipt = payload?.verification;

  if (!receipt || receipt.protocol !== RECEIPT_PROTOCOL) {
    return {
      valid: false,
      failedCheck: 'PROTOCOL',
      reason: 'No Ratina verification block found on this payload.',
      checks
    };
  }

  const content = stripUnsigned(payload);

  // 1. Content integrity
  const recomputedContentHash = hashObject(content);
  const contentOk = recomputedContentHash === receipt.contentHash;
  checks.push({
    check: 'CONTENT_HASH',
    passed: contentOk,
    expected: receipt.contentHash,
    computed: recomputedContentHash,
    detail: contentOk
      ? 'Analysis payload is byte-for-byte identical to what was signed.'
      : 'Analysis payload has been modified since the receipt was issued.'
  });

  // 2. Merkle root over Monid calls
  const callRecords = payload?.monidReceipt?.callBreakdown || [];
  const recomputedRoot = buildMerkleTree(callRecords.map(hashCallRecord)).root;
  const merkleOk = recomputedRoot === receipt.callMerkleRoot;
  checks.push({
    check: 'CALL_MERKLE_ROOT',
    passed: merkleOk,
    expected: receipt.callMerkleRoot,
    computed: recomputedRoot,
    detail: merkleOk
      ? `All ${callRecords.length} Monid call records are intact.`
      : 'Monid call records have been added, removed, or altered.'
  });

  // 3. Receipt hash consistency
  const recomputedReceiptHash = computeReceiptHash(receipt);
  const receiptHashOk = recomputedReceiptHash === receipt.receiptHash;
  checks.push({
    check: 'RECEIPT_HASH',
    passed: receiptHashOk,
    expected: receipt.receiptHash,
    computed: recomputedReceiptHash,
    detail: receiptHashOk
      ? 'Receipt fields are self-consistent.'
      : 'Receipt metadata has been altered.'
  });

  // 4. Signature
  const signatureOk = safeEqual(hmacHex(receipt.receiptHash), receipt.signature || '');
  checks.push({
    check: 'SIGNATURE',
    passed: signatureOk,
    detail: signatureOk
      ? `Valid HMAC-SHA256 signature from key ${receipt.keyId}.`
      : 'Signature does not validate under this server\'s signing key. ' +
        (receipt.durableKey === false
          ? 'This receipt was issued with an ephemeral key (RATINA_RECEIPT_SECRET unset) and cannot verify after a restart.'
          : 'The receipt was forged, or signed by a different key.')
  });

  const failed = checks.find(c => !c.passed);

  return {
    valid: !failed,
    failedCheck: failed?.check || null,
    reason: failed ? failed.detail : 'All cryptographic checks passed.',
    runId: receipt.runId,
    keyId: receipt.keyId,
    issuedAt: receipt.issuedAt,
    checks
  };
}

/**
 * Cryptographically strong identifier (replaces Math.random-based IDs).
 */
export function secureId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}
