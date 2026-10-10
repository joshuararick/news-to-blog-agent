/**
 * SINK stage (real): save each post to a PayloadCMS collection as a DRAFT.
 *
 * Drafts are deliberate: a person reviews and clicks Publish in the Payload
 * admin, so nothing reaches the public site without human eyes on it.
 * The collection needs `versions: { drafts: true }` for `_status` to apply.
 */

import { fetchWithRetry } from '../support/http.js';
import { PublisherError } from '../support/errors.js';
import { convertPlainTextToLexical } from './lexicalRichText.js';

/** How the post body is stored: a plain textarea, or Payload's Lexical rich-text editor. */
export const BODY_FORMATS = ['plain', 'richtext'];

/**
 * Shape a post into the document Payload stores.
 *
 * Blogs differ in what they call the article field and how they store it, so
 * both are settings: e.g. `summary` as plain text (a textarea field), or
 * `content` as rich text (the Lexical editor most Payload blogs use).
 *
 * @param {import('../writers/blogPostPrompt.js').BlogPost} post
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @param {object} [fieldSettings]
 * @param {string} [fieldSettings.bodyField='summary'] - Name of the field that holds the article.
 * @param {'plain' | 'richtext'} [fieldSettings.bodyFormat='plain']
 * @returns {object} The document to POST to Payload.
 */
export function buildPayloadDraftDocument(post, story, { bodyField = 'summary', bodyFormat = 'plain' } = {}) {
  const bodyValue = bodyFormat === 'richtext' ? convertPlainTextToLexical(post.body) : post.body;

  return {
    title: post.title,
    [bodyField]: bodyValue,
    sourceUrl: story.link,
    _status: 'draft',
  };
}

/**
 * @param {object} settings
 * @param {string} settings.baseUrl - e.g. "https://example.com" (no trailing slash).
 * @param {string} settings.apiKey - A Payload user API key.
 * @param {string} settings.collection - Collection slug, e.g. "posts".
 * @param {string} [settings.authCollection='users'] - Collection the API key belongs to.
 * @param {string} [settings.bodyField='summary'] - Field that holds the article text.
 * @param {'plain' | 'richtext'} [settings.bodyFormat='plain'] - How that field stores text.
 * @param {typeof fetch} [settings.fetchImplementation]
 */
export function createPayloadDraftPublisher({
  baseUrl, apiKey, collection, authCollection = 'users',
  bodyField = 'summary', bodyFormat = 'plain', fetchImplementation = fetch,
}) {
  const createDocumentUrl = `${baseUrl}/api/${encodeURIComponent(collection)}`;

  return {
    description: `PayloadCMS drafts at ${createDocumentUrl}`,

    /**
     * @returns {Promise<{ location: string }>} Where the draft can be found.
     */
    async publish(post, story) {
      try {
        const response = await fetchWithRetry(createDocumentUrl, {
          method: 'POST',
          headers: {
            // Payload's API-key header format: "<auth collection slug> API-Key <key>"
            Authorization: `${authCollection} API-Key ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(buildPayloadDraftDocument(post, story, { bodyField, bodyFormat })),
        }, { fetchImplementation });

        const createdDocument = await response.json();
        const documentId = createdDocument?.doc?.id ?? 'unknown-id';
        return { location: `${baseUrl}/admin/collections/${collection}/${documentId}` };
      } catch (error) {
        throw new PublisherError(`Payload did not accept "${post.title}": ${error.message}`, error);
      }
    },
  };
}
