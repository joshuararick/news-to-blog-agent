/**
 * Configuration: read settings from environment variables and command-line
 * flags, validate them once, and hand the rest of the program a frozen object.
 *
 * Validating up front means a typo in a setting fails in the first second
 * with a clear message — not halfway through a run after spending API credits.
 */

import { ConfigurationError } from './support/errors.js';

export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
export const DEFAULT_MAXIMUM_POSTS_PER_RUN = 3;
export const DEFAULT_NEWS_LOOKBACK_DAYS = 7;
export const DEFAULT_PAYLOAD_COLLECTION = 'posts';
export const DEFAULT_SEEN_STORIES_FILE = '.seen-stories.json';

/**
 * @typedef {object} PipelineConfig
 * @property {string} industry - e.g. "HVAC"
 * @property {string} location - e.g. "Greenville SC"
 * @property {number} maximumPostsPerRun - Upper bound on posts written per run.
 * @property {number} newsLookbackDays - Only consider news from the last N days.
 * @property {boolean} isDryRun - Print posts instead of saving them to the CMS.
 * @property {boolean} isVerbose - Show debug log lines.
 * @property {string} seenStoriesFilePath - Where already-posted links are remembered.
 * @property {{ apiKey: string, model: string }} claude
 * @property {{ baseUrl: string, apiKey: string, collection: string } | null} payload
 *           - Null during a dry run, when no CMS is needed.
 */

/**
 * Parse command-line arguments of the form `--name value` and `--flag`.
 * @param {string[]} commandLineArguments - Usually `process.argv.slice(2)`.
 * @returns {Record<string, string | boolean>}
 */
export function parseCommandLineArguments(commandLineArguments) {
  const parsedArguments = {};

  for (let index = 0; index < commandLineArguments.length; index++) {
    const argument = commandLineArguments[index];
    if (!argument.startsWith('--')) {
      throw new ConfigurationError(`Unexpected argument "${argument}". Options look like --industry HVAC`);
    }

    const optionName = argument.slice(2);
    const nextArgument = commandLineArguments[index + 1];
    const optionHasValue = nextArgument !== undefined && !nextArgument.startsWith('--');

    parsedArguments[optionName] = optionHasValue ? nextArgument : true;
    if (optionHasValue) index++;
  }

  return parsedArguments;
}

/**
 * @param {string | undefined} rawValue
 * @param {string} settingName - Used in the error message.
 * @param {number} defaultValue
 * @returns {number}
 */
function readPositiveInteger(rawValue, settingName, defaultValue) {
  if (rawValue === undefined || rawValue === '') return defaultValue;

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new ConfigurationError(`${settingName} must be a whole number of 1 or more (got "${rawValue}")`);
  }
  return parsedValue;
}

/**
 * @param {Record<string, string | undefined>} environment
 * @param {string} variableName
 * @returns {string}
 */
function requireEnvironmentVariable(environment, variableName) {
  const value = environment[variableName]?.trim();
  if (!value) {
    throw new ConfigurationError(`Missing ${variableName}. Add it to your environment or .env file (see .env.example).`);
  }
  return value;
}

/**
 * Build the validated configuration for one pipeline run.
 * Command-line flags win over environment variables, which win over defaults.
 *
 * @param {object} sources
 * @param {Record<string, string | undefined>} sources.environment - Usually `process.env`.
 * @param {string[]} sources.commandLineArguments - Usually `process.argv.slice(2)`.
 * @returns {Readonly<PipelineConfig>}
 * @throws {ConfigurationError}
 */
export function loadConfig({ environment, commandLineArguments }) {
  const flags = parseCommandLineArguments(commandLineArguments);
  const isDryRun = flags['dry-run'] === true;

  const industry = String(flags.industry ?? environment.NEWS_INDUSTRY ?? '').trim();
  const location = String(flags.location ?? environment.NEWS_LOCATION ?? '').trim();
  if (!industry || !location) {
    throw new ConfigurationError('Tell me what to write about: --industry "HVAC" --location "Greenville SC" (or NEWS_INDUSTRY / NEWS_LOCATION)');
  }

  const payloadSettings = isDryRun ? null : {
    baseUrl: requireEnvironmentVariable(environment, 'PAYLOAD_URL').replace(/\/+$/, ''),
    apiKey: requireEnvironmentVariable(environment, 'PAYLOAD_API_KEY'),
    collection: environment.PAYLOAD_COLLECTION?.trim() || DEFAULT_PAYLOAD_COLLECTION,
  };

  return Object.freeze({
    industry,
    location,
    maximumPostsPerRun: readPositiveInteger(
      flags['max-posts'] ?? environment.MAX_POSTS_PER_RUN, 'max-posts', DEFAULT_MAXIMUM_POSTS_PER_RUN),
    newsLookbackDays: readPositiveInteger(
      flags['lookback-days'] ?? environment.NEWS_LOOKBACK_DAYS, 'lookback-days', DEFAULT_NEWS_LOOKBACK_DAYS),
    isDryRun,
    isVerbose: flags.verbose === true,
    seenStoriesFilePath: environment.SEEN_STORIES_FILE?.trim() || DEFAULT_SEEN_STORIES_FILE,
    claude: Object.freeze({
      apiKey: requireEnvironmentVariable(environment, 'ANTHROPIC_API_KEY'),
      model: environment.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
    }),
    payload: payloadSettings && Object.freeze(payloadSettings),
  });
}
