import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { secureId } from './receiptService.js';

const execAsync = promisify(exec);

// Per-call cost rates (USD) from Monid endpoint pricing
const COST_RATES = {
  'apify/axesso_data/amazon-search-scraper': 0.00015,   // per result/query
  'apify/axesso_data/amazon-reviews-scraper': 0.00135,   // per result
  'apify/delicious_zebu/amazon-product-details-scraper': 0.00225  // per result
};

/**
 * Generate a unique call ID for tracking.
 * Uses crypto-strong randomness: call IDs are committed to in signed
 * receipts, so they must not be predictable or collision-prone.
 */
function generateCallId() {
  return secureId('mc');
}

/**
 * Executes a Monid CLI command with retry logic, per-call metadata, and robust error handling.
 * 
 * @param {Object} options
 * @param {string} options.provider - Monid provider name
 * @param {string} options.endpoint - Monid endpoint path
 * @param {Object} options.input - JSON input payload
 * @param {number} [options.timeoutSec=120] - Timeout in seconds
 * @param {number} [options.maxRetries=2] - Max retry attempts (0 = no retries)
 * @param {string} [options.context=''] - Human-readable context for logging
 * @returns {Object} Result with success, output, callMetadata, warnings
 */
export async function runMonidEndpoint({ provider, endpoint, input, timeoutSec = 120, maxRetries = 2, context = '', apiKey }) {
  // SECURITY: Validate provider and endpoint contain only safe CLI characters
  const SAFE_CLI_ARG = /^[a-zA-Z0-9\/_-]+$/;
  if (!SAFE_CLI_ARG.test(provider) || !SAFE_CLI_ARG.test(endpoint)) {
    return {
      success: false,
      provider,
      endpoint,
      error: `Invalid characters in provider/endpoint: "${provider}${endpoint}"`,
      callMetadata: { callId: generateCallId(), provider, endpoint: `${provider}${endpoint}`, costUSD: 0, httpStatus: 'REJECTED' },
      warnings: ['Request rejected: provider/endpoint failed character validation']
    };
  }

  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const callId = generateCallId();
  const endpointKey = `${provider}${endpoint}`;
  const costRate = COST_RATES[endpointKey] || 0;
  
  let lastError = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    // Crypto-strong suffixes: concurrent investigations must never collide
    // on scratch filenames (Date.now() alone is not unique under load).
    const inputFile = path.join(tempDir, `${secureId('monid_in')}.json`);
    const outputFile = path.join(tempDir, `${secureId('monid_out')}.json`);

    try {
      fs.writeFileSync(inputFile, JSON.stringify(input, null, 2), 'utf8');

      const cmd = `monid run -p ${provider} -e ${endpoint} -f "${inputFile}" -w ${timeoutSec} -o "${outputFile}" -j`;
      
      const startTime = Date.now();
      console.log(`[Monid Call ${callId}] Attempt ${attempt + 1}/${maxRetries + 1}: ${provider}${endpoint} ${context}`);
      
      const binDir = path.join(process.cwd(), 'node_modules', '.bin');
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const augmentedPath = `${binDir}${pathSeparator}${process.env.PATH || ''}`;

      const env = {
        ...(apiKey ? { ...process.env, MONID_API_KEY: apiKey } : process.env),
        PATH: augmentedPath
      };

      const { stdout, stderr } = await execAsync(cmd, { 
        cwd: process.cwd(),
        env,
        timeout: (timeoutSec + 30) * 1000 // OS-level timeout buffer
      });
      const endTime = Date.now();
      const latencyMs = endTime - startTime;

      let outputData = null;
      let warnings = [];

      if (fs.existsSync(outputFile)) {
        const rawOut = fs.readFileSync(outputFile, 'utf8');
        try {
          outputData = JSON.parse(rawOut);
        } catch (e) {
          outputData = rawOut;
          warnings.push('Output was not valid JSON');
        }
      } else if (stdout) {
        try {
          outputData = JSON.parse(stdout);
        } catch (e) {
          outputData = stdout;
          warnings.push('Stdout output was not valid JSON');
        }
      }

      // Check for empty/null output
      if (outputData === null || outputData === undefined) {
        warnings.push('Monid returned empty output');
      }

      // Clean up temporary files
      cleanupFiles(inputFile, outputFile);

      const callMetadata = {
        callId,
        provider,
        endpoint: `${provider}${endpoint}`,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        latencyMs,
        costUSD: costRate,
        attempt: attempt + 1,
        totalAttempts: attempt + 1,
        httpStatus: '200 OK',
        context
      };

      return {
        success: true,
        provider,
        endpoint,
        latencyMs,
        output: outputData,
        stdout,
        warnings,
        callMetadata
      };

    } catch (error) {
      cleanupFiles(inputFile, outputFile);
      lastError = error;
      
      const errorMsg = error.message || String(error);
      
      // Check for retryable errors (429, 5xx, timeout)
      const is429 = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Too Many');
      const is5xx = /5\d\d/.test(errorMsg) || errorMsg.includes('Internal Server') || errorMsg.includes('Bad Gateway');
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('killed');
      const isRetryable = is429 || is5xx || isTimeout;

      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s)
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`[Monid Call ${callId}] Retryable error (attempt ${attempt + 1}): ${errorMsg}. Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        attempt++;
        continue;
      }

      // Non-retryable or retries exhausted
      console.error(`[Monid Call ${callId}] Failed after ${attempt + 1} attempt(s): ${errorMsg}`);
      
      return {
        success: false,
        provider,
        endpoint,
        error: errorMsg,
        errorType: is429 ? 'RATE_LIMITED' : is5xx ? 'SERVER_ERROR' : isTimeout ? 'TIMEOUT' : 'UNKNOWN',
        callMetadata: {
          callId,
          provider,
          endpoint: `${provider}${endpoint}`,
          startTime: new Date().toISOString(),
          latencyMs: 0,
          costUSD: 0,
          attempt: attempt + 1,
          totalAttempts: attempt + 1,
          httpStatus: is429 ? '429 Rate Limited' : is5xx ? '5xx Server Error' : isTimeout ? 'Timeout' : 'Error',
          error: errorMsg,
          context
        },
        warnings: [`Failed after ${attempt + 1} attempt(s): ${errorMsg}`]
      };
    }

    attempt++;
  }

  // Should not reach here, but safety fallback
  return {
    success: false,
    provider,
    endpoint,
    error: lastError?.message || 'Unknown error after retries',
    callMetadata: { callId, provider, endpoint: `${provider}${endpoint}`, costUSD: 0, httpStatus: 'Error' },
    warnings: ['Retry loop exhausted']
  };
}

function cleanupFiles(...files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) { /* ignore cleanup errors */ }
  }
}

/**
 * Search Amazon for products by keyword via Monid.
 * Returns an array of candidate products with ASINs.
 */
export async function searchAmazonProducts(keyword, maxPages = 1, apiKey) {
  const result = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/axesso_data/amazon-search-scraper',
    input: {
      input: [
        {
          keyword: keyword,
          domainCode: 'com',
          sortBy: 'relevance',
          maxPages: maxPages,
          category: 'aps'
        }
      ]
    },
    timeoutSec: 60,
    maxRetries: 1,
    context: `Search: "${keyword}"`,
    apiKey
  });

  if (!result.success) {
    // Propagate the failure classification so callers can distinguish an
    // upstream gateway outage (degradable) from a genuinely empty search.
    return {
      success: false,
      candidates: [],
      error: result.error,
      errorType: result.errorType || 'UPSTREAM_UNAVAILABLE',
      callMetadata: result.callMetadata
    };
  }

  // Parse search results into candidate list
  let candidates = [];
  const rawOutput = result.output;

  if (Array.isArray(rawOutput)) {
    // Axesso search scraper returns array of result objects
    for (const item of rawOutput) {
      // Each item may contain search result fields
      if (item.asin) {
        candidates.push({
          asin: item.asin,
          title: item.productDescription || item.title || item.name || 'Unknown',
          price: item.price || item.currentPrice || null,
          rating: item.stars || item.rating || null,
          reviewCount: item.countReview || item.reviewCount || item.reviews || 0,
          isPrime: item.isPrime || false,
          position: item.position || candidates.length + 1,
          sponsored: item.isSponsored || item.sponsored || false,
          imageUrl: item.imageUrl || item.image || null
        });
      }
      // Some formats nest results in a `searchResults` or `organicResults` array
      if (item.searchResults && Array.isArray(item.searchResults)) {
        for (const sr of item.searchResults) {
          if (sr.asin) {
            candidates.push({
              asin: sr.asin,
              title: sr.productDescription || sr.title || sr.name || 'Unknown',
              price: sr.price || sr.currentPrice || null,
              rating: sr.stars || sr.rating || null,
              reviewCount: sr.countReview || sr.reviewCount || sr.reviews || 0,
              isPrime: sr.isPrime || false,
              position: sr.position || candidates.length + 1,
              sponsored: sr.isSponsored || sr.sponsored || false,
              imageUrl: sr.imageUrl || sr.image || null
            });
          }
        }
      }
      // Handle organicResults format
      if (item.organicResults && Array.isArray(item.organicResults)) {
        for (const sr of item.organicResults) {
          if (sr.asin) {
            candidates.push({
              asin: sr.asin,
              title: sr.productDescription || sr.title || sr.name || 'Unknown',
              price: sr.price || sr.currentPrice || null,
              rating: sr.stars || sr.rating || null,
              reviewCount: sr.countReview || sr.reviewCount || sr.reviews || 0,
              isPrime: sr.isPrime || false,
              position: sr.position || candidates.length + 1,
              sponsored: sr.isSponsored || sr.sponsored || false,
              imageUrl: sr.imageUrl || sr.image || null
            });
          }
        }
      }
    }
  }

  // Deduplicate by ASIN
  const seen = new Set();
  candidates = candidates.filter(c => {
    if (seen.has(c.asin)) return false;
    seen.add(c.asin);
    return true;
  });

  return {
    success: true,
    candidates,
    totalFound: candidates.length,
    callMetadata: result.callMetadata
  };
}

/**
 * Select the 5 best competing products from a candidate list.
 * Selection criteria (transparent, documented):
 * 1. Exclude sponsored results (prefer organic)
 * 2. Prefer products with higher review counts (established presence)
 * 3. Prefer products with ratings (has customer feedback)
 * 4. Prefer products with prices (available for purchase)
 * 5. Take top 5 by composite score
 */
export function selectTopCompetitors(candidates, count = 5) {
  if (candidates.length === 0) return { selected: [], criteria: 'No candidates available' };

  // Score each candidate
  const scored = candidates.map(c => {
    let score = 0;
    
    // Review volume (most important: established competitive presence)
    const reviews = parseInt(c.reviewCount) || 0;
    if (reviews >= 1000) score += 40;
    else if (reviews >= 500) score += 35;
    else if (reviews >= 100) score += 25;
    else if (reviews >= 10) score += 15;
    else score += 5;
    
    // Has rating (customer feedback available)
    if (c.rating && parseFloat(c.rating) > 0) score += 15;
    
    // Has price (currently available)
    if (c.price && c.price !== 'N/A') score += 10;
    
    // Not sponsored (organic result = more meaningful competitor)
    if (!c.sponsored) score += 10;
    
    // Search position relevance (higher = more relevant)
    const pos = c.position || 50;
    score += Math.max(0, 20 - pos);
    
    return { ...c, competitorScore: score, reviewCountNum: reviews };
  });

  // Sort by score descending, then by review count for tiebreaking
  scored.sort((a, b) => {
    if (b.competitorScore !== a.competitorScore) return b.competitorScore - a.competitorScore;
    return b.reviewCountNum - a.reviewCountNum;
  });

  const selected = scored.slice(0, count);
  
  const selectionCriteria = [
    'Ranked by composite score combining: review volume (40pts max), rating availability (15pts), price availability (10pts), organic vs sponsored (10pts), search position relevance (20pts max)',
    `${candidates.length} total candidates evaluated`,
    `Top ${selected.length} selected`
  ];

  const selectionReasons = selected.map((s, i) => ({
    rank: i + 1,
    asin: s.asin,
    title: s.title,
    score: s.competitorScore,
    reason: `Score: ${s.competitorScore} | Reviews: ${s.reviewCountNum} | Rating: ${s.rating || 'N/A'} | Price: ${s.price || 'N/A'} | Organic: ${!s.sponsored} | Position: ${s.position}`
  }));

  return { selected, selectionCriteria, selectionReasons };
}

/**
 * Fetches real Amazon Product & Customer Review Data via Monid integration.
 * Returns structured data with per-call metadata for receipt tracking.
 */
export async function fetchAmazonDataWithMonid(asin, context = '', apiKey) {
  const cleanedAsin = asin.trim().toUpperCase();
  const callRecords = [];
  let warnings = [];

  // Step 1: Run Apify Axesso Amazon Reviews Scraper
  const reviewsResult = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/axesso_data/amazon-reviews-scraper',
    input: {
      input: [
        {
          asin: cleanedAsin,
          domainCode: 'com',
          sortBy: 'recent',
          maxPages: 5
        }
      ]
    },
    maxRetries: 1,
    context: `Reviews for ${cleanedAsin} ${context}`.trim(),
    apiKey
  });

  let rawReviews = [];
  if (reviewsResult.success) {
    callRecords.push(reviewsResult.callMetadata);
    
    if (Array.isArray(reviewsResult.output)) {
      rawReviews = reviewsResult.output;
    } else if (reviewsResult.output && Array.isArray(reviewsResult.output.data)) {
      rawReviews = reviewsResult.output.data;
    }
    
    if (reviewsResult.warnings?.length) warnings.push(...reviewsResult.warnings);
  } else {
    callRecords.push(reviewsResult.callMetadata);
    warnings.push(`Review retrieval failed for ${cleanedAsin}: ${reviewsResult.error}`);
  }

  // Step 2: Run Apify Amazon Product Details Scraper
  const apifyResult = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/delicious_zebu/amazon-product-details-scraper',
    input: { Params: [cleanedAsin] },
    maxRetries: 1,
    context: `Product details for ${cleanedAsin} ${context}`.trim(),
    apiKey
  });

  let apifyData = {};
  if (apifyResult.success) {
    callRecords.push(apifyResult.callMetadata);
    const arr = Array.isArray(apifyResult.output) ? apifyResult.output : [];
    if (arr.length > 0) {
      apifyData = arr[0];
    }
    if (apifyResult.warnings?.length) warnings.push(...apifyResult.warnings);
  } else {
    callRecords.push(apifyResult.callMetadata);
    warnings.push(`Product details retrieval failed for ${cleanedAsin}: ${apifyResult.error}`);
  }

  // Calculate actual cost from successful calls
  const totalCost = callRecords.reduce((sum, c) => sum + (c.costUSD || 0), 0);
  const successfulCalls = callRecords.filter(c => !c.error).length;

  return {
    asin: cleanedAsin,
    rawReviews,
    apifyData,
    retrievalSuccess: {
      reviews: reviewsResult.success,
      productDetails: apifyResult.success,
      partialFailure: reviewsResult.success !== apifyResult.success
    },
    warnings,
    monidReceipt: {
      totalCostUSD: `$${totalCost.toFixed(5)}`,
      totalCostNumber: totalCost,
      monidCalls: callRecords.length,
      successfulCalls,
      failedCalls: callRecords.length - successfulCalls,
      totalLatencyMs: callRecords.reduce((sum, c) => sum + (c.latencyMs || 0), 0),
      gatewaysUsed: ['apify/axesso_data/amazon-reviews-scraper', 'apify/delicious_zebu/amazon-product-details-scraper'],
      callRecords
    }
  };
}
