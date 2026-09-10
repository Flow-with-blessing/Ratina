/**
 * Ratina.ai Product Intelligence & Failure Pattern Analysis Engine
 * Data Integrity & Evidence Traceability Engine
 */

// Failure dictionaries focused on investigation & supplier validation directives (no fabricated specs)
const FAILURE_DICTIONARIES = [
  {
    id: "fail-switch-button",
    name: "Switch actuation chatter & button response degradation",
    keywords: ["button", "buttons", "switch", "click", "clicks", "double click", "touchy", "stopped working", "durability", "months", "responsiveness"],
    sourcingTitle: "Investigate Switch Assembly Durability & Require Supplier Actuation Testing",
    sourcingDesc: "Require supplier to demonstrate switch contact reliability under continuous cycle testing and provide debouncing validation data before purchase order approval.",
    sourcingSpecs: [
      "Require supplier to submit lifecycle actuation test reports for switch durability",
      "Validate debouncing circuit performance to prevent double-click chatter",
      "Establish pre-shipment quality acceptance threshold for button actuation force"
    ],
    listingTitle: "Highlight Verified Switch Durability & Precision Actuation",
    listingDesc: "Address customer button responsiveness concerns by featuring verified switch lifecycle testing in product documentation.",
    copyBullets: [
      "TESTED PRECISION SWITCHES: Built with verified high-cycle switch assemblies to ensure consistent tactile responsiveness.",
      "LIFECYCLE TESTED: Actuation contacts engineered to prevent double-click degradation during long-term use."
    ]
  },
  {
    id: "fail-power-battery",
    name: "Power delivery drop & contact terminal corrosion",
    keywords: ["battery", "charge", "charging", "pogo", "die", "died", "power", "dead", "won't turn on", "stopped working", "contact", "corrosion", "voltage"],
    sourcingTitle: "Require Supplier Environmental Testing & Corrosion-Resistant Terminals",
    sourcingDesc: "Require supplier to provide moisture chamber and salt-spray corrosion testing results for battery contact terminals before production batch sign-off.",
    sourcingSpecs: [
      "Validate terminal plating corrosion resistance via environmental chamber testing",
      "Require supplier verification of internal moisture ingress barriers around battery contacts",
      "Mandate continuous voltage stability testing across multi-cycle charge/discharge runs"
    ],
    listingTitle: "Corrosion-Resistant Contact & Reliable Power Delivery Feature",
    listingDesc: "Reassure prospective buyers by highlighting environmental moisture resistance testing on power terminals.",
    copyBullets: [
      "CORROSION-RESISTANT CONTACTS: Terminal plating tested against sweat and ambient moisture buildup.",
      "STABLE POWER MANAGEMENT: Circuitry engineered for consistent battery contact and voltage stability."
    ]
  },
  {
    id: "fail-leak-seal",
    name: "Gasket compression drop & lid sealing vulnerability",
    keywords: ["leak", "leaks", "leaking", "spill", "spills", "gasket", "seal", "rubber ring", "drip", "dripping", "sweat", "condensation"],
    sourcingTitle: "Validate Lid Seal Gasket Compression & Pressure Leak Testing",
    sourcingDesc: "Require factory to evaluate gasket silicone durometer density and mandate 100% pre-shipment pressurized leak testing for lid assemblies.",
    sourcingSpecs: [
      "Validate silicone gasket compression retention under thermal and mechanical stress",
      "Require factory 100% air-pressure leak validation test on finished lid assemblies",
      "Verify dual-lip seal seating tolerance in production mold inspections"
    ],
    listingTitle: "Highlight Tested Spill-Proof Gasket Seal Engineering",
    listingDesc: "Preempt customer leakage concerns by demonstrating verified lid seal compression testing in listing images.",
    copyBullets: [
      "VERIFIED LEAK-RESISTANT SEAL: Precision-molded silicone gasket tested to prevent spills and drips.",
      "A+ Content Feature: Visual demonstration of high-density compression gasket seating."
    ]
  },
  {
    id: "fail-coating-finish",
    name: "Surface finish flaking & exterior coating degradation",
    keywords: ["peeling", "peel", "flaking", "flake", "paint", "coating", "chipping", "chip", "scratch", "dishwasher", "non-stick", "ptfe", "pfas"],
    sourcingTitle: "Require Coating Adhesion Testing & Thermal Cycle Validation",
    sourcingDesc: "Mandate cross-hatch adhesion scratch testing and dishwasher thermal cycle validation before accepting finished coating lots.",
    sourcingSpecs: [
      "Require standard ASTM D3359 cross-hatch adhesion testing on finished surface coatings",
      "Validate thermal resistance over repeated high-temperature wash cycles",
      "Verify material safety compliance certificates for all surface contact treatments"
    ],
    listingTitle: "Promote Verified Surface Coating Adhesion & Scratch Resistance",
    listingDesc: "Build customer trust by featuring verified coating durability and safety testing on the product page.",
    copyBullets: [
      "HIGH-ADHESION FINISH: Baked surface coating tested to resist scratching, flaking, and thermal wear.",
      "SAFETY VERIFIED: Certified coating formulation designed for long-term daily dishwasher use."
    ]
  },
  {
    id: "fail-ergonomics-fit",
    name: "Enclosure seam friction & ergonomic comfort fatigue",
    keywords: ["uncomfortable", "pain", "hurt", "hurts", "fit", "small", "large", "heavy", "stiff", "sharp", "ergo", "ergonomic", "weight", "comfort", "touchy"],
    sourcingTitle: "Inspect Plastic Parting Line Radii & Evaluate Ergonomic Contour Fit",
    sourcingDesc: "Require factory mold inspection to ensure de-burred parting lines and smooth seam geometry to eliminate friction during extended use.",
    sourcingSpecs: [
      "Inspect mold parting lines for edge burrs and enforce smooth seam radii",
      "Evaluate weight balance and user contact ergonomics across sample batches",
      "Verify dimensional tolerances for user fit components"
    ],
    listingTitle: "Highlight Ergonomic Contour & Balanced Weight Distribution",
    listingDesc: "Communicate ergonomic design validation and lightweight balance on the product listing.",
    copyBullets: [
      "CONTOURED ERGONOMIC FIT: Smooth edge geometry designed for fatigue-free daily use.",
      "BALANCED WEIGHT: Engineered chassis weight distribution for optimal hand comfort."
    ]
  }
];

export function analyzeProductIntelligence(rawResult) {
  const { asin, rawReviews = [], apifyData = {}, monidReceipt } = rawResult;

  // Metadata Extraction from Apify Details or First Review
  const firstRev = rawReviews[0] || {};
  const productName = apifyData.title || firstRev.productTitle || `Amazon ASIN: ${asin}`;
  const category = apifyData.breadcrumbs || 'Amazon Product Catalog';
  const imageUrl = (apifyData.images && apifyData.images[0]) || '📦';
  const price = apifyData.price || null;

  // DATA INTEGRITY: never invent catalog metadata. If the scrape did not
  // return a rating or a rating count, report it as unavailable rather than
  // substituting a plausible-looking default — a fabricated 4.6★ / 39,832
  // ratings would flow straight into the risk score and the verdict text.
  const parsedRating = parseFloat(apifyData.rating_stars ?? apifyData.rating);
  const rating = Number.isFinite(parsedRating) ? parsedRating : null;

  const parsedRatingCount = parseInt(apifyData.rating_count, 10);
  const totalAmazonRatings = Number.isFinite(parsedRatingCount) ? parsedRatingCount : null;

  // DATA INTEGRITY CORE: Exact individual review objects retrieved & analyzed
  const actualReviewsRetrieved = rawReviews.length;
  const actualReviewsAnalyzed = actualReviewsRetrieved;

  // Confidence Level Determination based on actual analyzed review sample size
  let confidenceLevel = "Moderate";
  let confidenceBadgeColor = "#F59E0B";
  let confidenceExplanation = totalAmazonRatings !== null
    ? `${actualReviewsAnalyzed} live individual customer reviews analyzed from ${totalAmazonRatings.toLocaleString()} total Amazon ratings.`
    : `${actualReviewsAnalyzed} live individual customer reviews analyzed. Total Amazon rating count was not returned by this scrape.`;

  if (actualReviewsAnalyzed >= 50) {
    confidenceLevel = "High";
    confidenceBadgeColor = "#22C55E";
  } else if (actualReviewsAnalyzed < 5) {
    confidenceLevel = "Sample Indicator (Small Sample)";
    confidenceBadgeColor = "#F59E0B";
  }

  // Parse rating distribution percentages — absent distribution contributes
  // zero, it does not get filled in with assumed 1★/2★ percentages.
  const ratingDist = apifyData.rating_distribution || {};
  const oneStarPct = parseInt(ratingDist['1star'], 10);
  const twoStarPct = parseInt(ratingDist['2star'], 10);
  const hasRatingDistribution = Number.isFinite(oneStarPct) || Number.isFinite(twoStarPct);
  const criticalReviewRatio = hasRatingDistribution
    ? ((Number.isFinite(oneStarPct) ? oneStarPct : 0) + (Number.isFinite(twoStarPct) ? twoStarPct : 0)) / 100
    : 0;

  // Perform Evidence Traceability Matching across failure dictionaries on individual review records
  const detectedPatterns = [];

  FAILURE_DICTIONARIES.forEach((dict) => {
    let supportingReviewsCount = 0;
    const matchingKeywords = [];
    const customerEvidence = [];

    // Check matches in verbatim individual review records returned by Monid
    rawReviews.forEach(rev => {
      const fullRevText = `${rev.title || rev.reviewTitle || ''} ${rev.text || rev.reviewText || ''}`.toLowerCase();
      const matchedKws = dict.keywords.filter(kw => fullRevText.includes(kw));

      if (matchedKws.length > 0) {
        supportingReviewsCount++;
        matchingKeywords.push(...matchedKws);

        if (customerEvidence.length < 3) {
          const excerptText = rev.text || rev.reviewText || rev.title || rev.reviewTitle || 'Customer reported functional defect during use.';
          const rawDate = rev.date || rev.reviewDate;
          const formattedDate = rawDate ? String(rawDate).replace(/^Reviewed in the United States on /, '') : 'Verified Purchase';
          
          const evidenceRating = parseFloat(rev.reviewRating ?? rev.rating ?? rev.stars);

          customerEvidence.push({
            quote: `"${excerptText}"`,
            // Null, not an assumed 1★, when the review's own rating is absent.
            rating: Number.isFinite(evidenceRating) ? evidenceRating : null,
            date: formattedDate,
            verified: (rev.verified ?? rev.verifiedPurchase) !== false,
            helpfulCount: rev.numberOfHelpful || rev.helpfulCount || 0
          });
        }
      }
    });

    // ONLY include failure pattern if there are real supporting reviews in retrieved sample!
    if (supportingReviewsCount > 0) {
      const percentOfAnalyzed = Math.round((supportingReviewsCount / Math.max(actualReviewsAnalyzed, 1)) * 100);
      
      const severity = supportingReviewsCount >= 3 || percentOfAnalyzed >= 15 ? 'high' : 'medium';
      const severityLabel = severity === 'high' ? 'High Severity' : 'Medium Severity';

      detectedPatterns.push({
        id: dict.id,
        name: dict.name,
        supportingReviewsCount,
        percentOfAnalyzed,
        severity,
        severityLabel,
        matchingKeywords: Array.from(new Set(matchingKeywords)),
        customerEvidence,
        sourcingRecommendation: {
          title: dict.sourcingTitle,
          description: dict.sourcingDesc,
          specs: dict.sourcingSpecs
        },
        listingOpportunity: {
          title: dict.listingTitle,
          description: dict.listingDesc,
          copyBullets: dict.copyBullets
        }
      });
    }
  });

  // Sort patterns by supporting review count
  detectedPatterns.sort((a, b) => b.supportingReviewsCount - a.supportingReviewsCount);

  // Compute Product Risk Score (1-100) from retrieved data only.
  const hasRating = rating !== null;
  const baseRisk = hasRating ? Math.round((5 - rating) * 30) : 0;
  const criticalBoost = Math.round(criticalReviewRatio * 40);
  const patternBoost = detectedPatterns[0]?.severity === 'high' ? 15 : 5;
  const riskScore = Math.min(95, Math.max(15, baseRisk + criticalBoost + patternBoost));

  // With no catalog rating AND no failure evidence retrieved, the score has
  // nothing behind it. Report that honestly instead of showing "LOW RISK",
  // which would read as a clean bill of health for a failed scrape.
  const riskIndeterminate = !hasRating && detectedPatterns.length === 0;

  let riskLevel = "MODERATE RISK";
  let riskColor = "#F59E0B";
  if (riskIndeterminate) {
    riskLevel = "INSUFFICIENT DATA";
    riskColor = "#F59E0B";
  } else if (riskScore >= 75) {
    riskLevel = "HIGH RISK";
    riskColor = "#EF4444";
  } else if (riskScore < 45) {
    riskLevel = "LOW RISK";
    riskColor = "#22C55E";
  }

  // Display-safe strings so an unavailable value never renders as "null/5".
  const ratingText = hasRating ? `${rating}/5` : 'rating unavailable';
  const ratingsCountText = totalAmazonRatings !== null
    ? `${totalAmazonRatings.toLocaleString()} ratings`
    : 'an undisclosed number of ratings';

  // Generate Executive Ratina Verdict
  const topFailure = detectedPatterns[0];
  let verdictText = "PASS — LOW MANUFACTURING DEFECT CONCENTRATION";
  let statusBadge = "pass";
  let summary = `Live Amazon analysis for ${productName} (ASIN: ${asin}) indicates strong overall satisfaction (${ratingText} across ${ratingsCountText}). Based on ${actualReviewsAnalyzed} analyzed individual live reviews, primary area for investigation: ${topFailure?.name || 'Standard wear'}. Validate quality testing with suppliers prior to production sign-off.`;

  if (riskIndeterminate) {
    verdictText = "INSUFFICIENT DATA — RETRIEVAL INCOMPLETE";
    statusBadge = "action-required";
    summary = `The Monid retrieval for ASIN ${asin} returned no catalog rating and no matching failure evidence across ${actualReviewsAnalyzed} analyzed review(s). This is a data availability limitation, not evidence that the product is defect-free. Re-run the retrieval before drawing a sourcing conclusion.`;
  } else if (riskScore >= 70) {
    verdictText = "HIGH RISK — SUPPLIER VALIDATION & TESTING MANDATORY";
    statusBadge = "critical";
    summary = `Critical failure pattern signals identified in retrieved review sample for ASIN ${asin}. ${topFailure?.name} represents a key customer concern area. Mandate supplier testing validation before committing purchase orders.`;
  } else if (riskScore >= 50) {
    verdictText = "CONDITIONAL PASS — SUPPLIER TESTING RECOMMENDED";
    statusBadge = "action-required";
    summary = `Product demand is high (${ratingText}), but area for supplier validation identified: ${topFailure?.name} (${topFailure?.supportingReviewsCount} supporting reviews out of ${actualReviewsAnalyzed} analyzed). Require supplier to validate quality testing directives.`;
  }

  return {
    asin,
    productName,
    category,
    imageUrl: typeof imageUrl === 'string' && imageUrl.startsWith('http') ? imageUrl : '📦',
    rating,
    ratingDisplay: ratingText,
    ratingAvailable: hasRating,
    totalAmazonRatings,
    totalAmazonRatingsDisplay: ratingsCountText,
    riskIndeterminate,
    actualReviewsRetrieved,
    actualReviewsAnalyzed,
    confidence: {
      level: confidenceLevel,
      badgeColor: confidenceBadgeColor,
      explanation: confidenceExplanation
    },
    price,
    analysisDate: new Date().toISOString().split('T')[0],
    riskScore,
    riskLevel,
    riskColor,
    monidReceipt: {
      totalAmazonRatings,
      actualReviewsRetrieved,
      actualReviewsAnalyzed,
      tokenCostUSD: monidReceipt.totalCostUSD,
      totalCostNumber: monidReceipt.totalCostNumber,
      computeLatencyMs: monidReceipt.totalLatencyMs,
      monidCalls: monidReceipt.monidCalls,
      dataGateway: `Monid CLI Gateway (${monidReceipt.gatewaysUsed.join(' + ')})`
    },
    topFailurePatterns: detectedPatterns.slice(0, 4),
    ratinaVerdict: {
      verdictText,
      statusBadge,
      summary
    }
  };
}
