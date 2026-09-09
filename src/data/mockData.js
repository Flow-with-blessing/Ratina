// Pre-loaded Demo Datasets for Ratina.ai Analysis Pipeline

export const MOCK_ANALYSIS_DATA = {
  "B08N5WRWNW": {
    asin: "B08N5WRWNW",
    productName: "HydroShield 40oz Insulated Stainless Steel Tumbler with Straw",
    category: "Kitchen & Dining / Drinkware",
    imageUrl: "🥤",
    rating: 3.9,
    totalReviewsScraped: 1420,
    analysisDate: "2026-09-03",
    riskScore: 78,
    riskLevel: "HIGH RISK",
    riskColor: "#EF4444",
    monidReceipt: {
      reviewsExtracted: 1420,
      tokenCostUSD: "$0.042",
      computeLatencyMs: 1480,
      dataGateway: "Monid Live Amazon Review Gateway v3.1",
      apiCreditsUsed: 14.2
    },
    topFailurePatterns: [
      {
        id: "fail-1",
        name: "Lid leakage & gasket compression seal drop",
        mentions: 154,
        percentOfNegative: 37,
        severity: "high",
        severityLabel: "High Severity",
        customerEvidence: [
          {
            quote: "Leaks all over my car passenger seat when tipped! The silicone ring inside the lid doesn't seal tightly around the straw insertion slot.",
            rating: 1,
            date: "2026-08-14",
            verified: true
          },
          {
            quote: "Loved the color at first, but after 3 washes the rubber seal gets loose and hot coffee spills whenever you drink at an angle.",
            rating: 2,
            date: "2026-08-02",
            verified: true
          },
          {
            quote: "Does not pass the tilt test at all. The flip seal pop-cap doesn't lock down properly.",
            rating: 1,
            date: "2026-07-29",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Redesign Lid Gasket & Implement Dual-Barrier Silicone Seal",
          description: "Require supplier to upgrade gasket material to Shore 60A medical-grade silicone with dual-lip compression ridges. Mandatory 100% leak-proof pressurized air testing on factory assembly line prior to shipment.",
          specs: [
            "Upgrade silicone seal density from 45A to 60A Shore Hardness",
            "Add dual-lip compression ridge inside flip lock lid groove",
            "Mandate ISO 9001 air-pressure leak test pass certificate per batch"
          ]
        },
        listingOpportunity: {
          title: "Visual Leak-Proof Guarantee Imagery & Copy Defense",
          description: "Transform negative customer expectations into your primary selling point by demonstrating your upgraded seal.",
          copyBullets: [
            "100% SPILL-PROOF DUAL-GASKET SEAL: Engineered with Shore 60A medical-grade silicone to prevent drops and leaks even when completely inverted.",
            "Include A+ Content infographic showing macro cross-section of dual-ridge lid seal vs cheap single-layer gaskets."
          ]
        }
      },
      {
        id: "fail-2",
        name: "Handle weld detachment & structural fatigue",
        mentions: 75,
        percentOfNegative: 18,
        severity: "high",
        severityLabel: "High Severity",
        customerEvidence: [
          {
            quote: "The plastic handle snapped clean off the metal body while carrying a full mug of ice water! Very dangerous.",
            rating: 1,
            date: "2026-08-20",
            verified: true
          },
          {
            quote: "Top rivet loosened after two weeks. Now the handle wobbles every time I lift it.",
            rating: 2,
            date: "2026-08-11",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Reinforce Handle Attachment with Ultrasonic Dual-Riveting",
          description: "Switch from single spot-weld to heavy-duty stainless steel dual-through rivets with internal backing plate.",
          specs: [
            "Replace spot-weld with 304 SS dual through-rivets",
            "Minimum 25kg pull-strength stress test validation per unit"
          ]
        },
        listingOpportunity: {
          title: "Promote Heavy-Duty Reinforced Handle Construction",
          description: "Reassure buyers with 'Reinforced Dual-Riveted Ergonomic Handle built for daily 40oz capacity loads'.",
          copyBullets: [
            "HEAVY-DUTY RIVETED HANDLE: Zero-wobble dual-through rivets rated for 50 lbs load capacity."
          ]
        }
      },
      {
        id: "fail-3",
        name: "Coating chipping & exterior paint peeling",
        mentions: 50,
        percentOfNegative: 12,
        severity: "medium",
        severityLabel: "Medium Severity",
        customerEvidence: [
          {
            quote: "Powder coating started flaking off near the bottom rim after going through the dishwasher once.",
            rating: 2,
            date: "2026-08-05",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Upgrade to Electro-Bonded Matte Powder Coating",
          description: "Enforce automated electrostatic powder spray with 200°C curing cycle for scratch resistance.",
          specs: [
            "Electrostatic powder coat with 50μm layer thickness minimum",
            "Dishwasher safety testing validation (50 thermal cycles)"
          ]
        },
        listingOpportunity: {
          title: "Dishwasher Safe & Scratch-Resistant Matte Finish Messaging",
          description: "Highlight 'DuraCoat™ Electro-Bonded Finish — Guaranteed Dishwasher Safe & Chip-Proof'.",
          copyBullets: [
            "DURACOAT DISHWASHER SAFE: Premium electro-baked coating resists scratches, flaking, and condensation."
          ]
        }
      }
    ],
    ratinaVerdict: {
      verdictText: "CONDITIONAL PASS — DO NOT SOURCE AS-IS",
      statusBadge: "action-required",
      summary: "High customer demand category, but current factory mold exhibits critical lid leakage (37% complaint rate) and handle structural fatigue. Proceed ONLY if factory signs manufacturing agreement adopting Shore 60A silicone gaskets and dual-rivet handle specs."
    }
  },
  
  "B09X87Y6Z1": {
    asin: "B09X87Y6Z1",
    productName: "AeroBeat Pro Active Noise Cancelling Wireless Earbuds",
    category: "Electronics / Headphones",
    imageUrl: "🎧",
    rating: 4.1,
    totalReviewsScraped: 980,
    analysisDate: "2026-09-03",
    riskScore: 64,
    riskLevel: "MODERATE RISK",
    riskColor: "#F59E0B",
    monidReceipt: {
      reviewsExtracted: 980,
      tokenCostUSD: "$0.029",
      computeLatencyMs: 1120,
      dataGateway: "Monid Live Amazon Review Gateway v3.1",
      apiCreditsUsed: 9.8
    },
    topFailurePatterns: [
      {
        id: "fail-eb-1",
        name: "Left earbud charging contact oxidation & failure",
        mentions: 92,
        percentOfNegative: 28,
        severity: "high",
        severityLabel: "High Severity",
        customerEvidence: [
          {
            quote: "Left earbud stopped charging after 3 weeks. Pogo pins inside case are loose and don't make full contact.",
            rating: 1,
            date: "2026-08-19",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Gold-Plated Pogo Pin Springs & Sweat-Resistant Seal",
          description: "Upgrade charging contacts to 24K gold-plated copper pogo pins with anti-sweat rubber grommets.",
          specs: [
            "24K Gold-plating (3μin) on charging pogo pins",
            "IPX7 moisture ingress protection inside charging stem"
          ]
        },
        listingOpportunity: {
          title: "Highlight Sweat-Proof Gold Charging Contacts",
          description: "Educate users on superior anti-corrosion charging contact longevity.",
          copyBullets: [
            "CORROSION-FREE CHARGING: 24K Gold-plated contacts resist sweat oxidation for long-lasting battery connectivity."
          ]
        }
      },
      {
        id: "fail-eb-2",
        name: "Wind noise in ANC outdoor mode",
        mentions: 48,
        percentOfNegative: 15,
        severity: "medium",
        severityLabel: "Medium Severity",
        customerEvidence: [
          {
            quote: "ANC works fine in a room, but outside during a breeze there is a harsh whistling sound in my ears.",
            rating: 2,
            date: "2026-08-01",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Add Mesh Wind Filter & Firmware ANC Defensiveness",
          description: "Integrate micro-mesh acoustic wind shields over feedforward microphones.",
          specs: [
            "Stainless steel micro-mesh mic mesh (0.1mm pore)",
            "Firmware update v2.4 wind noise suppression algorithm"
          ]
        },
        listingOpportunity: {
          title: "Promote AeroWind™ Cancellation Technology",
          description: "Turn ANC wind vulnerability into a feature highlight.",
          copyBullets: [
            "AEROWIND MESH SHIELD: Dual acoustic micro-mesh filters block wind whistling during outdoor workouts."
          ]
        }
      }
    ],
    ratinaVerdict: {
      verdictText: "PASS WITH MINOR FACTORY REVISIONS",
      statusBadge: "pass",
      summary: "Solid electronics architecture. Main complaint stems from cheap pogo pin plating oxidation. Easily solved with $0.08 gold-plating component upgrade per unit."
    }
  },

  "B07T123456": {
    asin: "B07T123456",
    productName: "CrispMaster 6.5QT Digital Stainless Steel Air Fryer",
    category: "Kitchen Appliances",
    imageUrl: "🍳",
    rating: 3.7,
    totalReviewsScraped: 2150,
    analysisDate: "2026-09-02",
    riskScore: 82,
    riskLevel: "CRITICAL RISK",
    riskColor: "#EF4444",
    monidReceipt: {
      reviewsExtracted: 2150,
      tokenCostUSD: "$0.064",
      computeLatencyMs: 1850,
      dataGateway: "Monid Live Amazon Review Gateway v3.1",
      apiCreditsUsed: 21.5
    },
    topFailurePatterns: [
      {
        id: "fail-af-1",
        name: "Non-stick basket coating flaking into food",
        mentions: 284,
        percentOfNegative: 42,
        severity: "high",
        severityLabel: "High Severity",
        customerEvidence: [
          {
            quote: "Black non-stick coating started peeling off into our food after only 1 month of gentle hand washing with soft sponge! Chemical hazard concern.",
            rating: 1,
            date: "2026-08-28",
            verified: true
          }
        ],
        sourcingRecommendation: {
          title: "Switch to Ceramic Non-Stick or Cast Aluminum Basket",
          description: "Eliminate PTFE coating flaking risk entirely by requiring factory to use FDA/EU food-grade ceramic non-stick coating.",
          specs: [
            "PFAS/PFOA-free Ceramic non-stick coating formulation",
            "Cross-hatch adhesion scratch test standard ASTM D3359 Level 5B"
          ]
        },
        listingOpportunity: {
          title: "Toxic-Free Ceramic Coating Marketing Positioning",
          description: "Massive conversion driver targeting health-conscious air fryer shoppers.",
          copyBullets: [
            "100% CERAMIC TOXIN-FREE BASKET: 0% PTFE/PFOA flaking. Non-stick ceramic coating designed for 5,000+ scrub cycles."
          ]
        }
      }
    ],
    ratinaVerdict: {
      verdictText: "HIGH RISK — COMPLETE MATERIAL OVERHAUL NEEDED",
      statusBadge: "critical",
      summary: "Severe coating flaking issues pose immediate return spike and safety review risk on Amazon. Do NOT source PTFE basket version under any circumstances."
    }
  }
};

export const PRESET_ASINS = [
  { asin: "B08N5WRWNW", label: "Insulated 40oz Tumbler", risk: 78, color: "#EF4444" },
  { asin: "B09X87Y6Z1", label: "ANC Wireless Earbuds", risk: 64, color: "#F59E0B" },
  { asin: "B07T123456", label: "6.5QT Digital Air Fryer", risk: 82, color: "#EF4444" }
];
