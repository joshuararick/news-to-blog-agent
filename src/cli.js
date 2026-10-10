#!/usr/bin/env node
/**
 * Command-line entry point. This is the only file that touches the real
 * world's "globals" (process.env, argv, exit codes); everything else gets
 * what it needs passed in.
 *
 *   node src/cli.js --industry "HVAC" --location "Greenville SC" --dry-run
 *
 * Exit codes: 0 = all good, 1 = could not run at all, 2 = ran but some posts failed.
 * When ALERT_WEBHOOK_URL is set, exit codes 1 and 2 also send an alert.
 */

import { loadConfig } from './config.js';
import { createConsoleLogger } from './support/logger.js';
import { sendFailureAlert, describeFatalFailure, describePartialFailure } from './support/failureAlert.js';
import { createGoogleNewsSource } from './sources/googleNewsSource.js';
import { createPostWriter } from './writers/createPostWriter.js';
import { createPayloadDraftPublisher } from './publishers/payloadDraftPublisher.js';
import { createConsolePublisher } from './publishers/consolePublisher.js';
import { openSeenStoryStore } from './state/seenStoryStore.js';
import { runNewsToBlogPipeline } from './pipeline.js';

const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_FATAL_ERROR = 1;
const EXIT_CODE_PARTIAL_FAILURE = 2;

/**
 * @param {import('./config.js').PipelineConfig} config
 * @param {import('./support/logger.js').Logger} logger
 * @returns {Promise<number>} Exit code.
 */
async function runOnce(config, logger) {
  const publisher = config.isDryRun
    ? createConsolePublisher()
    : createPayloadDraftPublisher(config.payload);

  const summary = await runNewsToBlogPipeline({
    config,
    newsSource: createGoogleNewsSource(),
    postWriter: createPostWriter(config),
    publisher,
    seenStoryStore: await openSeenStoryStore(config.seenStoriesFilePath),
    logger,
  });

  if (summary.postsFailed.length === 0) {
    return EXIT_CODE_SUCCESS;
  }

  await sendFailureAlert({
    webhookUrl: config.alertWebhookUrl,
    message: describePartialFailure(summary, config),
    logger,
  });
  return EXIT_CODE_PARTIAL_FAILURE;
}

async function main() {
  // Config errors are reported on screen only: without valid config there is
  // no trustworthy alert destination yet, and they surface the first time a
  // person sets the tool up.
  let config;
  try {
    config = loadConfig({ environment: process.env, commandLineArguments: process.argv.slice(2) });
  } catch (error) {
    console.error(`✘ ${error.name ?? 'Error'}: ${error.message}`);
    return EXIT_CODE_FATAL_ERROR;
  }

  const logger = createConsoleLogger({ verbose: config.isVerbose });
  try {
    return await runOnce(config, logger);
  } catch (error) {
    logger.error(`${error.name ?? 'Error'}: ${error.message}`);
    await sendFailureAlert({ webhookUrl: config.alertWebhookUrl, message: describeFatalFailure(error), logger });
    return EXIT_CODE_FATAL_ERROR;
  }
}

main().then(exitCode => { process.exitCode = exitCode; });
