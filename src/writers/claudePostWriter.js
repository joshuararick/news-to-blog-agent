/**
 * TRANSFORM stage, Anthropic flavour: ask Claude directly (Anthropic Messages API)
 * to turn one news story into a short blog post.
 *
 * The prompt and the reply checks are shared with every other writer — see
 * blogPostPrompt.js. This file only knows how to talk to Anthropic's API.
 */

import { fetchWithRetry } from '../support/http.js';
import { PostWriterError } from '../support/errors.js';
import {
  buildSystemPrompt, buildStoryDetailsMessage, parseBlogPostFromReplyText, MAXIMUM_RESPONSE_TOKENS,
} from './blogPostPrompt.js';

const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * The request body for the Anthropic Messages API.
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @param {{ industry: string, location: string, model: string }} settings
 * @returns {object}
 */
export function buildClaudeRequestBody(story, { industry, location, model }) {
  return {
    model,
    max_tokens: MAXIMUM_RESPONSE_TOKENS,
    system: buildSystemPrompt({ industry, location }),
    messages: [{ role: 'user', content: buildStoryDetailsMessage(story) }],
  };
}

/**
 * Anthropic replies with a list of content blocks; the post is in the text block.
 * @param {object} claudeResponse - Parsed JSON from the Messages API.
 * @returns {import('./blogPostPrompt.js').BlogPost}
 */
export function extractBlogPostFromClaudeResponse(claudeResponse) {
  const replyText = claudeResponse?.content?.find(block => block.type === 'text')?.text ?? '';
  return parseBlogPostFromReplyText(replyText);
}

/**
 * @param {object} settings
 * @param {string} settings.apiKey - Anthropic API key.
 * @param {string} settings.model - e.g. "claude-haiku-5-5".
 * @param {string} settings.industry
 * @param {string} settings.location
 * @param {typeof fetch} [settings.fetchImplementation]
 */
export function createClaudePostWriter({ apiKey, model, industry, location, fetchImplementation = fetch }) {
  return {
    description: `Claude (${model}) via Anthropic`,

    async writePostAbout(story) {
      let response;
      try {
        response = await fetchWithRetry(ANTHROPIC_MESSAGES_ENDPOINT, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify(buildClaudeRequestBody(story, { industry, location, model })),
        }, { fetchImplementation });
      } catch (error) {
        throw new PostWriterError(`Claude request failed: ${error.message}`, error);
      }

      return extractBlogPostFromClaudeResponse(await response.json());
    },
  };
}
