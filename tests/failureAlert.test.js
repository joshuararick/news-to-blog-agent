import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendFailureAlert, describePartialFailure, describeFatalFailure } from '../src/support/failureAlert.js';
import { NewsSourceError } from '../src/support/errors.js';
import { silentLogger } from '../src/support/logger.js';
import { makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const SEARCH = { industry: 'HVAC', location: 'Greenville SC' };

test('partial-failure message names each failed story, its reason and stage', () => {
  const message = describePartialFailure({
    postsPublished: [{}],
    postsFailed: [{ headline: 'Rebates', stage: 'post-writer', reason: 'Post body is 40 words' }],
  }, SEARCH);
  assert.match(message, /HVAC, Greenville SC/);
  assert.match(message, /1 post\(s\) failed, 1 saved/);
  assert.match(message, /"Rebates": Post body is 40 words \(post-writer\)/);
});

test('fatal message names the stage', () => {
  assert.match(describeFatalFailure(new NewsSourceError('Google News unreachable')), /\(news-source\): Google News unreachable/);
});

test('posts Slack- and Discord-compatible JSON to the webhook', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([makeFakeResponse({ status: 200 })]);
  const delivered = await sendFailureAlert({
    webhookUrl: 'https://hooks.example/abc', message: 'Oops', logger: silentLogger, fetchImplementation,
  });
  assert.equal(delivered, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'Oops', content: 'Oops' });
});

test('alerts are off when no webhook is configured', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([]);
  assert.equal(await sendFailureAlert({ webhookUrl: null, message: 'x', logger: silentLogger, fetchImplementation }), false);
  assert.equal(calls.length, 0);
});

test('a broken alert channel is logged, never thrown', async () => {
  const errors = [];
  const logger = { ...silentLogger, error: message => errors.push(message) };
  const { fetchImplementation } = makeScriptedFetch([makeFakeResponse({ status: 404 })]);
  const delivered = await sendFailureAlert({ webhookUrl: 'https://hooks.example/gone', message: 'x', logger, fetchImplementation });
  assert.equal(delivered, false);
  assert.match(errors[0], /Could not send failure alert/);
});
