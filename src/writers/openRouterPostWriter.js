/**
 * TRANSFORM stage, OpenRouter flavour.
 *
 * OpenRouter is one API in front of many AI models (Claude, GPT, Grok, Llama...).
 * Switching models is a one-word config change, e.g. OPENROUTER_MODEL=openai/<model>.
 * It speaks the OpenAI "chat completions" format, so the request and reply look
 * different from Anthropic's — but the prompt and the checks are the shared ones.
 */

import { fetchWithRetry } from '../support/http.js';
import { PostWriterError } from '../support/errors.js';
import {
  buildSystemPrompt, buildStoryDetailsMessage, parseBlogPostFromReplyText, MAXIMUM_RESPONSE_TOKENS,
} from './blogPostPrompt.js';

const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Shown in the OpenRouter dashboard so you can tell which app spent the credits. */
const APP_TITLE_FOR_OPENROUTER_DASHBOARD = 'News-to-Blog Agent';

/**
 * The request body in OpenAI chat-completions format.
 * The system prompt is the first message (Anthropic has a separate field for it).
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @param {{ industry: string, location: string, model: string }} settings
 * @returns {object}
 */
export function buildOpenRouterRequestBody(story, { industry, location, model }) {
  return {
    model,
    max_tokens: MAXIMUM_RESPONSE_TOKENS,
    messages: [
      { role: 'system', content: buildSystemPrompt({ industry, location }) },
      { role: 'user', content: buildStoryDetailsMessage(story) },
    ],
  };
}

/**
 * Chat-completions replies put the text at choices[0].message.content.
 * OpenRouter can also return HTTP 200 with an `error` object (e.g. the upstream
 * model failed), so that case is checked explicitly.
 *
 * @param {object} openRouterResponse - Parsed JSON from OpenRouter.
 * @returns {import('./blogPostPrompt.js').BlogPost}
 */
export function extractBlogPostFromOpenRouterResponse(openRouterResponse) {
  if (openRouterResponse?.error) {
    throw new PostWriterError(`OpenRouter reported an error: ${openRouterResponse.error.message ?? 'unknown'}`);
  }
  const replyText = openRouterResponse?.choices?.[0]?.message?.content ?? '';
  return parseBlogPostFromReplyText(replyText);
}

/**
 * @param {object} settings
 * @param {string} settings.apiKey - OpenRouter API key.
 * @param {string} settings.model - OpenRouter model slug, "<provider>/<model>".
 * @param {string} settings.industry
 * @param {string} settings.location
 * @param {typeof fetch} [settings.fetchImplementation]
 */
export function createOpenRouterPostWriter({ apiKey, model, industry, location, fetchImplementation = fetch }) {
  return {
    description: `${model} via OpenRouter`,

    async writePostAbout(story) {
      let response;
      try {
        response = await fetchWithRetry(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-Title': APP_TITLE_FOR_OPENROUTER_DASHBOARD,
            'content-type': 'application/json',
          },
          body: JSON.stringify(buildOpenRouterRequestBody(story, { industry, location, model })),
        }, { fetchImplementation });
      } catch (error) {
        throw new PostWriterError(`OpenRouter request failed: ${error.message}`, error);
      }

      return extractBlogPostFromOpenRouterResponse(await response.json());
    },
  };
}
