/**
 * TRANSFORM stage: ask Claude to turn one news story into a short blog post.
 *
 * Guardrails live in the prompt (use only the facts given, never invent quotes
 * or numbers) and in the response check (the post must have a title and a body
 * of a sensible length) so a bad reply is rejected instead of published.
 */

import { fetchWithRetry } from '../support/http.js';
import { PostWriterError } from '../support/errors.js';

const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MAXIMUM_RESPONSE_TOKENS = 1024;

export const MINIMUM_BODY_WORD_COUNT = 120;
export const MAXIMUM_BODY_WORD_COUNT = 500;

/**
 * @typedef {object} BlogPost
 * @property {string} title
 * @property {string} body - Plain-text paragraphs separated by blank lines.
 */

/**
 * The instructions Claude follows for every post.
 * @param {{ industry: string, location: string }} audience
 * @returns {string}
 */
export function buildSystemPrompt({ industry, location }) {
  return [
    `You write short, friendly local-news blog posts for a ${industry} business in ${location}.`,
    'Rules:',
    '- Use only the facts in the story details you are given. Never invent quotes, numbers, names or events.',
    '- If the details are thin, write about why this kind of news matters to local customers instead of guessing.',
    '- 200 to 400 words, plain paragraphs, no markdown headings.',
    '- Reply with JSON only, shaped exactly like: {"title": "...", "body": "..."}',
  ].join('\n');
}

/**
 * The full request body for the Anthropic Messages API.
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @param {{ industry: string, location: string, model: string }} settings
 * @returns {object}
 */
export function buildClaudeRequestBody(story, { industry, location, model }) {
  const storyDetails = [
    `Headline: ${story.headline}`,
    `Publisher: ${story.publisherName || 'unknown'}`,
    `Published: ${story.publishedAt || 'unknown'}`,
    `Link: ${story.link}`,
  ].join('\n');

  return {
    model,
    max_tokens: MAXIMUM_RESPONSE_TOKENS,
    system: buildSystemPrompt({ industry, location }),
    messages: [{ role: 'user', content: storyDetails }],
  };
}

/** @param {string} text */
const countWords = text => text.split(/\s+/).filter(Boolean).length;

/**
 * Pull the blog post out of Claude's reply and check it is usable.
 * Tolerates friendly text around the JSON ("Sure! Here it is: {...}").
 *
 * @param {object} claudeResponse - Parsed JSON from the Messages API.
 * @returns {BlogPost}
 * @throws {PostWriterError} When the reply is missing, malformed or the wrong length.
 */
export function extractBlogPostFromClaudeResponse(claudeResponse) {
  const replyText = claudeResponse?.content?.find(block => block.type === 'text')?.text ?? '';
  const jsonStart = replyText.indexOf('{');
  const jsonEnd = replyText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd < jsonStart) {
    throw new PostWriterError('Claude did not reply with JSON');
  }

  let parsedReply;
  try {
    parsedReply = JSON.parse(replyText.slice(jsonStart, jsonEnd + 1));
  } catch (error) {
    throw new PostWriterError('Claude replied with JSON that could not be parsed', error);
  }

  const title = String(parsedReply.title ?? '').trim();
  const body = String(parsedReply.body ?? '').trim();
  if (!title || !body) {
    throw new PostWriterError('Claude reply is missing a title or body');
  }

  const bodyWordCount = countWords(body);
  if (bodyWordCount < MINIMUM_BODY_WORD_COUNT || bodyWordCount > MAXIMUM_BODY_WORD_COUNT) {
    throw new PostWriterError(
      `Post body is ${bodyWordCount} words; expected ${MINIMUM_BODY_WORD_COUNT}-${MAXIMUM_BODY_WORD_COUNT}`);
  }

  return { title, body };
}

/**
 * Create the post writer used by the pipeline.
 * @param {object} settings
 * @param {string} settings.apiKey
 * @param {string} settings.model
 * @param {string} settings.industry
 * @param {string} settings.location
 * @param {typeof fetch} [settings.fetchImplementation]
 * @returns {{ writePostAbout: (story: import('../sources/googleNewsSource.js').NewsStory) => Promise<BlogPost> }}
 */
export function createClaudePostWriter({ apiKey, model, industry, location, fetchImplementation = fetch }) {
  return {
    async writePostAbout(story) {
      const requestBody = buildClaudeRequestBody(story, { industry, location, model });

      let response;
      try {
        response = await fetchWithRetry(ANTHROPIC_MESSAGES_ENDPOINT, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }, { fetchImplementation });
      } catch (error) {
        throw new PostWriterError(`Claude request failed: ${error.message}`, error);
      }

      return extractBlogPostFromClaudeResponse(await response.json());
    },
  };
}
