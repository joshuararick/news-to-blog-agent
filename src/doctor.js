#!/usr/bin/env node
/**
 * `npm run doctor`: check that everything is in place BEFORE a real run.
 *
 * Each check prints ✔ or ✘ with a plain-language fix, so a first-time setup
 * problem ("wrong model name", "missing key", "site blocked") shows up in
 * seconds instead of as a confusing failure halfway through a run.
 *
 * Nothing here costs money: no AI text is generated and nothing is posted.
 */

import { loadConfig } from './config.js';
import { buildGoogleNewsFeedUrl, parseRssFeed } from './sources/googleNewsSource.js';

const MINIMUM_NODE_VERSION = [22, 9];
const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const NETWORK_TIMEOUT_MILLISECONDS = 15_000;

/**
 * @typedef {object} CheckResult
 * @property {string} name - What was checked.
 * @property {boolean} passed
 * @property {string} detail - What was found, or how to fix it.
 */

/** @param {string} versionText e.g. "v22.9.1" */
export function isNodeVersionSupported(versionText) {
  const [major, minor] = versionText.replace(/^v/, '').split('.').map(Number);
  const [requiredMajor, requiredMinor] = MINIMUM_NODE_VERSION;
  return major > requiredMajor || (major === requiredMajor && minor >= requiredMinor);
}

/** @returns {CheckResult} */
export function checkNodeVersion(versionText = process.version) {
  const passed = isNodeVersionSupported(versionText);
  return {
    name: 'Node.js version',
    passed,
    detail: passed
      ? `${versionText} is supported`
      : `${versionText} is too old. Install Node ${MINIMUM_NODE_VERSION.join('.')} or newer from https://nodejs.org`,
  };
}

/**
 * Settings are checked as if for a dry run, so the CMS is optional here.
 * @returns {{ result: CheckResult, config: import('./config.js').PipelineConfig | null }}
 */
export function checkSettings(environment, commandLineArguments) {
  try {
    const config = loadConfig({ environment, commandLineArguments: [...commandLineArguments, '--dry-run'] });
    const hasCms = Boolean(environment.PAYLOAD_URL && environment.PAYLOAD_API_KEY);
    return {
      config,
      result: {
        name: 'Settings (.env)',
        passed: true,
        detail: `${config.industry} in ${config.location}, AI: ${config.writer.provider} (${config.writer.model})` +
          (hasCms ? '' : '. No CMS set yet, so only `npm run preview` will work'),
      },
    };
  } catch (error) {
    return { config: null, result: { name: 'Settings (.env)', passed: false, detail: error.message } };
  }
}

/** fetch with a time limit, so a blocked site fails fast instead of hanging. */
async function fetchWithTimeout(fetchImplementation, url, options = {}) {
  return fetchImplementation(url, { ...options, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MILLISECONDS) });
}

/** @returns {Promise<CheckResult>} */
export async function checkNewsSource(config, fetchImplementation = fetch) {
  const name = 'Google News reachable';
  try {
    const response = await fetchWithTimeout(fetchImplementation, buildGoogleNewsFeedUrl({
      industry: config.industry, location: config.location, lookbackDays: config.newsLookbackDays,
    }));
    if (!response.ok) return { name, passed: false, detail: `Google News answered HTTP ${response.status}` };

    const storyCount = parseRssFeed(await response.text()).length;
    return {
      name,
      passed: true,
      detail: storyCount > 0
        ? `${storyCount} recent stories found`
        : 'Reachable, but no stories this week. Try a broader --industry or --location',
    };
  } catch (error) {
    return { name, passed: false, detail: `Could not reach news.google.com (${error.cause?.code ?? error.message}). Check your internet or firewall` };
  }
}

/**
 * For OpenRouter, confirm the chosen model name exists (the most common
 * setup mistake). For Anthropic, confirm the API is reachable.
 * @returns {Promise<CheckResult>}
 */
export async function checkAiProvider(config, fetchImplementation = fetch) {
  if (config.writer.provider === 'openrouter') {
    const name = 'OpenRouter model';
    try {
      const response = await fetchWithTimeout(fetchImplementation, OPENROUTER_MODELS_ENDPOINT);
      if (!response.ok) return { name, passed: false, detail: `OpenRouter answered HTTP ${response.status}` };

      const availableModelIds = new Set(((await response.json()).data ?? []).map(model => model.id));
      const modelExists = availableModelIds.has(config.writer.model);
      return {
        name,
        passed: modelExists,
        detail: modelExists
          ? `"${config.writer.model}" exists`
          : `"${config.writer.model}" is not an OpenRouter model. Copy an exact id from https://openrouter.ai/models`,
      };
    } catch (error) {
      return { name, passed: false, detail: `Could not reach openrouter.ai (${error.cause?.code ?? error.message})` };
    }
  }

  const name = 'Anthropic API reachable';
  try {
    // A GET to the messages endpoint is refused (405), which still proves the API is reachable.
    await fetchWithTimeout(fetchImplementation, 'https://api.anthropic.com/v1/messages');
    return { name, passed: true, detail: 'api.anthropic.com answered' };
  } catch (error) {
    return { name, passed: false, detail: `Could not reach api.anthropic.com (${error.cause?.code ?? error.message})` };
  }
}

/**
 * Run every check in order; network checks only run when settings are valid.
 * @returns {Promise<CheckResult[]>}
 */
export async function runAllChecks({ environment, commandLineArguments, nodeVersion, fetchImplementation = fetch }) {
  const results = [checkNodeVersion(nodeVersion)];
  const { result: settingsResult, config } = checkSettings(environment, commandLineArguments);
  results.push(settingsResult);

  if (config) {
    results.push(await checkNewsSource(config, fetchImplementation));
    results.push(await checkAiProvider(config, fetchImplementation));
  }
  return results;
}

async function main() {
  const results = await runAllChecks({
    environment: process.env,
    commandLineArguments: process.argv.slice(2),
    nodeVersion: process.version,
  });

  console.log('\nNews-to-Blog setup check\n');
  for (const { name, passed, detail } of results) {
    console.log(`${passed ? '✔' : '✘'} ${name}: ${detail}`);
  }

  const allPassed = results.every(result => result.passed);
  console.log(allPassed
    ? '\nAll good. Next: npm run preview\n'
    : '\nFix the ✘ items above, then run npm run doctor again.\n');
  process.exitCode = allPassed ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
