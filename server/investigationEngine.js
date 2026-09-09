/**
 * Ratina.ai General-Purpose Investigation Engine
 * 
 * Accepts any category + ASINs, runs live Monid calls for each,
 * constructs failure matrix, scores opportunities, and generates decisions.
 * 
 * NOT hardcoded to any specific product category.
 */

import fs from 'fs';
import path from 'path';
import { searchAmazonProducts, selectTopCompetitors, fetchAmazonDataWithMonid } from './monidService.js';

// ─── CATEGORY-AWARE FAILURE DICTIONARIES ──────────────────────────────────────

const FAILURE_DICTIONARIES = {
  // French Press specific
  'french press': [
    { id: 'glass-shatter', name: 'Thermal Shock / Glass Shattering', keywords: ['crack', 'cracked', 'shatter', 'shattered', 'broke', 'broken', 'glass broke', 'glass shattered', 'exploded', 'thermal shock'], isSafetyHazard: true },
    { id: 'filter-bypass', name: 'Mesh Filter Bypass / Coffee Grounds Sludge', keywords: ['grounds', 'grit', 'sediment', 'filter', 'mesh', 'sludge', 'gritty', 'muddy', 'cloudy'], isSafetyHazard: false },
    { id: 'plunger-bend', name: 'Plunger Shaft Bending / Threading Strip', keywords: ['plunger', 'bent', 'bending', 'stripped', 'thread', 'threading', 'rod', 'shaft', 'cross-threaded', 'wobbly plunger'], isSafetyHazard: false },
    { id: 'handle-frame', name: 'Handle / Frame Instability & Detachment', keywords: ['handle', 'wobble', 'wobbles', 'wobbly', 'loose', 'detach', 'frame', 'cheap', 'flimsy', 'plastic', 'snap', 'snapped'], isSafetyHazard: true },
    { id: 'heat-loss', name: 'Rapid Heat Loss / Thermal Retention Deficit', keywords: ['heat', 'cold', 'cool', 'temperature', 'thermal', 'insulation', 'retain', 'warm', 'lukewarm'], isSafetyHazard: false },
    { id: 'corrosion', name: 'Stainless Steel Corrosion / Metallic Degradation', keywords: ['rust', 'corrosion', 'corrode', 'metallic', 'discolor', 'stain', 'tarnish', 'oxidize'], isSafetyHazard: false }
  ],

  // Portable Blender specific
  'portable blender': [
    { id: 'blade-dull', name: 'Blade Dulling / Cutting Failure', keywords: ['blade', 'blades', 'dull', 'sharp', 'not cutting', 'not blending', 'chunks', 'chunky', 'won\'t blend', 'doesn\'t blend', 'not sharp'], isSafetyHazard: false },
    { id: 'motor-burnout', name: 'Motor Burn-Out / Overheating', keywords: ['motor', 'burn', 'burned', 'burnt', 'overheat', 'overheating', 'hot', 'smell', 'smoke', 'smoking', 'stopped working', 'died', 'dead'], isSafetyHazard: true },
    { id: 'battery-charge', name: 'Battery / Charging Failure', keywords: ['battery', 'charge', 'charging', 'won\'t charge', 'not charging', 'usb', 'usb-c', 'cable', 'power', 'dead battery', 'drain', 'drains', 'dies quickly'], isSafetyHazard: false },
    { id: 'leak-seal', name: 'Lid Seal Leaking / Spill Vulnerability', keywords: ['leak', 'leaks', 'leaking', 'spill', 'spills', 'seal', 'lid', 'drip', 'dripping', 'mess', 'messy', 'splash'], isSafetyHazard: false },
    { id: 'noise-vibration', name: 'Excessive Noise / Vibration', keywords: ['loud', 'noise', 'noisy', 'vibrat', 'shaking', 'rattling', 'rattle', 'sound'], isSafetyHazard: false },
    { id: 'capacity-size', name: 'Insufficient Capacity / Misleading Size', keywords: ['small', 'tiny', 'capacity', 'size', 'volume', 'ounce', 'oz', 'not enough', 'barely fits', 'smaller than', 'misleading'], isSafetyHazard: false }
  ],

  // Generic fallback for unknown categories
  '_generic': [
    { id: 'build-quality', name: 'Build Quality / Material Deficiency', keywords: ['cheap', 'flimsy', 'broke', 'broken', 'crack', 'cracked', 'snap', 'snapped', 'fragile', 'poor quality', 'fell apart'], isSafetyHazard: false },
    { id: 'durability', name: 'Premature Wear / Durability Failure', keywords: ['stopped working', 'died', 'months', 'weeks', 'lasted', 'durability', 'worn', 'wear', 'degraded', 'replacement'], isSafetyHazard: false },
    { id: 'safety', name: 'Safety Concern / Hazard', keywords: ['dangerous', 'hazard', 'unsafe', 'burn', 'burned', 'shock', 'electric', 'fire', 'recall', 'injury', 'hurt'], isSafetyHazard: true },
    { id: 'function', name: 'Core Function Failure', keywords: ['doesn\'t work', 'not working', 'malfunction', 'defective', 'useless', 'fail', 'failed', 'broken'], isSafetyHazard: false },
    { id: 'leak-seal', name: 'Leak / Seal / Containment Failure', keywords: ['leak', 'leaks', 'leaking', 'spill', 'seal', 'drip', 'water', 'wet'], isSafetyHazard: false },
    { id: 'fit-finish', name: 'Fit & Finish / Cosmetic Defect', keywords: ['scratch', 'dent', 'paint', 'peel', 'peeling', 'chip', 'chipped', 'discolor', 'ugly', 'cosmetic'], isSafetyHazard: false }
  ]
};

/**
 * Get the failure dictionary for a given category.
 * Matches category name (case-insensitive, partial match).
 */
function getFailureDictionary(category) {
  const normalized = (category || '').toLowerCase();
  for (const [key, dict] of Object.entries(FAILURE_DICTIONARIES)) {
    if (key === '_generic') continue;
    if (normalized.includes(key)) return dict;
  }
  return FAILURE_DICTIONARIES['_generic'];
}

function parseReviewRating(rev) {
  if (typeof rev.rating === 'string') {
    const m = rev.rating.match(/([\d.]+)/);
    if (m) return parseFloat(m[1]);
  }
  if (typeof rev.rating === 'number') return rev.rating;
  if (rev.reviewRating) return parseFloat(rev.reviewRating);
  if (rev.stars) return parseFloat(rev.stars);
  return 5;
}

// ─── CONTEXT-AWARE FAILURE EXTRACTION LINGUISTIC RULES ────────────────────────

const NEGATION_PATTERN = /\b(never|doesn't|does not|didn't|did not|won't|will not|haven't|hasn't|has not|not|no|without|zero|neither)\b/i;
const POSITIVE_PATTERN = /\b(love|loved|loves|great|excellent|perfect|perfectly|fantastic|superb|amazing|best|durable|sturdy|well made|high quality|very good|smooth|effortless|powerful|strong|exceeded|happy|satisfied|pleased)\b/i;
const ATTRIBUTE_SPEC_PATTERN = /\b(\d+\s*(mah|oz|ounce|watt|w|v|volt|ml|rpm|cups?))\b/i;
const EXPLICIT_DEFECT_PATTERN = /\b(stopped working|stopped|won't work|doesn't work|not working|broke|broken|break|breaks|cracked|crack|cracks|cracking|shattered|shatter|shattering|exploded|died|dies|dead|failed|fails|failure|malfunction|malfunctioning|defect|defective|leaks|leaked|leaking|leakage|spill|spills|spilling|drips|dripping|overheat|overheating|overheated|burn|burned|burnt|burning|smoke|smoking|smell|smelling|melt|melted|melting|dull|not sharp|not cutting|chunks|chunky|won't blend|doesn't blend|won't charge|not charging|drains fast|dies quickly|uncomfortable|pain|hurt|hurts|sharp edges|flaking|peeling|chipping|rust|rusting|rusted|corrosion|stripped|bent|wobbly|loose|detached|noisy|rattling|terrible|awful|garbage|useless|waste|disappointed|frustrated|returned|returning|refund|replacement|poor quality)\b/i;

export function splitIntoClauses(text) {
  if (!text) return [];
  const rawSentences = text.split(/[.!?\n\r]+/);
  const clauses = [];

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    // Split compound sentences at contrasting conjunctions: but, however, although, yet
    const subParts = trimmed.split(/\s+(?:but|however|although|yet)\s+/i);
    for (const p of subParts) {
      const clean = p.trim();
      if (clean) clauses.push(clean);
    }
  }
  return clauses;
}

export function classifyContext(clause, keyword, starRating = 3) {
  const lowerClause = clause.toLowerCase();
  const kwLower = keyword.toLowerCase();

  if (!lowerClause.includes(kwLower)) {
    return {
      isFailure: false,
      contextType: 'not_found',
      evidenceWeight: 0,
      classificationReason: 'Keyword not present in clause'
    };
  }

  const kwIndex = lowerClause.indexOf(kwLower);
  const beforeText = lowerClause.substring(Math.max(0, kwIndex - 40), kwIndex);
  const afterText = lowerClause.substring(kwIndex + kwLower.length, Math.min(lowerClause.length, kwIndex + kwLower.length + 40));

  // 1. Check for negation in local window (e.g., "never leaks", "doesn't leak", "no cracking")
  const hasNegationBefore = NEGATION_PATTERN.test(beforeText);
  if (hasNegationBefore || (lowerClause.includes('no ') && lowerClause.includes(kwLower))) {
    return {
      isFailure: false,
      contextType: 'negated_failure',
      evidenceWeight: 0,
      classificationReason: `Negation detected preceding '${keyword}' in clause: "${clause}"`
    };
  }

  // 2. Check for explicit defect indicator
  const defectMatch = lowerClause.match(EXPLICIT_DEFECT_PATTERN);
  const hasExplicitDefect = Boolean(defectMatch);

  // 3. Check for positive sentiment indicator
  const positiveMatch = lowerClause.match(POSITIVE_PATTERN);
  const hasPositive = Boolean(positiveMatch);

  // 4. Positive filter: positive praise without an explicit defect statement
  if (hasPositive && !hasExplicitDefect) {
    return {
      isFailure: false,
      contextType: 'positive_experience',
      evidenceWeight: 0,
      classificationReason: `Positive sentiment ('${positiveMatch[0]}') qualifies '${keyword}' without defect statement: "${clause}"`
    };
  }

  // 5. Neutral attribute / specification check (spec numbers or pure feature description without problem)
  const hasSpecUnit = ATTRIBUTE_SPEC_PATTERN.test(lowerClause);
  const isPureAttribute = (kwLower === 'battery' || kwLower === 'motor' || kwLower === 'cable' || kwLower === 'usb' || kwLower === 'oz' || kwLower === 'size' || kwLower === 'capacity') && !hasExplicitDefect;
  
  if ((hasSpecUnit || isPureAttribute) && !hasExplicitDefect) {
    return {
      isFailure: false,
      contextType: 'neutral_attribute',
      evidenceWeight: 0,
      classificationReason: `Neutral specification or product attribute description: "${clause}"`
    };
  }

  // 6. Explicit failure: has explicit problem verb or defect indicator
  if (hasExplicitDefect) {
    let weight = 1.0;
    if (starRating === 1) weight = 1.00;
    else if (starRating === 2) weight = 0.85;
    else if (starRating === 3) weight = 0.60;
    else if (starRating === 4) weight = 0.40; // Explicit failure described in 4-star review
    else if (starRating === 5) weight = 0.25; // Explicit failure described in 5-star review

    return {
      isFailure: true,
      contextType: 'explicit_failure',
      evidenceWeight: weight,
      matchedDefect: defectMatch[0],
      classificationReason: `Explicit defect indicator ('${defectMatch[0]}') associated with '${keyword}' (rating: ${starRating}★, weight: ${weight}): "${clause}"`
    };
  }

  // 7. Ambiguous context: mentions keyword but lacks definitive defect or satisfaction indicator
  return {
    isFailure: false,
    contextType: 'ambiguous',
    evidenceWeight: 0,
    classificationReason: `Ambiguous context for '${keyword}': lacks definitive defect or satisfaction indicator: "${clause}"`
  };
}

/**
 * Analyze reviews against failure dictionaries with context-aware evidence weighting.
 */
export function analyzeReviewsForFailures(reviews, failureDictionary) {
  const results = {};

  for (const dict of failureDictionary) {
    let matchCount = 0;
    let weightedCount = 0;
    const failureEvidenceList = [];
    const ambiguousEvidenceList = [];

    for (let i = 0; i < reviews.length; i++) {
      const rev = reviews[i];
      const title = rev.title || rev.reviewTitle || '';
      const body = rev.text || rev.reviewText || '';
      const fullText = `${title} ${body}`.trim();
      if (!fullText) continue;

      const starRating = parseReviewRating(rev);
      const clauses = splitIntoClauses(fullText);
      const revId = rev.reviewId || `rev_${i}`;
      const revDate = rev.date ? String(rev.date).replace(/^Reviewed in the United States on /, '') : (rev.reviewDate ? String(rev.reviewDate).replace(/^Reviewed in the United States on /, '') : 'N/A');

      let foundForMode = false;
      let highestWeightForMode = 0;
      let bestEvidenceForMode = null;

      for (const kw of dict.keywords) {
        for (const clause of clauses) {
          if (clause.toLowerCase().includes(kw.toLowerCase())) {
            const classification = classifyContext(clause, kw, starRating);
            
            if (classification.isFailure) {
              foundForMode = true;
              if (classification.evidenceWeight > highestWeightForMode) {
                highestWeightForMode = classification.evidenceWeight;
                bestEvidenceForMode = {
                  failureMode: dict.name,
                  failureModeId: dict.id,
                  reviewId: revId,
                  asin: rev.asin || 'unknown',
                  rating: starRating,
                  date: revDate,
                  matchedTerm: kw,
                  supportingText: clause,
                  contextType: classification.contextType,
                  evidenceWeight: classification.evidenceWeight,
                  classificationReason: classification.classificationReason,
                  quote: `"${clause.length > 200 ? clause.substring(0, 197) + '...' : clause}"`,
                  verified: rev.verified !== false && rev.verifiedPurchase !== false
                };
              }
            } else if (classification.contextType === 'ambiguous') {
              if (ambiguousEvidenceList.length < 5) {
                ambiguousEvidenceList.push({
                  failureMode: dict.name,
                  failureModeId: dict.id,
                  reviewId: revId,
                  rating: starRating,
                  matchedTerm: kw,
                  supportingText: clause,
                  contextType: 'ambiguous',
                  classificationReason: classification.classificationReason
                });
              }
            }
          }
        }
      }

      if (foundForMode && bestEvidenceForMode) {
        matchCount++;
        weightedCount += highestWeightForMode;
        if (failureEvidenceList.length < 15) {
          failureEvidenceList.push(bestEvidenceForMode);
        }
      }
    }

    results[dict.id] = {
      failureMode: dict.name,
      count: matchCount,
      weightedCount: parseFloat(weightedCount.toFixed(2)),
      ambiguousCount: ambiguousEvidenceList.length,
      isSafetyHazard: dict.isSafetyHazard,
      evidence: failureEvidenceList,
      ambiguousEvidence: ambiguousEvidenceList
    };
  }

  return results;
}

/**
 * Run a complete multi-ASIN investigation with live Monid calls.
 * 
 * Workflow: Search → Select → Enrich → Analyze → Score → Decide
 * 
 * @param {Object} options
 * @param {string} options.category - Category name
 * @param {string[]} [options.asins] - Pre-selected ASINs (skip search if provided)
 * @param {string} [options.searchQuery] - Search query for discovery (if no ASINs provided)
 * @param {string} [options.apiKey] - Optional custom Monid API key
 * @returns {Object} Complete investigation result
 */
export async function runInvestigation({ category, asins, searchQuery, apiKey }) {
  const runId = `run_${Date.now()}`;
  const executedAt = new Date().toISOString();
  const allCallRecords = [];
  let totalActualCost = 0;

  console.log(`\n[Investigation ${runId}] Starting: "${category}"`);
  console.log(`[Investigation ${runId}] Mode: ${asins ? 'Pre-selected ASINs' : 'Dynamic Discovery'}`);
  console.log(`[Investigation ${runId}] Auth: ${apiKey ? 'Custom Monid Key Provided' : 'Default/Sponsored Key'}`);

  // ─── PHASE 1: DISCOVERY (if no ASINs provided) ──────────────────────────────

  let discoveryResult = null;
  let selectionResult = null;
  let targetAsins = asins || [];

  if (!asins || asins.length === 0) {
    const query = searchQuery || category;
    console.log(`[Investigation ${runId}] Phase 1: Searching Amazon for "${query}"...`);

    discoveryResult = await searchAmazonProducts(query, 1, apiKey);
    
    if (discoveryResult.callMetadata) {
      allCallRecords.push(discoveryResult.callMetadata);
      totalActualCost += discoveryResult.callMetadata.costUSD || 0;
    }

    if (!discoveryResult.success || discoveryResult.candidates.length === 0) {
      return {
        success: false,
        error: `Amazon search for "${query}" returned no results. ${discoveryResult.error || ''}`,
        executionMetadata: {
          runId,
          executedAt,
          isLiveExecution: true,
          totalActualCost,
          callRecords: allCallRecords,
          phase: 'DISCOVERY_FAILED'
        }
      };
    }

    console.log(`[Investigation ${runId}] Found ${discoveryResult.candidates.length} candidates`);

    // Select top 5 competitors
    selectionResult = selectTopCompetitors(discoveryResult.candidates, 5);
    targetAsins = selectionResult.selected.map(s => s.asin);
    
    console.log(`[Investigation ${runId}] Selected ${targetAsins.length} competitors: ${targetAsins.join(', ')}`);
  }

  if (targetAsins.length === 0) {
    return {
      success: false,
      error: 'No ASINs available for investigation',
      executionMetadata: { runId, executedAt, isLiveExecution: true, totalActualCost, callRecords: allCallRecords }
    };
  }

  // ─── PHASE 2: ENRICHMENT (product data + reviews for each ASIN) ─────────────

  console.log(`[Investigation ${runId}] Phase 2: Enriching ${targetAsins.length} ASINs...`);
  
  const competitorResults = [];
  const failedAsins = [];
  const failureDictionary = getFailureDictionary(category);

  for (const asin of targetAsins) {
    console.log(`[Investigation ${runId}]   Fetching data for ${asin}...`);
    
    const result = await fetchAmazonDataWithMonid(asin, `(${category})`, apiKey);
    
    // Track all call records
    if (result.monidReceipt?.callRecords) {
      allCallRecords.push(...result.monidReceipt.callRecords);
      totalActualCost += result.monidReceipt.totalCostNumber || 0;
    }

    // Check if this ASIN failed entirely
    const totallyFailed = !result.retrievalSuccess.reviews && !result.retrievalSuccess.productDetails;
    
    if (totallyFailed) {
      failedAsins.push({
        asin,
        error: result.warnings.join('; '),
        status: 'FAILED'
      });
      continue;
    }

    // Analyze reviews for failure patterns
    const failureAnalysis = analyzeReviewsForFailures(result.rawReviews, failureDictionary);
    
    // Build competitor summary
    const apify = result.apifyData || {};
    const reviewCount = result.rawReviews.length;
    
    // Determine data quality status
    let dataQualityStatus;
    if (reviewCount === 0) {
      dataQualityStatus = 'INSUFFICIENT REVIEW EVIDENCE (0 reviews retrieved)';
    } else if (reviewCount < 5) {
      dataQualityStatus = `SPARSE DATASET (${reviewCount} reviews retrieved, insufficient sample size for failure analysis)`;
    } else if (reviewCount >= 20) {
      dataQualityStatus = `HIGH CONFIDENCE (${reviewCount} reviews)`;
    } else {
      dataQualityStatus = `MODERATE CONFIDENCE (${reviewCount} reviews)`;
    }

    // Extract price safely — never invent a price
    let livePrice = null;
    if (apify.price && apify.price !== '' && apify.price !== 'N/A') {
      livePrice = typeof apify.price === 'number' ? `$${apify.price.toFixed(2)}` : String(apify.price);
    } else {
      livePrice = 'UNAVAILABLE';
    }

    const failureCounts = {};
    for (const [id, analysis] of Object.entries(failureAnalysis)) {
      failureCounts[analysis.failureMode] = analysis.count;
    }

    competitorResults.push({
      asin,
      name: apify.title || result.rawReviews[0]?.productTitle || `ASIN: ${asin}`,
      title: apify.title || result.rawReviews[0]?.productTitle || `ASIN: ${asin}`,
      livePrice,
      liveRating: apify.rating_stars || apify.rating || 'N/A',
      reviewsRetrieved: reviewCount,
      criticalReviewsAnalyzed: result.rawReviews.filter(r => parseReviewRating(r) <= 3).length,
      dataQualityStatus,
      failureCounts,
      failureAnalysis,
      rawReviewSample: result.rawReviews.slice(0, 3),
      warnings: result.warnings,
      retrievalSuccess: result.retrievalSuccess
    });
  }

  // ─── PHASE 3: CROSS-COMPETITOR FAILURE MATRIX ────────────────────────────────

  console.log(`[Investigation ${runId}] Phase 3: Building failure matrix...`);

  const strictMatrix = [];
  const allFailureModes = new Set();
  
  for (const comp of competitorResults) {
    for (const [id, analysis] of Object.entries(comp.failureAnalysis)) {
      allFailureModes.add(id);
    }
  }

  for (const modeId of allFailureModes) {
    const dictEntry = failureDictionary.find(d => d.id === modeId);
    if (!dictEntry) continue;

    const countsPerProduct = {};
    let totalMentions = 0;
    let totalWeightedMentions = 0;
    let totalAmbiguousMentions = 0;
    let productsWithData = 0;
    let productsWithFailure = 0;
    const allEvidence = [];

    for (const comp of competitorResults) {
      const analysis = comp.failureAnalysis[modeId];
      const count = analysis?.count || 0;
      const weightedCount = analysis?.weightedCount || 0;
      const ambiguousCount = analysis?.ambiguousCount || 0;
      const sampleSufficient = comp.reviewsRetrieved >= 5;

      countsPerProduct[comp.asin] = { 
        count, 
        weightedCount, 
        sampleSufficient 
      };
      totalMentions += count;
      totalWeightedMentions += weightedCount;
      totalAmbiguousMentions += ambiguousCount;

      if (sampleSufficient) productsWithData++;
      if (count > 0 && sampleSufficient) productsWithFailure++;
      if (analysis?.evidence) allEvidence.push(...analysis.evidence);
    }

    // For failed ASINs, mark as unavailable
    for (const failed of failedAsins) {
      countsPerProduct[failed.asin] = { count: 0, weightedCount: 0, sampleSufficient: false, failed: true };
    }

    const prevalence = productsWithData > 0 
      ? `${productsWithFailure}/${productsWithData} competitors with sufficient data (${Math.round(productsWithFailure / productsWithData * 100)}%)`
      : 'Insufficient data across all competitors';

    strictMatrix.push({
      failureMode: dictEntry.name,
      failureModeId: modeId,
      countsPerProduct,
      totalObservedMentions: totalMentions,
      weightedMentions: parseFloat(totalWeightedMentions.toFixed(2)),
      ambiguousMentions: totalAmbiguousMentions,
      prevalenceInPrimaryDataset: prevalence,
      evidence: allEvidence.slice(0, 10),
      isSafetyHazard: dictEntry.isSafetyHazard
    });
  }

  // Sort by weighted mentions descending (or total mentions if tied)
  strictMatrix.sort((a, b) => (b.weightedMentions - a.weightedMentions) || (b.totalObservedMentions - a.totalObservedMentions));

  // ─── PHASE 4: SEVERITY SCORING (Evidence-Weighted) ──────────────────────────

  console.log(`[Investigation ${runId}] Phase 4: Scoring severity (evidence-weighted)...`);

  const strictSeverityScores = strictMatrix.map((row, idx) => {
    const dictEntry = failureDictionary.find(d => d.name === row.failureMode);
    const isSafety = dictEntry?.isSafetyHazard || false;
    
    // Severity relies on evidence-weighted failure counts (mentionScore up to 50)
    const effectiveMentions = row.weightedMentions > 0 ? row.weightedMentions : row.totalObservedMentions;
    const mentionScore = Math.min(Math.round(effectiveMentions * 5), 50);
    
    // Extract prevalence percentage
    const prevMatch = row.prevalenceInPrimaryDataset.match(/(\d+)%/);
    const prevPct = prevMatch ? parseInt(prevMatch[1]) : 0;
    const prevalenceScore = prevPct * 0.3;
    
    const safetyBonus = isSafety ? 20 : 0;
    const severityScore = Math.min(100, Math.round(mentionScore + prevalenceScore + safetyBonus));

    let severityTier;
    if (severityScore >= 70) severityTier = 'CRITICAL (P0)';
    else if (severityScore >= 40) severityTier = 'HIGH (P1)';
    else if (severityScore >= 15) severityTier = 'MEDIUM (P2)';
    else severityTier = 'LOW';

    // Collect structured evidence trace from competitors
    const evidenceAsins = [];
    for (const [asin, data] of Object.entries(row.countsPerProduct)) {
      if (data.count > 0) {
        const comp = competitorResults.find(c => c.asin === asin);
        evidenceAsins.push(`${comp?.name || asin} (${asin}): ${data.count} [wt: ${data.weightedCount}]`);
      }
    }

    return {
      failureMode: row.failureMode,
      totalObservedMentions: row.totalObservedMentions,
      weightedMentions: row.weightedMentions,
      ambiguousMentions: row.ambiguousMentions,
      isSafetyHazard: isSafety,
      severityScore,
      severityTier,
      evidenceBasis: evidenceAsins.length > 0 
        ? `Supported by ${row.totalObservedMentions} verified failure citations (${row.weightedMentions} weighted) across ${evidenceAsins.join(', ')}`
        : `0 failure citations observed in ${competitorResults.length} competitors`
    };
  });

  // ─── PHASE 5: OPPORTUNITY SCORE ─────────────────────────────────────────────

  console.log(`[Investigation ${runId}] Phase 5: Calculating opportunity score...`);

  const totalSeveritySum = strictSeverityScores.reduce((sum, s) => sum + s.severityScore, 0);
  const failurePenalty = Math.round(totalSeveritySum * 0.12);
  
  // Solvability bonus: how many of the top failures are addressable?
  const topFailures = strictSeverityScores.filter(s => s.severityTier.includes('P0') || s.severityTier.includes('P1'));
  const solvabilityBonus = Math.min(30, topFailures.length * 10);
  
  const opportunityScore = Math.max(10, Math.min(100, 100 - failurePenalty + solvabilityBonus));

  // Confidence
  const highConfidenceCount = competitorResults.filter(c => c.reviewsRetrieved >= 10).length;
  const sparseCount = competitorResults.filter(c => c.reviewsRetrieved > 0 && c.reviewsRetrieved < 5).length;
  const zeroReviewCount = competitorResults.filter(c => c.reviewsRetrieved === 0).length;
  
  let evidenceConfidence;
  if (highConfidenceCount >= 3 && failedAsins.length === 0) evidenceConfidence = 'HIGH';
  else if (highConfidenceCount >= 2) evidenceConfidence = 'MODERATE';
  else evidenceConfidence = 'LOW';

  // ─── PHASE 6: SOURCING SPECIFICATIONS ───────────────────────────────────────

  const strictSourcingSpecs = strictSeverityScores
    .filter(s => s.totalObservedMentions > 0)
    .map((s, idx) => {
      let priority;
      if (s.severityTier.includes('P0')) priority = 'P0 (CRITICAL)';
      else if (s.severityTier.includes('P1')) priority = 'P1 (HIGH)';
      else priority = 'P2 (MEDIUM)';

      return {
        priority,
        failureMode: s.failureMode,
        evidenceObserved: `${s.totalObservedMentions} verified mentions (${s.weightedMentions} weighted) across ${Object.entries(strictMatrix.find(m => m.failureMode === s.failureMode)?.countsPerProduct || {}).filter(([, v]) => v.count > 0).length} competitors`,
        engineeringRequirement: `Address "${s.failureMode}" through design or material improvement. Severity: ${s.severityScore}/100.`,
        qaRequirement: `Pre-shipment testing validation for ${s.failureMode.toLowerCase()} resistance.`,
        listingImplication: `Competitive differentiation opportunity: address the ${s.failureMode.toLowerCase()} that affects ${s.evidenceBasis.includes('across') ? s.evidenceBasis.split('across')[1].trim() : 'competitors'}.`
      };
    });

  // ─── PHASE 7: DECISION ──────────────────────────────────────────────────────

  let decision, confidenceExplanation, nextStepAction;

  if (failedAsins.length >= Math.ceil(targetAsins.length / 2)) {
    decision = '🔴 DO NOT SOURCE (Insufficient Evidence)';
    confidenceExplanation = `${failedAsins.length}/${targetAsins.length} competitor data retrievals failed. Insufficient evidence for a sourcing decision.`;
    nextStepAction = 'Retry data retrieval for failed ASINs before making a sourcing decision.';
  } else if (evidenceConfidence === 'LOW') {
    decision = '🟡 INVESTIGATE / CONDITIONAL GO';
    confidenceExplanation = `Evidence confidence is LOW. Only ${highConfidenceCount}/${competitorResults.length} competitors have sufficient review depth. ${sparseCount} have sparse data, ${zeroReviewCount} have zero reviews.`;
    nextStepAction = 'Execute deeper review scraping for undersampled competitors before committing capital.';
  } else if (opportunityScore >= 70 && evidenceConfidence !== 'LOW') {
    decision = '🟡 INVESTIGATE / CONDITIONAL GO';
    confidenceExplanation = `Opportunity score ${opportunityScore}/100 indicates strong product opportunity. Evidence confidence: ${evidenceConfidence}.`;
    nextStepAction = 'Proceed with supplier sample procurement while addressing identified failure modes.';
  } else {
    decision = '🟢 SOURCE (Evidence Supports Entry)';
    confidenceExplanation = `Opportunity score ${opportunityScore}/100 with ${evidenceConfidence} confidence.`;
    nextStepAction = 'Proceed with initial supplier engagement and sample procurement.';
  }

  // ─── DATA LIMITATIONS ───────────────────────────────────────────────────────

  const highConfidenceDataset = competitorResults
    .filter(c => c.reviewsRetrieved >= 10)
    .map(c => `${c.asin} (${c.reviewsRetrieved} reviews)`);

  const sparseCompetitors = competitorResults
    .filter(c => c.reviewsRetrieved > 0 && c.reviewsRetrieved < 5);

  const zeroReviewCompetitors = competitorResults
    .filter(c => c.reviewsRetrieved === 0);

  let sparseDatasetNotice = null;
  if (sparseCompetitors.length > 0) {
    sparseDatasetNotice = `ASINs ${sparseCompetitors.map(c => `${c.asin} (${c.name})`).join(', ')} returned only ${sparseCompetitors.map(c => c.reviewsRetrieved).join('/')} reviews. Their failure counts must NOT be interpreted as perfect product quality, but rather as INSUFFICIENT SAMPLE DEPTH.`;
  }

  let zeroReviewNotice = null;
  if (zeroReviewCompetitors.length > 0) {
    zeroReviewNotice = `ASINs ${zeroReviewCompetitors.map(c => c.asin).join(', ')} returned 0 usable reviews. These products are marked as "Insufficient review evidence" — not as zero-failure products.`;
  }

  let failureNotice = null;
  if (failedAsins.length > 0) {
    failureNotice = `${failedAsins.length}/${targetAsins.length} competitor(s) failed data retrieval: ${failedAsins.map(f => `${f.asin} (${f.error})`).join('; ')}. Evidence confidence reduced.`;
  }

  const anomalies = competitorResults
    .filter(c => c.warnings?.length > 0)
    .map(c => `${c.asin}: ${c.warnings.join('; ')}`);

  // ─── BUILD FINAL PAYLOAD ────────────────────────────────────────────────────

  const totalReviewsRetrieved = competitorResults.reduce((sum, c) => sum + c.reviewsRetrieved, 0);

  const callBreakdown = allCallRecords.map((call, idx) => ({
    callIndex: idx + 1,
    endpoint: call.endpoint,
    asin: call.context?.match(/([A-Z0-9]{10})/)?.[1] || 'N/A',
    status: call.httpStatus || 'Unknown',
    latencyMs: call.latencyMs || 0,
    costUSD: call.costUSD || 0,
    callId: call.callId,
    startTime: call.startTime,
    attempt: call.attempt,
    error: call.error || null
  }));

  const payload = {
    timestamp: executedAt,
    mode: asins ? 'PRESET_ASIN_ANALYSIS' : 'DYNAMIC_DISCOVERY_ANALYSIS',
    category,
    
    // Discovery evidence (only if search was performed)
    ...(discoveryResult ? {
      discovery: {
        searchQuery: searchQuery || category,
        totalCandidatesFound: discoveryResult.totalFound,
        candidates: discoveryResult.candidates,
        selectionCriteria: selectionResult?.selectionCriteria || [],
        selectionReasons: selectionResult?.selectionReasons || [],
        discoveryCallMetadata: discoveryResult.callMetadata
      }
    } : {}),

    dataLimitations: {
      highConfidenceDataset,
      ...(sparseDatasetNotice ? { sparseDatasetNotice } : {}),
      ...(zeroReviewNotice ? { zeroReviewNotice } : {}),
      ...(failureNotice ? { failureNotice } : {}),
      ...(anomalies.length > 0 ? { anomalyNotice: anomalies.join(' | ') } : {})
    },

    strictCompetitorSummary: competitorResults.map(c => ({
      asin: c.asin,
      name: c.name,
      title: c.title,
      livePrice: c.livePrice,
      liveRating: c.liveRating,
      reviewsRetrieved: c.reviewsRetrieved,
      criticalReviewsAnalyzed: c.criticalReviewsAnalyzed,
      dataQualityStatus: c.dataQualityStatus,
      failureCounts: c.failureCounts,
      warnings: c.warnings
    })),

    ...(failedAsins.length > 0 ? {
      failedCompetitors: failedAsins
    } : {}),

    strictMatrix,
    strictSeverityScores,

    productOpportunityScore: {
      score: opportunityScore,
      maxScore: 100,
      formula: `Baseline (100) - Failure Penalty (${failurePenalty}) + Solvability Bonus (${solvabilityBonus}) = ${opportunityScore}`,
      interpretation: opportunityScore >= 80 
        ? 'Strong product opportunity — addressable failure modes create differentiation potential.'
        : opportunityScore >= 50
        ? 'Moderate opportunity — some failure modes are addressable but market risks exist.'
        : 'Challenging opportunity — significant failure modes with limited solvability.'
    },

    strictSourcingSpecs,

    finalDecision: {
      decision,
      evidenceConfidence,
      confidenceRating: `${evidenceConfidence} (${highConfidenceCount}/${competitorResults.length} with sufficient review depth)`,
      confidenceExplanation,
      evidenceRationale: `Analysis of ${totalReviewsRetrieved} reviews across ${competitorResults.length} competitors in the "${category}" category. ${topFailures.length} critical/high failure modes identified.`,
      nextStepAction
    },

    monidReceipt: {
      totalMonidCostUSD: `$${totalActualCost.toFixed(5)}`,
      totalMonidCostNumber: totalActualCost,
      successfulCalls: allCallRecords.filter(c => !c.error).length,
      failedCalls: allCallRecords.filter(c => c.error).length,
      totalCallsExecuted: allCallRecords.length,
      callBreakdown
    },

    executionMetadata: {
      runId,
      executedAt,
      completedAt: new Date().toISOString(),
      isLiveExecution: true,
      source: 'LIVE_MONID_EXECUTION',
      totalActualCost,
      competitorsAnalyzed: competitorResults.length,
      competitorsFailed: failedAsins.length,
      totalReviewsRetrieved,
      engineVersion: 'ratina-investigation-engine-v2.0'
    }
  };

  // ─── SAVE PROOF ARTIFACT ────────────────────────────────────────────────────

  const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const proofPath = path.join(process.cwd(), 'temp', `live_proof_${categorySlug}.json`);
  
  try {
    fs.writeFileSync(proofPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[Investigation ${runId}] Proof artifact saved: ${proofPath}`);
  } catch (e) {
    console.error(`[Investigation ${runId}] Failed to save proof artifact: ${e.message}`);
  }

  console.log(`[Investigation ${runId}] Complete. Cost: $${totalActualCost.toFixed(5)} | Reviews: ${totalReviewsRetrieved} | Competitors: ${competitorResults.length}/${targetAsins.length}`);

  return {
    success: true,
    data: payload
  };
}
