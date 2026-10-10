/**
 * A small `fetch` wrapper that retries the failures worth retrying.
 *
 * Retried:      network errors, HTTP 429 (rate limited), HTTP 5xx (server trouble).
 * Not retried:  other 4xx errors — a bad API key or a malformed request will
 *               not fix itself, so retrying would only waste time and money.
 *
 * Waits grow exponentially between attempts: 1s, 2s, 4s, ...
 */

import { HttpRequestError } from './errors.js';

const MAXIMUM_LOGGED_BODY_LENGTH = 500;

/** @param {number} milliseconds */
const waitFor = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Decide whether an HTTP status code is a temporary problem.
 * @param {number} status
 * @returns {boolean}
 */
export function isRetryableStatus(status) {
  const isRateLimited = status === 429;
  const isServerError = status >= 500 && status <= 599;
  return isRateLimited || isServerError;
}

/**
 * Perform an HTTP request, retrying temporary failures.
 *
 * @param {string} url
 * @param {RequestInit} requestOptions - Passed straight through to `fetch`.
 * @param {object} [retryOptions]
 * @param {number} [retryOptions.maximumAttempts=3] - Total tries, including the first.
 * @param {number} [retryOptions.initialDelayMilliseconds=1000] - Wait before the second try.
 * @param {typeof fetch} [retryOptions.fetchImplementation=fetch] - Injected in tests.
 * @param {(ms: number) => Promise<void>} [retryOptions.sleep=waitFor] - Injected in tests.
 * @returns {Promise<Response>} The first successful (2xx) response.
 * @throws {HttpRequestError} When every attempt fails or a non-retryable status arrives.
 */
export async function fetchWithRetry(url, requestOptions = {}, retryOptions = {}) {
  const {
    maximumAttempts = 3,
    initialDelayMilliseconds = 1000,
    fetchImplementation = fetch,
    sleep = waitFor,
  } = retryOptions;

  let lastFailure = null;

  for (let attemptNumber = 1; attemptNumber <= maximumAttempts; attemptNumber++) {
    const isLastAttempt = attemptNumber === maximumAttempts;

    try {
      const response = await fetchImplementation(url, requestOptions);

      if (response.ok) {
        return response;
      }

      const responseBody = (await response.text()).slice(0, MAXIMUM_LOGGED_BODY_LENGTH);
      lastFailure = new HttpRequestError(
        `Request to ${new URL(url).host} failed with HTTP ${response.status}`,
        { status: response.status, responseBody },
      );

      if (!isRetryableStatus(response.status)) {
        throw lastFailure;
      }
    } catch (error) {
      if (error instanceof HttpRequestError && !isRetryableStatus(error.status ?? 500)) {
        throw error;
      }
      if (!(error instanceof HttpRequestError)) {
        lastFailure = new HttpRequestError(
          `Could not reach ${new URL(url).host}: ${error.message}`,
          { status: null, responseBody: '', cause: error },
        );
      }
    }

    if (!isLastAttempt) {
      const delayBeforeNextAttempt = initialDelayMilliseconds * 2 ** (attemptNumber - 1);
      await sleep(delayBeforeNextAttempt);
    }
  }

  throw lastFailure;
}
