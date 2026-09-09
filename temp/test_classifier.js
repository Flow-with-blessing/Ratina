/**
 * Test script for Context-Aware, Evidence-Weighted Failure Classifier
 */

// ─── LINGUISTIC PATTERNS & HELPERS ──────────────────────────────────────────

const NEGATION_PATTERN = /\b(never|doesn't|does not|didn't|did not|won't|will not|haven't|hasn't|has not|not|no|without|zero|neither)\b/i;

const POSITIVE_PATTERN = /\b(love|loved|loves|great|excellent|perfect|perfectly|fantastic|superb|amazing|best|durable|sturdy|well made|high quality|very good|smooth|effortless|powerful|strong|exceeded|happy|satisfied|pleased)\b/i;

const ATTRIBUTE_SPEC_PATTERN = /\b(\d+\s*(mah|oz|ounce|watt|w|v|volt|ml|rpm|cups?))\b/i;

const EXPLICIT_DEFECT_PATTERN = /\b(stopped working|stopped|won't work|doesn't work|not working|broke|broken|break|breaks|cracked|crack|cracks|cracking|shattered|shatter|shattering|exploded|died|dies|dead|failed|fails|failure|malfunction|malfunctioning|defect|defective|leaks|leaked|leaking|leakage|spill|spills|spilling|drips|dripping|overheat|overheating|overheated|burn|burned|burnt|burning|smoke|smoking|smell|smelling|melt|melted|melting|dull|not sharp|not cutting|chunks|chunky|won't blend|doesn't blend|won't charge|not charging|drains fast|dies quickly|uncomfortable|pain|hurt|hurts|sharp edges|flaking|peeling|chipping|rust|rusting|rusted|corrosion|stripped|bent|wobbly|loose|detached|noisy|rattling|terrible|awful|garbage|useless|waste|disappointed|frustrated|returned|returning|refund|replacement|poor quality)\b/i;

/**
 * Splits text into sentences and sub-clauses for fine-grained context evaluation.
 */
function splitIntoClauses(text) {
  if (!text) return [];
  // Split on sentence boundaries
  const rawSentences = text.split(/[.!?\n\r]+/);
  const clauses = [];

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    // Also split compound sentences by contrasting conjunctions: ' but ', ' however ', ' although ', ' yet '
    const subParts = trimmed.split(/\s+(?:but|however|although|yet)\s+/i);
    for (const p of subParts) {
      const clean = p.trim();
      if (clean) clauses.push(clean);
    }
  }
  return clauses;
}

/**
 * Classifies whether a keyword occurrence in a review represents an actual failure.
 */
function classifyContext(clause, keyword, starRating = 3) {
  const lowerClause = clause.toLowerCase();
  const kwLower = keyword.toLowerCase();

  // 1. Check if keyword is actually in this clause
  if (!lowerClause.includes(kwLower)) {
    return {
      isFailure: false,
      contextType: 'not_found',
      evidenceWeight: 0,
      classificationReason: 'Keyword not present in clause'
    };
  }

  // Find position of keyword in clause
  const kwIndex = lowerClause.indexOf(kwLower);
  // Extract local window of ~6 words before keyword to check immediate negation
  const beforeText = lowerClause.substring(Math.max(0, kwIndex - 40), kwIndex);
  const afterText = lowerClause.substring(kwIndex + kwLower.length, Math.min(lowerClause.length, kwIndex + kwLower.length + 40));

  // 2. Check for negation in local window (e.g., "never leaks", "doesn't leak", "no cracking")
  const hasNegationBefore = NEGATION_PATTERN.test(beforeText);
  const hasNegationAfter = /\b(not|never|no|zero)\b/i.test(afterText);
  
  if (hasNegationBefore || (lowerClause.includes('no ') && lowerClause.includes(kwLower))) {
    // Check if the negation is negating a failure term (e.g., "no cracking", "never leaks", "doesn't break")
    return {
      isFailure: false,
      contextType: 'negated_failure',
      evidenceWeight: 0,
      classificationReason: `Negation detected preceding '${keyword}' in clause: "${clause}"`
    };
  }

  // 3. Check for explicit defect indicator in the clause
  const defectMatch = lowerClause.match(EXPLICIT_DEFECT_PATTERN);
  const hasExplicitDefect = Boolean(defectMatch);

  // 4. Check for positive sentiment indicator in the clause
  const positiveMatch = lowerClause.match(POSITIVE_PATTERN);
  const hasPositive = Boolean(positiveMatch);

  // 5. Positive experience filter: has positive sentiment and NO explicit defect
  if (hasPositive && !hasExplicitDefect) {
    return {
      isFailure: false,
      contextType: 'positive_experience',
      evidenceWeight: 0,
      classificationReason: `Positive sentiment ('${positiveMatch[0]}') qualifies '${keyword}' without defect statement: "${clause}"`
    };
  }

  // 6. Neutral attribute / specification check: mentions spec/capacity/battery without problem
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

  // 7. Explicit failure: has explicit defect indicator
  if (hasExplicitDefect) {
    // Star-rating weighting scheme
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

  // 8. Ambiguous / unverified context: keyword present but neither explicit defect nor clear positive
  return {
    isFailure: false,
    contextType: 'ambiguous',
    evidenceWeight: 0,
    classificationReason: `Ambiguous context for '${keyword}': lacks definitive defect or satisfaction indicator: "${clause}"`
  };
}

/**
 * Analyzes a review text for a specific failure mode with context-aware classification.
 */
function evaluateReviewForFailureMode(review, failureModeDict) {
  const fullText = `${review.title || ''} ${review.text || ''}`.trim();
  if (!fullText) return null;

  const starRating = review.rating ? parseFloat(review.rating) : 3;
  const clauses = splitIntoClauses(fullText);

  // Find all keywords from this failure mode that appear in text
  for (const kw of failureModeDict.keywords) {
    for (const clause of clauses) {
      if (clause.toLowerCase().includes(kw.toLowerCase())) {
        const classification = classifyContext(clause, kw, starRating);
        if (classification.isFailure) {
          return {
            failureMode: failureModeDict.name,
            failureModeId: failureModeDict.id,
            reviewId: review.reviewId || 'rev_unknown',
            asin: review.asin || 'unknown',
            rating: starRating,
            date: review.date || 'unknown',
            matchedTerm: kw,
            supportingText: clause,
            contextType: classification.contextType,
            evidenceWeight: classification.evidenceWeight,
            classificationReason: classification.classificationReason
          };
        }
      }
    }
  }

  return null;
}

// ─── UNIT TESTS ─────────────────────────────────────────────────────────────

const DICTS = {
  leak: { id: 'leak-seal', name: 'Lid Seal Leaking / Spill Vulnerability', keywords: ['leak', 'leaks', 'leaking', 'spill', 'seal', 'lid', 'drip'] },
  battery: { id: 'battery-charge', name: 'Battery / Charging Failure', keywords: ['battery', 'charge', 'charging', "won't charge", 'usb', 'power'] },
  motor: { id: 'motor-burnout', name: 'Motor Burn-Out / Overheating', keywords: ['motor', 'burn', 'overheat', 'stopped working', 'died'] },
  durability: { id: 'glass-shatter', name: 'Thermal Shock / Glass Shattering', keywords: ['crack', 'cracked', 'shatter', 'durable', 'durability', 'break'] }
};

const testCases = [
  {
    name: '1. POSITIVE: "Never leaks, love the tight lid seal."',
    review: { text: 'Never leaks, love the tight lid seal.', rating: 5 },
    dict: DICTS.leak,
    expectedFailure: false
  },
  {
    name: '2. NEGATIVE: "The lid started leaking after two weeks."',
    review: { text: 'The lid started leaking after two weeks.', rating: 1 },
    dict: DICTS.leak,
    expectedFailure: true
  },
  {
    name: '3. ATTRIBUTE: "The battery is 500mAh."',
    review: { text: 'The battery is 500mAh.', rating: 4 },
    dict: DICTS.battery,
    expectedFailure: false
  },
  {
    name: '4. FAILURE: "The battery dies after two uses."',
    review: { text: 'The battery dies after two uses.', rating: 1 },
    dict: DICTS.battery,
    expectedFailure: true
  },
  {
    name: '5. POSITIVE MOTOR: "The motor is powerful."',
    review: { text: 'The motor is powerful.', rating: 5 },
    dict: DICTS.motor,
    expectedFailure: false
  },
  {
    name: '6. MOTOR FAILURE: "The motor stopped working after three weeks."',
    review: { text: 'The motor stopped working after three weeks.', rating: 1 },
    dict: DICTS.motor,
    expectedFailure: true
  },
  {
    name: '7. POSITIVE DURABILITY: "Very durable, no cracking."',
    review: { text: 'Very durable, no cracking.', rating: 5 },
    dict: DICTS.durability,
    expectedFailure: false
  },
  {
    name: '8. NEGATIVE DURABILITY: "The glass cracked during normal washing."',
    review: { text: 'The glass cracked during normal washing.', rating: 1 },
    dict: DICTS.durability,
    expectedFailure: true
  },
  {
    name: '9. HIGH-RATING TEST: 5-star review containing failure keyword but clearly positive',
    review: { text: 'Love this blender, the motor runs great and battery is amazing!', rating: 5 },
    dict: DICTS.motor,
    expectedFailure: false
  },
  {
    name: '10. HIGH-RATING WITH REAL FAILURE: 4-star review with explicit failure',
    review: { text: 'Great size and looks nice, but the motor started smoking and died after a month.', rating: 4 },
    dict: DICTS.motor,
    expectedFailure: true,
    checkWeight: 0.40
  },
  {
    name: '11. MULTI-FAILURE TEST: "The motor stopped and the lid began leaking."',
    review: { text: 'The motor stopped and the lid began leaking.', rating: 1 },
    dictA: DICTS.motor,
    dictB: DICTS.leak,
    isMulti: true
  },
  {
    name: '12. AMBIGUOUS TEST: Context lacking defect or positive indicators',
    review: { text: 'The blender has a 20 oz cup and a lithium battery.', rating: 3 },
    dict: DICTS.battery,
    expectedFailure: false
  }
];

console.log('====================================================');
console.log('CONTEXT-AWARE FAILURE CLASSIFIER TEST SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

for (const tc of testCases) {
  total++;
  if (tc.isMulti) {
    const resA = evaluateReviewForFailureMode(tc.review, tc.dictA);
    const resB = evaluateReviewForFailureMode(tc.review, tc.dictB);
    const pass = Boolean(resA) && Boolean(resB);
    if (pass) {
      passed++;
      console.log(`✅ [PASS] ${tc.name}`);
      console.log(`   Result A: ${resA.failureMode} (${resA.supportingText})`);
      console.log(`   Result B: ${resB.failureMode} (${resB.supportingText})`);
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
    }
  } else {
    const res = evaluateReviewForFailureMode(tc.review, tc.dict);
    const isFail = Boolean(res);
    const pass = isFail === tc.expectedFailure && (!tc.checkWeight || res.evidenceWeight === tc.checkWeight);
    if (pass) {
      passed++;
      console.log(`✅ [PASS] ${tc.name}`);
      if (res) {
        console.log(`   Matched: ${res.failureMode} | Weight: ${res.evidenceWeight} | Reason: ${res.classificationReason}`);
      } else {
        console.log(`   Correctly excluded from failure classification`);
      }
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
      console.error(`   Expected: ${tc.expectedFailure}, Got: ${isFail}`, res);
    }
  }
}

console.log('\n====================================================');
console.log(`TOTAL: ${passed}/${total} TESTS PASSED`);
console.log('====================================================');
