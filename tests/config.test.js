import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseCommandLineArguments, DEFAULT_CLAUDE_MODEL } from '../src/config.js';
import { ConfigurationError } from '../src/support/errors.js';

const COMPLETE_ENVIRONMENT = {
  ANTHROPIC_API_KEY: 'sk-test',
  PAYLOAD_URL: 'https://site.example/',
  PAYLOAD_API_KEY: 'payload-key',
  NEWS_INDUSTRY: 'HVAC',
  NEWS_LOCATION: 'Greenville SC',
};

test('parses --name value pairs and bare --flags', () => {
  assert.deepEqual(
    parseCommandLineArguments(['--industry', 'Roofing', '--dry-run', '--max-posts', '2']),
    { industry: 'Roofing', 'dry-run': true, 'max-posts': '2' },
  );
  assert.throws(() => parseCommandLineArguments(['oops']), ConfigurationError);
});

test('builds a full config from the environment with sensible defaults', () => {
  const config = loadConfig({ environment: COMPLETE_ENVIRONMENT, commandLineArguments: [] });
  assert.equal(config.industry, 'HVAC');
  assert.equal(config.maximumPostsPerRun, 3);
  assert.equal(config.writer.provider, 'anthropic');
  assert.equal(config.writer.model, DEFAULT_CLAUDE_MODEL);
  assert.equal(config.payload.baseUrl, 'https://site.example', 'trailing slash removed');
  assert.equal(config.payload.collection, 'posts');
  assert.equal(Object.isFrozen(config), true);
});

test('command-line flags override environment variables', () => {
  const config = loadConfig({
    environment: COMPLETE_ENVIRONMENT,
    commandLineArguments: ['--industry', 'Roofing', '--max-posts', '5'],
  });
  assert.equal(config.industry, 'Roofing');
  assert.equal(config.maximumPostsPerRun, 5);
});

test('dry run does not require CMS settings', () => {
  const config = loadConfig({
    environment: { ANTHROPIC_API_KEY: 'sk-test' },
    commandLineArguments: ['--industry', 'HVAC', '--location', 'Austin TX', '--dry-run'],
  });
  assert.equal(config.isDryRun, true);
  assert.equal(config.payload, null);
});

test('clear errors for missing or invalid settings', () => {
  const { ANTHROPIC_API_KEY, ...environmentWithoutClaudeKey } = COMPLETE_ENVIRONMENT;
  assert.throws(() => loadConfig({ environment: environmentWithoutClaudeKey, commandLineArguments: [] }), /Missing ANTHROPIC_API_KEY/);
  assert.throws(() => loadConfig({ environment: { ...COMPLETE_ENVIRONMENT, NEWS_LOCATION: '' }, commandLineArguments: [] }), /--location/);
  assert.throws(() => loadConfig({ environment: COMPLETE_ENVIRONMENT, commandLineArguments: ['--max-posts', 'lots'] }), /whole number/);
});

test('OpenRouter needs its own key and an explicit model', () => {
  const openRouterEnvironment = {
    ...COMPLETE_ENVIRONMENT, AI_PROVIDER: 'OpenRouter', OPENROUTER_API_KEY: 'or-key', OPENROUTER_MODEL: 'vendor/model-x',
  };
  const config = loadConfig({ environment: openRouterEnvironment, commandLineArguments: [] });
  assert.deepEqual({ ...config.writer }, { provider: 'openrouter', apiKey: 'or-key', model: 'vendor/model-x' });

  const { OPENROUTER_MODEL, ...withoutModel } = openRouterEnvironment;
  assert.throws(() => loadConfig({ environment: withoutModel, commandLineArguments: [] }), /OPENROUTER_MODEL/);
});

test('the --ai-provider flag wins, and unknown providers are rejected', () => {
  assert.throws(
    () => loadConfig({ environment: COMPLETE_ENVIRONMENT, commandLineArguments: ['--ai-provider', 'openrouter'] }),
    /OPENROUTER_MODEL/);
  assert.throws(
    () => loadConfig({ environment: { ...COMPLETE_ENVIRONMENT, AI_PROVIDER: 'skynet' }, commandLineArguments: [] }),
    /Unknown AI provider "skynet"/);
});
