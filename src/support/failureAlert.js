/**
 * Tell a human when a run goes wrong.
 *
 * An automation that fails silently is worse than none: the blog quietly
 * stops updating and nobody notices for weeks. When ALERT_WEBHOOK_URL is set,
 * a short message is posted there whenever a run fails or skips posts.
 *
 * The message is sent as {"text": ..., "content": ...} so the same webhook
 * call works for Slack ("text") and Discord ("content"), and for n8n/Zapier
 * webhooks that can forward it by email or SMS.
 */

import { fetchWithRetry } from './http.js';

/**
 * Build the alert text for a run that finished but had failures.
 * @param {import('../pipeline.js').RunSummary} summary
 * @param {{ industry: string, location: string }} search
 * @returns {string}
 */
export function describePartialFailure(summary, { industry, location }) {
  const failureLines = summary.postsFailed.map(
    failure => `• "${failure.headline}": ${failure.reason} (${failure.stage})`);

  return [
    `⚠️ News-to-Blog (${industry}, ${location}): ${summary.postsFailed.length} post(s) failed, ${summary.postsPublished.length} saved.`,
    ...failureLines,
    'Failed stories will be retried on the next run.',
  ].join('\n');
}

/**
 * Build the alert text for a run that could not run at all.
 * @param {Error & { stage?: string }} error
 * @returns {string}
 */
export function describeFatalFailure(error) {
  return `🛑 News-to-Blog did not run (${error.stage ?? 'unknown stage'}): ${error.message}`;
}

/**
 * Post an alert. Never throws: a broken alert channel must not hide the
 * original problem, so delivery failures are only logged.
 *
 * @param {object} options
 * @param {string | null} options.webhookUrl - Where to send it; null means alerts are off.
 * @param {string} options.message
 * @param {import('./logger.js').Logger} options.logger
 * @param {typeof fetch} [options.fetchImplementation]
 * @returns {Promise<boolean>} True when the alert was delivered.
 */
export async function sendFailureAlert({ webhookUrl, message, logger, fetchImplementation = fetch }) {
  if (!webhookUrl) return false;

  try {
    await fetchWithRetry(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
    }, { fetchImplementation, maximumAttempts: 2 });
    logger.info('Failure alert sent');
    return true;
  } catch (error) {
    logger.error(`Could not send failure alert: ${error.message}`);
    return false;
  }
}
