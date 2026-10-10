#!/usr/bin/env node
/**
 * Command-line entry point. This is the only file that touches the real
 * world's "globals" (process.env, argv, exit codes); everything else gets
 * what it needs passed in.
 *
 *   node src/cli.js --industry "HVAC" --location "Greenville SC" --dry-run
 *
 * Exit codes: 0 = all good, 1 = could not run at all, 2 = ran but some posts failed.
 */

import { loadConfig } from './config.js';
import { createConsoleLogger } from './support/logger.js';
import { createGoogleNewsSource } from './sources/googleNewsSource.js';
import { createClaudePostWriter } from './writers/claudePostWriter.js';
import { createPayloadDraftPublisher } from './publishers/payloadDraftPublisher.js';
import { createConsolePublisher } from './publishers/consolePublisher.js';
import { openSeenStoryStore } from './state/seenStoryStore.js';
import { runNewsToBlogPipeline } from './pipeline.js';

const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_FATAL_ERROR = 1;
const EXIT_CODE_PARTIAL_FAILURE = 2;

async function main() {
  const config = loadConfig({ environment: process.env, commandLineArguments: process.argv.slice(2) });
  const logger = createConsoleLogger({ verbose: config.isVerbose });

  const publisher = config.isDryRun
    ? createConsolePublisher()
    : createPayloadDraftPublisher(config.payload);

  const summary = await runNewsToBlogPipeline({
    config,
    newsSource: createGoogleNewsSource(),
    postWriter: createClaudePostWriter({
      apiKey: config.claude.apiKey,
      model: config.claude.model,
      industry: config.industry,
      location: config.location,
    }),
    publisher,
    seenStoryStore: await openSeenStoryStore(config.seenStoriesFilePath),
    logger,
  });

  return summary.postsFailed.length > 0 ? EXIT_CODE_PARTIAL_FAILURE : EXIT_CODE_SUCCESS;
}

main()
  .then(exitCode => { process.exitCode = exitCode; })
  .catch(error => {
    console.error(`✘ ${error.name ?? 'Error'}: ${error.message}`);
    process.exitCode = EXIT_CODE_FATAL_ERROR;
  });
