/**
 * Ratina.ai Investigation Cache
 * 
 * In-memory + file-persisted cache for investigation results.
 * Allows instant ($0.00) responses for previously investigated categories
 * while preserving the ability to run fresh live Monid investigations.
 * 
 * Cache is keyed by normalized category name (lowercase, trimmed).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLiveProofPayload } from './liveProofPayload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '..', 'temp', 'cache');
const CACHE_INDEX_FILE = path.join(CACHE_DIR, '_index.json');

// In-memory cache (fast lookups)
const memoryCache = new Map();

// ─── INITIALIZATION ────────────────────────────────────────────────────────────

/**
 * Ensure cache directory exists and load persisted cache index.
 */
function initCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // Load persisted cache index
    if (fs.existsSync(CACHE_INDEX_FILE)) {
      const index = JSON.parse(fs.readFileSync(CACHE_INDEX_FILE, 'utf8'));
      for (const entry of index) {
        const filePath = path.join(CACHE_DIR, entry.file);
        if (fs.existsSync(filePath)) {
          try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            memoryCache.set(entry.key, data);
          } catch (e) {
            // Skip corrupt cache files
          }
        }
      }
      if (memoryCache.size > 0) {
        console.log(`[Ratina Cache] Loaded ${memoryCache.size} cached investigation(s) from disk.`);
      }
    }
  } catch (e) {
    console.warn('[Ratina Cache] Failed to initialize cache directory:', e.message);
  }
}

// Initialize on module load
initCache();

// Seed from existing live proof artifacts
seedFromLiveProof();

// ─── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Get a cached investigation result by normalized category key.
 * @param {string} key - Normalized category name (lowercase)
 * @returns {object|null} - The cached investigation data, or null
 */
export function getCachedResult(key) {
  return memoryCache.get(key) || null;
}

/**
 * Store an investigation result in the cache (memory + disk).
 * @param {string} key - Normalized category name (lowercase)
 * @param {object} data - Full investigation result data
 */
export function setCachedResult(key, data) {
  // Add cache metadata
  const cachedData = {
    ...data,
    _cachedAt: new Date().toISOString(),
    _cacheKey: key
  };

  // Memory cache
  memoryCache.set(key, cachedData);

  // Persist to disk
  try {
    const safeFileName = key.replace(/[^a-z0-9]+/g, '_').slice(0, 60) + '.json';
    const filePath = path.join(CACHE_DIR, safeFileName);
    fs.writeFileSync(filePath, JSON.stringify(cachedData, null, 2));

    // Update index
    const index = getAllCachedEntries();
    const existing = index.findIndex(e => e.key === key);
    if (existing >= 0) {
      index[existing] = { key, file: safeFileName, cachedAt: cachedData._cachedAt };
    } else {
      index.push({ key, file: safeFileName, cachedAt: cachedData._cachedAt });
    }
    fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2));
  } catch (e) {
    console.warn('[Ratina Cache] Failed to persist cache to disk:', e.message);
  }
}

/**
 * Get all cached category keys.
 * @returns {string[]}
 */
export function getAllCachedKeys() {
  return Array.from(memoryCache.keys());
}

/**
 * Get all cached entries (for index management).
 * @returns {Array<{key: string, file: string, cachedAt: string}>}
 */
function getAllCachedEntries() {
  try {
    if (fs.existsSync(CACHE_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_INDEX_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore
  }
  return [];
}

/**
 * Check if a category has been cached.
 * @param {string} key - Normalized category name
 * @returns {boolean}
 */
export function hasCachedResult(key) {
  return memoryCache.has(key);
}

/**
 * Get cache stats for the health endpoint.
 */
export function getCacheStats() {
  return {
    cachedCategories: memoryCache.size,
    categories: getAllCachedKeys(),
    cacheDir: CACHE_DIR
  };
}

// ─── SEED FROM EXISTING LIVE PROOF ────────────────────────────────────────────

/**
 * Seed the cache from any existing live proof artifacts in temp/
 * and from the liveProofPayload module.
 * This means the French Press and Portable Blender proofs are
 * instantly available without re-running Monid.
 */
function seedFromLiveProof() {
  const tempDir = path.join(__dirname, '..', 'temp');
  
  try {
    // Seed from the liveProofPayload (French Press benchmark)
    try {
      const payload = getLiveProofPayload();
      if (payload && payload.category) {
        const key = payload.category.toLowerCase().trim();
        if (!memoryCache.has(key)) {
          memoryCache.set(key, {
            ...payload,
            _cachedAt: payload.timestamp || new Date().toISOString(),
            _cacheKey: key,
            _source: 'LIVE_PROOF_PAYLOAD'
          });
          console.log(`[Ratina Cache] Seeded from live proof payload: "${payload.category}"`);
        }
      }
    } catch (e) {
      // liveProofPayload may not be available
    }

    if (!fs.existsSync(tempDir)) return;

    const proofFiles = [
      'live_proof_portable_blenders.json',
      'live_proof_french_press_coffee_makers_34oz_1_liter.json'
    ];

    for (const file of proofFiles) {
      const filePath = path.join(tempDir, file);
      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (data.category) {
            const key = data.category.toLowerCase().trim();
            if (!memoryCache.has(key)) {
              memoryCache.set(key, {
                ...data,
                _cachedAt: data.timestamp || new Date().toISOString(),
                _cacheKey: key,
                _source: 'LIVE_PROOF_ARTIFACT'
              });
              console.log(`[Ratina Cache] Seeded from live proof: "${data.category}"`);
            }
          }
        } catch (e) {
          // Skip corrupt proof files
        }
      }
    }
  } catch (e) {
    // Non-critical — cache will still work without seeds
  }
}
