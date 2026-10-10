/**
 * Pick the post writer named in the config. This is the only place that knows
 * which AI providers exist — add a new provider here and in config.js.
 */

import { createClaudePostWriter } from './claudePostWriter.js';
import { createOpenRouterPostWriter } from './openRouterPostWriter.js';

const WRITER_FACTORIES_BY_PROVIDER = {
  anthropic: createClaudePostWriter,
  openrouter: createOpenRouterPostWriter,
};

/**
 * @param {import('../config.js').PipelineConfig} config
 * @param {{ fetchImplementation?: typeof fetch }} [overrides] - For tests.
 */
export function createPostWriter(config, overrides = {}) {
  const createWriter = WRITER_FACTORIES_BY_PROVIDER[config.writer.provider];
  return createWriter({
    apiKey: config.writer.apiKey,
    model: config.writer.model,
    industry: config.industry,
    location: config.location,
    ...overrides,
  });
}
