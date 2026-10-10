import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNodeVersionSupported, checkSettings, checkNewsSource, checkAiProvider, runAllChecks } from '../src/doctor.js';
import { SAMPLE_RSS_FEED, makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const OPENROUTER_ENVIRONMENT = {
  NEWS_INDUSTRY: 'HVAC', NEWS_LOCATION: 'Greenville SC',
  AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or-key', OPENROUTER_MODEL: 'vendor/model-x',
};
const MODELS_LIST = { data: [{ id: 'vendor/model-x' }, { id: 'vendor/model-y' }] };

test('node version check', () => {
  assert.equal(isNodeVersionSupported('v22.9.0'), true);
  assert.equal(isNodeVersionSupported('v23.0.0'), true);
  assert.equal(isNodeVersionSupported('v22.8.9'), false);
  assert.equal(isNodeVersionSupported('v20.11.1'), false);
});

test('settings check passes without a CMS but says preview-only', () => {
  const { result, config } = checkSettings(OPENROUTER_ENVIRONMENT, []);
  assert.equal(result.passed, true);
  assert.equal(config.writer.model, 'vendor/model-x');
  assert.match(result.detail, /only `npm run preview`/);
});

test('settings check reports the exact problem', () => {
  const { result, config } = checkSettings({ ...OPENROUTER_ENVIRONMENT, OPENROUTER_MODEL: '' }, []);
  assert.equal(result.passed, false);
  assert.equal(config, null);
  assert.match(result.detail, /OPENROUTER_MODEL/);
});

test('news check counts stories, and explains unreachable', async () => {
  const { config } = checkSettings(OPENROUTER_ENVIRONMENT, []);
  const ok = await checkNewsSource(config, makeScriptedFetch([makeFakeResponse({ body: SAMPLE_RSS_FEED })]).fetchImplementation);
  assert.deepEqual([ok.passed, ok.detail], [true, '2 recent stories found']);

  const down = await checkNewsSource(config, makeScriptedFetch([new TypeError('fetch failed')]).fetchImplementation);
  assert.equal(down.passed, false);
  assert.match(down.detail, /Could not reach news.google.com/);
});

test('OpenRouter check catches a mistyped model name', async () => {
  const { config } = checkSettings(OPENROUTER_ENVIRONMENT, []);
  const good = await checkAiProvider(config, makeScriptedFetch([makeFakeResponse({ body: MODELS_LIST })]).fetchImplementation);
  assert.equal(good.passed, true);

  const { config: typoConfig } = checkSettings({ ...OPENROUTER_ENVIRONMENT, OPENROUTER_MODEL: 'vendor/modle-x' }, []);
  const typo = await checkAiProvider(typoConfig, makeScriptedFetch([makeFakeResponse({ body: MODELS_LIST })]).fetchImplementation);
  assert.equal(typo.passed, false);
  assert.match(typo.detail, /is not an OpenRouter model/);
});

test('Anthropic check treats any answer (even 405) as reachable', async () => {
  const { config } = checkSettings({ NEWS_INDUSTRY: 'HVAC', NEWS_LOCATION: 'X', ANTHROPIC_API_KEY: 'k' }, []);
  const result = await checkAiProvider(config, makeScriptedFetch([makeFakeResponse({ status: 405 })]).fetchImplementation);
  assert.equal(result.passed, true);
});

test('network checks are skipped when settings are broken', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([]);
  const results = await runAllChecks({ environment: {}, commandLineArguments: [], nodeVersion: 'v22.9.0', fetchImplementation });
  assert.deepEqual(results.map(r => r.passed), [true, false]);
  assert.equal(calls.length, 0);
});
