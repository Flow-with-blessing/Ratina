/**
 * Ratina.ai Stage Schema Validation
 *
 * Every stage of the intelligence pipeline validates its output against a
 * declared schema before the next stage is allowed to consume it. A stage
 * that produces malformed or out-of-range data fails loudly instead of
 * silently propagating bad numbers into a sourcing decision.
 *
 * Dependency-free by design: no runtime validation library is pulled in, so
 * the deploy surface stays minimal and the rules are auditable in one file.
 */

// ─── VALIDATOR PRIMITIVES ─────────────────────────────────────────────────────

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Field rule shape:
 *   { type, required, min, max, of, allowNull, enum, each }
 */
function validateField(path, value, rule, errors) {
  const present = value !== undefined && value !== null;

  if (!present) {
    if (rule.required) {
      errors.push(`${path}: required field is ${value === undefined ? 'missing' : 'null'}`);
    }
    return;
  }

  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${typeof value}`);
      } else if (rule.nonEmpty && value.trim().length === 0) {
        errors.push(`${path}: string must not be empty`);
      } else if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${path}: "${value}" is not one of [${rule.enum.join(', ')}]`);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected finite number, got ${JSON.stringify(value)}`);
      } else {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`${path}: ${value} is below minimum ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`${path}: ${value} exceeds maximum ${rule.max}`);
        }
        if (rule.integer && !Number.isInteger(value)) {
          errors.push(`${path}: expected integer, got ${value}`);
        }
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: expected boolean, got ${typeof value}`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
      } else {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(`${path}: expected at least ${rule.minLength} item(s), got ${value.length}`);
        }
        if (rule.each) {
          value.forEach((item, i) => {
            if (rule.each.type === 'object' && rule.each.fields) {
              validateShape(`${path}[${i}]`, item, rule.each.fields, errors);
            } else {
              validateField(`${path}[${i}]`, item, rule.each, errors);
            }
          });
        }
      }
      break;

    case 'object':
      if (!isPlainObject(value)) {
        errors.push(`${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      } else if (rule.fields) {
        validateShape(path, value, rule.fields, errors);
      }
      break;

    default:
      // Unknown type descriptor — treat as pass-through.
      break;
  }
}

function validateShape(basePath, obj, fields, errors) {
  if (!isPlainObject(obj)) {
    errors.push(`${basePath}: expected object, got ${Array.isArray(obj) ? 'array' : typeof obj}`);
    return;
  }
  for (const [key, rule] of Object.entries(fields)) {
    validateField(`${basePath}.${key}`, obj[key], rule, errors);
  }
}

// ─── STAGE SCHEMAS ────────────────────────────────────────────────────────────

export const STAGE_SCHEMAS = {
  DISCOVERY: {
    description: 'Amazon candidate discovery via Monid search',
    fields: {
      totalFound: { type: 'number', required: true, min: 0, integer: true },
      candidates: {
        type: 'array',
        required: true,
        minLength: 1,
        each: {
          type: 'object',
          fields: {
            asin: { type: 'string', required: true, nonEmpty: true },
            title: { type: 'string', required: true }
          }
        }
      }
    }
  },

  SELECTION: {
    description: 'Competitor selection from discovered candidates',
    fields: {
      selected: {
        type: 'array',
        required: true,
        minLength: 1,
        each: {
          type: 'object',
          fields: {
            asin: { type: 'string', required: true, nonEmpty: true },
            competitorScore: { type: 'number', required: true, min: 0 }
          }
        }
      },
      selectionCriteria: { type: 'array', required: true }
    }
  },

  ENRICHMENT: {
    description: 'Per-competitor review + product data retrieval',
    fields: {
      asin: { type: 'string', required: true, nonEmpty: true },
      reviewsRetrieved: { type: 'number', required: true, min: 0, integer: true },
      dataQualityStatus: { type: 'string', required: true, nonEmpty: true },
      failureAnalysis: { type: 'object', required: true }
    }
  },

  FAILURE_MATRIX: {
    description: 'Cross-competitor failure matrix rows',
    fields: {
      failureMode: { type: 'string', required: true, nonEmpty: true },
      failureModeId: { type: 'string', required: true, nonEmpty: true },
      totalObservedMentions: { type: 'number', required: true, min: 0, integer: true },
      weightedMentions: { type: 'number', required: true, min: 0 },
      countsPerProduct: { type: 'object', required: true },
      isSafetyHazard: { type: 'boolean', required: true }
    }
  },

  SEVERITY: {
    description: 'Evidence-weighted severity scoring',
    fields: {
      failureMode: { type: 'string', required: true, nonEmpty: true },
      severityScore: { type: 'number', required: true, min: 0, max: 100 },
      severityTier: {
        type: 'string',
        required: true,
        enum: ['CRITICAL (P0)', 'HIGH (P1)', 'MEDIUM (P2)', 'LOW']
      },
      totalObservedMentions: { type: 'number', required: true, min: 0, integer: true },
      isSafetyHazard: { type: 'boolean', required: true },
      evidenceBasis: { type: 'string', required: true, nonEmpty: true }
    }
  },

  OPPORTUNITY: {
    description: 'Product opportunity score',
    fields: {
      score: { type: 'number', required: true, min: 0, max: 100 },
      maxScore: { type: 'number', required: true, min: 1 },
      formula: { type: 'string', required: true, nonEmpty: true },
      interpretation: { type: 'string', required: true, nonEmpty: true }
    }
  },

  SOURCING_SPEC: {
    description: 'Generated sourcing / BOM specification',
    fields: {
      priority: {
        type: 'string',
        required: true,
        enum: ['P0 (CRITICAL)', 'P1 (HIGH)', 'P2 (MEDIUM)']
      },
      failureMode: { type: 'string', required: true, nonEmpty: true },
      evidenceObserved: { type: 'string', required: true, nonEmpty: true },
      engineeringRequirement: { type: 'string', required: true, nonEmpty: true },
      qaRequirement: { type: 'string', required: true, nonEmpty: true }
    }
  },

  DECISION: {
    description: 'Final go/no-go sourcing decision',
    fields: {
      decision: { type: 'string', required: true, nonEmpty: true },
      evidenceConfidence: {
        type: 'string',
        required: true,
        enum: ['HIGH', 'MODERATE', 'LOW']
      },
      confidenceExplanation: { type: 'string', required: true, nonEmpty: true },
      nextStepAction: { type: 'string', required: true, nonEmpty: true }
    }
  },

  FINAL_PAYLOAD: {
    description: 'Complete investigation payload returned to callers',
    fields: {
      category: { type: 'string', required: true, nonEmpty: true },
      timestamp: { type: 'string', required: true, nonEmpty: true },
      strictCompetitorSummary: { type: 'array', required: true },
      strictMatrix: { type: 'array', required: true },
      strictSeverityScores: { type: 'array', required: true },
      productOpportunityScore: { type: 'object', required: true },
      finalDecision: { type: 'object', required: true },
      monidReceipt: { type: 'object', required: true },
      executionMetadata: { type: 'object', required: true }
    }
  }
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Validate a single object against a named stage schema.
 * @returns {{ stage, valid, errors, checkedAt, description }}
 */
export function validateStage(stageName, data) {
  const schema = STAGE_SCHEMAS[stageName];
  if (!schema) {
    return {
      stage: stageName,
      valid: false,
      errors: [`Unknown stage schema: ${stageName}`],
      checkedAt: new Date().toISOString()
    };
  }

  const errors = [];
  validateShape(stageName, data, schema.fields, errors);

  return {
    stage: stageName,
    description: schema.description,
    valid: errors.length === 0,
    errors,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Validate every item in a collection against a stage schema.
 * Reports the item index for any failure so bad rows are traceable.
 */
export function validateStageCollection(stageName, items) {
  const schema = STAGE_SCHEMAS[stageName];
  if (!schema) {
    return { stage: stageName, valid: false, errors: [`Unknown stage schema: ${stageName}`], itemsChecked: 0 };
  }

  const errors = [];
  const list = Array.isArray(items) ? items : [];

  list.forEach((item, i) => {
    const itemErrors = [];
    validateShape(`${stageName}[${i}]`, item, schema.fields, itemErrors);
    errors.push(...itemErrors);
  });

  return {
    stage: stageName,
    description: schema.description,
    valid: errors.length === 0,
    itemsChecked: list.length,
    errors,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Accumulates validation results across a pipeline run so the final payload
 * can carry a complete, auditable validation trail.
 */
export function createValidationLog() {
  const stages = [];

  return {
    record(result) {
      stages.push(result);
      if (!result.valid) {
        console.warn(
          `[Ratina Schema] Stage ${result.stage} failed validation: ${result.errors.slice(0, 3).join(' | ')}`
        );
      }
      return result;
    },

    /** Throws when a stage the pipeline cannot recover from is invalid. */
    assert(result) {
      stages.push(result);
      if (!result.valid) {
        const err = new Error(
          `Schema validation failed at stage ${result.stage}: ${result.errors.slice(0, 5).join(' | ')}`
        );
        err.stage = result.stage;
        err.validationErrors = result.errors;
        throw err;
      }
      return result;
    },

    summary() {
      const failed = stages.filter(s => !s.valid);
      return {
        schemaVersion: 'ratina-stage-schemas-v1',
        stagesValidated: stages.length,
        allPassed: failed.length === 0,
        failedStages: failed.map(f => ({ stage: f.stage, errors: f.errors.slice(0, 10) })),
        stages: stages.map(s => ({
          stage: s.stage,
          valid: s.valid,
          itemsChecked: s.itemsChecked ?? 1,
          errorCount: s.errors.length
        }))
      };
    }
  };
}
