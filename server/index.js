import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetchAmazonDataWithMonid } from './monidService.js';
import { analyzeProductIntelligence } from './analyzer.js';
import { runInvestigation } from './investigationEngine.js';
import { generateSourcingBriefText, generateSourcingJSON } from './exportService.js';
import { getLiveProofPayload } from './liveProofPayload.js';
import { getCachedResult, setCachedResult, getCacheStats, getAllCachedKeys } from './cache.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory store for the last investigation result (for exports)
let lastInvestigationResult = null;

// Maximum budget guard ($1.00 for this validation sprint)
const SPRINT_BUDGET_MAX = 1.00;
let sprintTotalSpend = 0;

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

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
    sprintBudgetUsed: `$${sprintTotalSpend.toFixed(5)}`,
    sprintBudgetRemaining: `$${(SPRINT_BUDGET_MAX - sprintTotalSpend).toFixed(5)}`,
    cache: getCacheStats()
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

/**
 * POST /api/investigate
 * 
 * General-purpose live investigation endpoint.
 * Supports both dynamic discovery (search → select → enrich)
 * and pre-selected ASIN lists.
 * 
 * Body: { category: string, asins?: string[], searchQuery?: string }
 */
app.post('/api/investigate', async (req, res) => {
  try {
    const { category, asins, searchQuery, forceFresh } = req.body;

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
        lastInvestigationResult = cached;
        return res.json({
          success: true,
          data: cached,
          source: 'CACHE',
          sprintBudget: {
            thisRunCost: 0,
            sprintTotalSpend,
            sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
          }
        });
      }
    }

    // Budget guard
    if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
      return res.status(402).json({
        error: 'BUDGET_EXHAUSTED',
        message: `Sprint budget limit of $${SPRINT_BUDGET_MAX.toFixed(2)} reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`,
        sprintTotalSpend,
        sprintBudgetMax: SPRINT_BUDGET_MAX
      });
    }

    console.log(`[Ratina Investigation] Category: "${category}" | Mode: ${asins ? 'Pre-selected' : 'Dynamic Discovery'}`);

    const result = await runInvestigation({
      category: category.trim(),
      asins: asins && asins.length > 0 ? asins : undefined,
      searchQuery: searchQuery || undefined
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'INVESTIGATION_FAILED',
        message: result.error || 'Investigation failed',
        executionMetadata: result.executionMetadata
      });
    }

    // Track sprint spend
    const cost = result.data?.executionMetadata?.totalActualCost || 0;
    sprintTotalSpend += cost;

    // Store for exports and cache
    lastInvestigationResult = result.data;
    setCachedResult(cacheKey, result.data);

    return res.json({
      success: true,
      data: result.data,
      source: 'LIVE_MONID_EXECUTION',
      sprintBudget: {
        thisRunCost: cost,
        sprintTotalSpend,
        sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
      }
    });
  } catch (error) {
    console.error('[Investigation Error]:', error);
    return res.status(500).json({
      error: 'INVESTIGATION_ERROR',
      message: error.message || String(error)
    });
  }
});

/**
 * POST /api/analyze-multi
 * Multi-ASIN Competitor Cross-Analysis — NOW RUNS LIVE
 */
app.post('/api/analyze-multi', async (req, res) => {
  try {
    const { asins, category, mode } = req.body;
    
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

    const result = await runInvestigation({
      category: targetCategory,
      asins: targetAsins
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'MULTI_ANALYSIS_FAILED',
        message: result.error || 'Multi-ASIN analysis failed',
        executionMetadata: result.executionMetadata
      });
    }

    const cost = result.data?.executionMetadata?.totalActualCost || 0;
    sprintTotalSpend += cost;
    lastInvestigationResult = result.data;

    return res.json({
      success: true,
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

/**
 * POST /api/analyze
 * Single-ASIN Live Monid Analysis
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { asin, mode } = req.body;

    // Benchmark mode → redirect to multi-ASIN live investigation
    if (mode === 'benchmark' || (asin && asin === 'BENCHMARK_5_ASINS')) {
      // Budget guard
      if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
        return res.status(402).json({
          error: 'BUDGET_EXHAUSTED',
          message: `Sprint budget limit reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`
        });
      }

      const benchmarkAsins = ['B00008XEWG', 'B000KEM4TQ', 'B00004Y6A2', 'B01J4327D8', 'B07N3ZJDFR'];
      
      console.log(`[Ratina Benchmark] Live execution for French Press benchmark`);

      const result = await runInvestigation({
        category: 'French Press Coffee Makers (34oz / 1-Liter)',
        asins: benchmarkAsins
      });

      if (!result.success) {
        return res.status(500).json({
          error: 'BENCHMARK_FAILED',
          message: result.error || 'Benchmark failed'
        });
      }

      const cost = result.data?.executionMetadata?.totalActualCost || 0;
      sprintTotalSpend += cost;
      lastInvestigationResult = result.data;

      return res.json({
        success: true,
        data: result.data,
        sprintBudget: {
          thisRunCost: cost,
          sprintTotalSpend,
          sprintBudgetRemaining: SPRINT_BUDGET_MAX - sprintTotalSpend
        }
      });
    }

    // Phase 7: Validation - Check ASIN input
    if (!asin || typeof asin !== 'string') {
      return res.status(400).json({
        error: 'INVALID_ASIN',
        message: 'Please provide a valid 10-character Amazon ASIN.'
      });
    }

    const cleanAsin = asin.trim().toUpperCase();

    // Check for multiple ASINs in single-ASIN field
    if (cleanAsin.includes(',') || cleanAsin.includes(' ')) {
      return res.status(400).json({
        error: 'MULTIPLE_ASINS',
        message: 'This field accepts a single ASIN. Use the Market Investigation for multi-ASIN analysis.'
      });
    }

    const asinRegex = /^[A-Z0-9]{10}$/;
    if (!asinRegex.test(cleanAsin)) {
      return res.status(400).json({
        error: 'MALFORMED_ASIN',
        message: `"${cleanAsin}" is not a valid 10-character Amazon ASIN. (Example valid ASIN: B07CMS5Q6P or B00091S3K4)`
      });
    }

    // Budget guard
    if (sprintTotalSpend >= SPRINT_BUDGET_MAX) {
      return res.status(402).json({
        error: 'BUDGET_EXHAUSTED',
        message: `Sprint budget limit reached. Total spent: $${sprintTotalSpend.toFixed(5)}.`
      });
    }

    console.log(`[Monid Integration] Initiating live retrieval for ASIN: ${cleanAsin}...`);

    // Live Monid Data Retrieval — always fresh, never cached
    const rawMonidResult = await fetchAmazonDataWithMonid(cleanAsin);
    const reviews = rawMonidResult.rawReviews || [];
    const aData = rawMonidResult.apifyData || {};

    // Track cost
    const cost = rawMonidResult.monidReceipt?.totalCostNumber || 0;
    sprintTotalSpend += cost;

    if (reviews.length === 0 && !aData.title && !aData.asin) {
      console.warn(`[Monid Integration] Product not found or empty response for ASIN: ${cleanAsin}`);
      return res.status(404).json({
        error: 'PRODUCT_NOT_FOUND',
        message: `No Amazon product could be retrieved for ASIN: ${cleanAsin}. Please check the ASIN and try again.`,
        monidReceipt: rawMonidResult.monidReceipt,
        warnings: rawMonidResult.warnings
      });
    }

    const intelligenceReport = analyzeProductIntelligence(rawMonidResult);

    // Add execution metadata
    intelligenceReport.executionMetadata = {
      runId: `single_${Date.now()}`,
      executedAt: new Date().toISOString(),
      isLiveExecution: true,
      source: 'LIVE_MONID_EXECUTION',
      totalActualCost: cost
    };

    return res.json({
      success: true,
      data: intelligenceReport
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
 * GET /api/saved-benchmark
 * Returns the saved French Press benchmark (clearly tagged as SAVED)
 */
app.get('/api/saved-benchmark', (req, res) => {
  try {
    const payload = getLiveProofPayload();
    
    // Tag as saved result
    payload.executionMetadata = {
      runId: 'saved_french_press_benchmark',
      executedAt: payload.timestamp || '2026-09-06T00:00:00Z',
      isLiveExecution: false,
      source: 'SAVED_RESULT',
      totalActualCost: 0.018,
      note: 'This is a previously saved benchmark result. To run a fresh benchmark, use the live investigation endpoint.'
    };

    lastInvestigationResult = payload;

    return res.json({
      success: true,
      data: payload
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
 * Download current investigation as JSON
 */
app.get('/api/export/json', (req, res) => {
  if (!lastInvestigationResult) {
    return res.status(404).json({ error: 'No investigation data available. Run an investigation first.' });
  }

  const jsonData = generateSourcingJSON(lastInvestigationResult);
  const category = (lastInvestigationResult.category || 'investigation').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `ratina_sourcing_${category}_${Date.now()}.json`;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(jsonData, null, 2));
});

/**
 * GET /api/export/brief
 * Download current investigation as plain-text Sourcing Brief
 */
app.get('/api/export/brief', (req, res) => {
  if (!lastInvestigationResult) {
    return res.status(404).json({ error: 'No investigation data available. Run an investigation first.' });
  }

  const briefText = generateSourcingBriefText(lastInvestigationResult);
  const category = (lastInvestigationResult.category || 'investigation').toLowerCase().replace(/[^a-z0-9]+/g, '_');
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
app.post('/api/mcp', async (req, res) => {
  const { method, params, id } = req.body;

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
              toolResult = { source: 'CACHE', cost: '$0.00', category: cached.category, decision: cached.finalDecision, opportunityScore: cached.productOpportunityScore };
            }
          }
          if (!toolResult) {
            const result = await runInvestigation({ category: args.category.trim(), searchQuery: args.search_query });
            if (!result.success) throw new Error(result.error);
            setCachedResult(cacheKey, result.data);
            lastInvestigationResult = result.data;
            const cost = result.data?.executionMetadata?.totalActualCost || 0;
            sprintTotalSpend += cost;
            toolResult = { source: 'LIVE', cost: `$${cost.toFixed(5)}`, category: result.data.category, decision: result.data.finalDecision, opportunityScore: result.data.productOpportunityScore };
          }
        } else if (name === 'get_failure_matrix') {
          const cached = getCachedResult((args.category || '').trim().toLowerCase());
          if (!cached) throw new Error(`No data for "${args.category}". Run investigate_category first. Available: ${getAllCachedKeys().join(', ')}`);
          toolResult = { matrix: cached.strictMatrix, severity: cached.strictSeverityScores, decision: cached.finalDecision };
        } else if (name === 'export_sourcing_brief') {
          const cached = getCachedResult((args.category || '').trim().toLowerCase());
          if (!cached) throw new Error(`No data for "${args.category}". Run investigate_category first.`);
          toolResult = args.format === 'json' ? generateSourcingJSON(cached) : generateSourcingBriefText(cached);
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

app.listen(PORT, () => {
  console.log(`🚀 Ratina.ai — Amazon Product Intelligence API & MCP Server`);
  console.log(`   HTTP API:  http://localhost:${PORT}/api/investigate`);
  console.log(`   MCP HTTP:  http://localhost:${PORT}/api/mcp`);
  console.log(`   MCP stdio: node server/mcpServer.js`);
  console.log(`   Cache:     ${getCacheStats().cachedCategories} categories pre-loaded`);
  console.log(`📊 Sprint budget: $${SPRINT_BUDGET_MAX.toFixed(2)} max additional spend`);
});
