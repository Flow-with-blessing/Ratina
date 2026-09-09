/**
 * Ratina.ai MCP (Model Context Protocol) Server
 * 
 * Implements the official MCP specification (JSON-RPC 2.0 over stdio)
 * so any AI agent (Claude Desktop, Cursor, Claude Code) can use Ratina
 * as a tool for Amazon product failure intelligence.
 * 
 * Tools exposed:
 *   1. investigate_category  — Run a full live investigation on any Amazon category
 *   2. get_failure_matrix    — Get the cross-competitor failure matrix for a category
 *   3. export_sourcing_brief — Generate a plain-text sourcing brief
 * 
 * Usage:
 *   node server/mcpServer.js
 *   (communicates over stdin/stdout using JSON-RPC 2.0)
 */

// MUST be first: reroutes console output to stderr before any imported
// module can write to stdout, which is the JSON-RPC transport here.
import './stdioSafeConsole.js';

import { runInvestigation } from './investigationEngine.js';
import { generateSourcingBriefText, generateSourcingJSON } from './exportService.js';
import { getCachedResult, setCachedResult, getAllCachedKeys } from './cache.js';
import { verifyInvestigationReceipt, verifyChain, getKeyId } from './receiptService.js';
import dotenv from 'dotenv';
import { createInterface } from 'readline';

dotenv.config();

// ─── MCP TOOL DEFINITIONS ─────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: 'investigate_category',
    description: 
      'Investigate an Amazon product category for failure patterns. ' +
      'Dynamically discovers top competitors via live Amazon search, scrapes real customer reviews via Monid, ' +
      'builds a cross-competitor failure matrix, calculates severity scores and an opportunity score, ' +
      'and returns a go/no-go sourcing decision with full evidence traceability. ' +
      'Cost: ~$0.018 per fresh run via Monid pay-per-call. Cached results are free ($0.00).',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'The product category to investigate (e.g., "Portable Blenders", "French Press Coffee Makers", "Electric Kettles")'
        },
        search_query: {
          type: 'string',
          description: 'Optional custom Amazon search query. Defaults to the category name if not provided.'
        },
        force_fresh: {
          type: 'boolean',
          description: 'If true, bypasses cache and runs a fresh live Monid investigation (costs ~$0.018). Default: false (uses cache if available).'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'get_failure_matrix',
    description: 
      'Get the cross-competitor failure matrix for a previously investigated category. ' +
      'Returns the failure counts per competitor, severity scores, opportunity score, and sourcing decision. ' +
      'If the category has not been investigated yet, returns an error suggesting to run investigate_category first. ' +
      'Cost: $0.00 (reads from cache only).',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'The product category to get the failure matrix for'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'export_sourcing_brief',
    description: 
      'Generate a formatted plain-text sourcing brief for a previously investigated category. ' +
      'The brief includes: sourcing decision, priority failure modes with engineering/QA requirements, ' +
      'competitor summary with live pricing, data limitations, and Monid cost receipt. ' +
      'Ready to share with a supplier or sourcing agent. ' +
      'Cost: $0.00 (reads from cache only).',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'The product category to generate the sourcing brief for'
        },
        format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Output format. "text" = human-readable plain text brief. "json" = structured JSON. Default: "text".'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'verify_receipt',
    description:
      'Cryptographically verify an exported Ratina investigation against its signed receipt. ' +
      'Recomputes the SHA-256 content hash, the Merkle root over every Monid data call, and the ' +
      'HMAC-SHA256 signature. Returns valid:false and names the exact failed check if any figure ' +
      'in the report was altered after issuance. Cost: $0.00.',
    inputSchema: {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          description: 'The exported investigation JSON, including its `verification` block'
        }
      },
      required: ['payload']
    }
  }
];

// ─── MCP PROTOCOL IMPLEMENTATION (JSON-RPC 2.0 over stdio) ────────────────────

const SERVER_INFO = {
  name: 'ratina-ai',
  version: '1.0.0'
};

const SERVER_CAPABILITIES = {
  tools: {}
};

/**
 * Handle an MCP JSON-RPC request and return a response.
 */
async function handleMCPRequest(request) {
  const { method, params, id } = request;

  switch (method) {
    // ── Lifecycle ──
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO
        }
      };

    case 'notifications/initialized':
      // Client acknowledgment — no response needed
      return null;

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    // ── Tool Discovery ──
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: MCP_TOOLS }
      };

    // ── Tool Execution ──
    case 'tools/call':
      return await handleToolCall(id, params);

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      };
  }
}

/**
 * Route a tools/call request to the appropriate handler.
 */
async function handleToolCall(id, params) {
  const { name, arguments: args } = params;

  try {
    let result;

    switch (name) {
      case 'investigate_category':
        result = await toolInvestigateCategory(args);
        break;
      case 'get_failure_matrix':
        result = await toolGetFailureMatrix(args);
        break;
      case 'export_sourcing_brief':
        result = await toolExportSourcingBrief(args);
        break;
      case 'verify_receipt':
        result = await toolVerifyReceipt(args);
        break;
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      }
    };

  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      }
    };
  }
}

// ─── TOOL IMPLEMENTATIONS ──────────────────────────────────────────────────────

/**
 * Tool: investigate_category
 * Runs a full live Monid investigation or returns cached results.
 */
async function toolInvestigateCategory(args) {
  const { category, search_query, force_fresh } = args;

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    throw new Error('Missing required parameter: category');
  }

  const cacheKey = category.trim().toLowerCase();

  // Check cache first (unless force_fresh)
  if (!force_fresh) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return {
        source: 'CACHE',
        cost: '$0.00',
        cached_at: cached._cachedAt,
        message: `Returning cached investigation for "${category}". Use force_fresh=true to run a new live investigation (~$0.018 via Monid).`,
        data: {
          category: cached.category,
          decision: cached.finalDecision,
          opportunityScore: cached.productOpportunityScore,
          competitorCount: (cached.strictCompetitorSummary || []).length,
          failureModeCount: (cached.strictSeverityScores || []).filter(s => s.totalObservedMentions > 0).length,
          topFailureMode: (cached.strictSeverityScores || [])[0]?.failureMode || 'N/A',
          monidReceipt: cached.monidReceipt
        }
      };
    }
  }

  // Run live investigation
  const result = await runInvestigation({
    category: category.trim(),
    searchQuery: search_query || undefined
  });

  if (!result.success) {
    throw new Error(result.error || 'Investigation failed');
  }

  const data = result.data;

  // Cache the result
  setCachedResult(cacheKey, data);

  // Build summary response
  const severity = data.strictSeverityScores || [];
  const activeFailures = severity.filter(s => s.totalObservedMentions > 0);
  const competitors = data.strictCompetitorSummary || [];

  return {
    source: 'LIVE_MONID_EXECUTION',
    cost: data.monidReceipt?.totalMonidCostUSD || 'N/A',
    message: `Live investigation complete for "${category}". ${competitors.length} competitors analyzed, ${activeFailures.length} failure modes detected.`,
    data: {
      category: data.category,
      decision: data.finalDecision,
      opportunityScore: data.productOpportunityScore,
      competitors: competitors.map(c => ({
        name: c.name,
        asin: c.asin,
        price: c.livePrice,
        rating: c.liveRating,
        reviewsAnalyzed: c.reviewsRetrieved,
        failureCounts: c.failureCounts
      })),
      severityRanking: activeFailures.map(s => ({
        failureMode: s.failureMode,
        severityScore: s.severityScore,
        tier: s.severityTier,
        totalMentions: s.totalObservedMentions,
        isSafetyHazard: s.isSafetyHazard
      })),
      sourcingSpecs: data.strictSourcingSpecs,
      monidReceipt: data.monidReceipt,
      executionMetadata: data.executionMetadata
    }
  };
}

/**
 * Tool: get_failure_matrix
 * Returns the cached failure matrix for a previously investigated category.
 */
async function toolGetFailureMatrix(args) {
  const { category } = args;

  if (!category || typeof category !== 'string') {
    throw new Error('Missing required parameter: category');
  }

  const cacheKey = category.trim().toLowerCase();
  const cached = getCachedResult(cacheKey);

  if (!cached) {
    const available = getAllCachedKeys();
    throw new Error(
      `No investigation data found for "${category}". ` +
      `Run investigate_category first. ` +
      (available.length > 0
        ? `Available cached categories: ${available.join(', ')}`
        : 'No cached investigations available.')
    );
  }

  return {
    category: cached.category,
    matrix: cached.strictMatrix,
    severityScores: (cached.strictSeverityScores || []).map(s => ({
      failureMode: s.failureMode,
      severityScore: s.severityScore,
      tier: s.severityTier,
      totalMentions: s.totalObservedMentions,
      isSafetyHazard: s.isSafetyHazard,
      evidenceBasis: s.evidenceBasis
    })),
    opportunityScore: cached.productOpportunityScore,
    decision: cached.finalDecision?.decision,
    evidenceConfidence: cached.finalDecision?.evidenceConfidence,
    dataLimitations: cached.dataLimitations,
    competitorCount: (cached.strictCompetitorSummary || []).length,
    cached_at: cached._cachedAt
  };
}

/**
 * Tool: export_sourcing_brief
 * Generates a formatted sourcing brief from cached investigation data.
 */
async function toolExportSourcingBrief(args) {
  const { category, format } = args;

  if (!category || typeof category !== 'string') {
    throw new Error('Missing required parameter: category');
  }

  const cacheKey = category.trim().toLowerCase();
  const cached = getCachedResult(cacheKey);

  if (!cached) {
    const available = getAllCachedKeys();
    throw new Error(
      `No investigation data found for "${category}". ` +
      `Run investigate_category first. ` +
      (available.length > 0
        ? `Available cached categories: ${available.join(', ')}`
        : 'No cached investigations available.')
    );
  }

  if (format === 'json') {
    return generateSourcingJSON(cached);
  }

  // Default: plain text brief
  return generateSourcingBriefText(cached);
}

/**
 * Tool: verify_receipt
 * Verifies an exported investigation against its signed cryptographic receipt.
 */
async function toolVerifyReceipt(args) {
  const raw = args?.payload;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Missing required parameter: payload (the exported investigation JSON)');
  }

  // Accept the raw payload or the /api/export/json wrapper.
  const target = raw.verification ? raw : (raw.data?.verification ? raw.data : raw);
  const result = verifyInvestigationReceipt(target);

  return {
    verified: result.valid,
    verdict: result.valid
      ? 'AUTHENTIC — receipt matches this exact analysis'
      : 'TAMPERED OR INVALID',
    reason: result.reason,
    failedCheck: result.failedCheck,
    runId: result.runId,
    signingKeyId: result.keyId,
    issuedAt: result.issuedAt,
    checks: result.checks,
    chainStatus: verifyChain(),
    verifierKeyId: getKeyId()
  };
}

// ─── STDIO TRANSPORT ───────────────────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await handleMCPRequest(request);

    // Notifications don't get responses
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (parseError) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: parseError.message
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

rl.on('close', () => {
  process.exit(0);
});

// Suppress unhandled errors from crashing the stdio server
process.on('uncaughtException', (err) => {
  process.stderr.write(`[Ratina MCP] Uncaught exception: ${err.message}\n`);
});

process.on('unhandledRejection', (err) => {
  process.stderr.write(`[Ratina MCP] Unhandled rejection: ${err}\n`);
});

process.stderr.write('[Ratina MCP] Server started. Listening on stdio.\n');
