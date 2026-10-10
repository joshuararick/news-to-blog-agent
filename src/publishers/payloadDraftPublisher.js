/**
 * SINK stage (real): save each post to a PayloadCMS collection as a DRAFT.
 *
 * Drafts are deliberate: a person reviews and clicks Publish in the Payload
 * admin, so nothing reaches the public site without human eyes on it.
 * The collection needs `versions: { drafts: true }` for `_status` to apply.
 */

import { fetchWithRetry } from '../support/http.js';
import { PublisherError } from '../support/errors.js';

/**
 * Shape a post into the document Payload stores.
 * `summary` is a plain textarea field; see README for mapping into a rich-text field.
 *
 * @param {import('../writers/claudePostWriter.js').BlogPost} post
 * @param {import('../sources/googleNewsSource.js').NewsStory} story
 * @returns {{ title: string, summary: string, sourceUrl: string, _status: 'draft' }}
 */
export function buildPayloadDraftDocument(post, story) {
  return {
    title: post.title,
    summary: post.body,
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
 * @param {typeof fetch} [settings.fetchImplementation]
 */
export function createPayloadDraftPublisher({
  baseUrl, apiKey, collection, authCollection = 'users', fetchImplementation = fetch,
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
          body: JSON.stringify(buildPayloadDraftDocument(post, story)),
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
