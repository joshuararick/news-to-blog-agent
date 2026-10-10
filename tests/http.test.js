import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, isRetryableStatus } from '../src/support/http.js';
import { HttpRequestError } from '../src/support/errors.js';
import { makeFakeResponse, makeScriptedFetch, noWait } from './fixtures.js';

const URL_UNDER_TEST = 'https://api.example/thing';

test('retryable statuses are 429 and 5xx only', () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(404), false);
});

test('returns the first successful response after temporary failures', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([
    makeFakeResponse({ status: 503 }),
    new TypeError('socket hang up'),
    makeFakeResponse({ status: 200, body: 'ok' }),
  ]);
  const delays = [];
  const response = await fetchWithRetry(URL_UNDER_TEST, {}, {
    fetchImplementation, sleep: async ms => { delays.push(ms); },
  });
  assert.equal(await response.text(), 'ok');
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [1000, 2000], 'waits double each time');
});

test('does not retry a 401 — a bad key will not fix itself', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([makeFakeResponse({ status: 401, body: 'bad key' })]);
  await assert.rejects(
    fetchWithRetry(URL_UNDER_TEST, {}, { fetchImplementation, sleep: noWait }),
    error => error instanceof HttpRequestError && error.status === 401 && error.responseBody === 'bad key',
  );
  assert.equal(calls.length, 1);
});

test('gives up after the maximum attempts with the last failure', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([
    makeFakeResponse({ status: 500 }), makeFakeResponse({ status: 500 }), makeFakeResponse({ status: 502 }),
  ]);
  await assert.rejects(
    fetchWithRetry(URL_UNDER_TEST, {}, { fetchImplementation, sleep: noWait }),
    /HTTP 502/,
  );
  assert.equal(calls.length, 3);
});
