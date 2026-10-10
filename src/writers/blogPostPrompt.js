/**
 * What every AI writer shares, whichever company's model is behind it:
 *   - the instructions (system prompt) and story details we send, and
 *   - the checks a reply must pass before it is allowed to become a post.
 *
 * Keeping these in one place means the guardrails are identical for Claude,
 * GPT, Grok or anything else — a provider swap can never weaken them.
 */

import { PostWriterError } from '../support/errors.js';

export const MINIMUM_BODY_WORD_COUNT = 120;
export const MAXIMUM_BODY_WORD_COUNT = 500;
export const MAXIMUM_RESPONSE_TOKENS = 1024;

/**
 * @typedef {object} BlogPost
 * @property {string} title
 * @property {string} body - Plain-text paragraphs separated by blank lines.
 */

/**
 * The instructions the model follows for every post.
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
 * The user message describing one story. Missing fields are labelled "unknown"
 * so the model is not tempted to fill them in.
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @returns {string}
 */
export function buildStoryDetailsMessage(story) {
  return [
    `Headline: ${story.headline}`,
    `Publisher: ${story.publisherName || 'unknown'}`,
    `Published: ${story.publishedAt || 'unknown'}`,
    `Link: ${story.link}`,
  ].join('\n');
}

/** @param {string} text */
const countWords = text => text.split(/\s+/).filter(Boolean).length;

/**
 * Turn the model's reply text into a checked blog post.
 * Tolerates friendly text around the JSON ("Sure! Here it is: {...}").
 *
 * @param {string} replyText
 * @returns {BlogPost}
 * @throws {PostWriterError} When the reply is missing, malformed or the wrong length.
 */
export function parseBlogPostFromReplyText(replyText) {
  const text = String(replyText ?? '');
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd < jsonStart) {
    throw new PostWriterError('The AI did not reply with JSON');
  }

  let parsedReply;
  try {
    parsedReply = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (error) {
    throw new PostWriterError('The AI replied with JSON that could not be parsed', error);
  }

  const title = String(parsedReply.title ?? '').trim();
  const body = String(parsedReply.body ?? '').trim();
  if (!title || !body) {
    throw new PostWriterError('The AI reply is missing a title or body');
  }

  const bodyWordCount = countWords(body);
  if (bodyWordCount < MINIMUM_BODY_WORD_COUNT || bodyWordCount > MAXIMUM_BODY_WORD_COUNT) {
    throw new PostWriterError(
      `Post body is ${bodyWordCount} words; expected ${MINIMUM_BODY_WORD_COUNT}-${MAXIMUM_BODY_WORD_COUNT}`);
  }

  return { title, body };
}
