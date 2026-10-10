/**
 * SOURCE stage: find recent news stories from Google News.
 *
 * Google News publishes free RSS feeds for any search, so no API key is needed.
 * The feed is XML; we read only the four fields we use with small, forgiving
 * regular expressions instead of pulling in a full XML parser dependency.
 */

import { fetchWithRetry } from '../support/http.js';
import { NewsSourceError } from '../support/errors.js';

const GOOGLE_NEWS_SEARCH_ENDPOINT = 'https://news.google.com/rss/search';

/**
 * @typedef {object} NewsStory
 * @property {string} headline - Story title as published.
 * @property {string} link - Canonical URL; also used as the story's unique id.
 * @property {string} publisherName - e.g. "The Greenville News" (may be empty).
 * @property {string} publishedAt - Publication date text from the feed (may be empty).
 */

/**
 * Build the Google News RSS URL for "<industry> <location>" news from the last N days.
 * @param {object} search
 * @param {string} search.industry
 * @param {string} search.location
 * @param {number} search.lookbackDays
 * @returns {string}
 */
export function buildGoogleNewsFeedUrl({ industry, location, lookbackDays }) {
  const searchUrl = new URL(GOOGLE_NEWS_SEARCH_ENDPOINT);
  searchUrl.searchParams.set('q', `${industry} ${location} when:${lookbackDays}d`);
  searchUrl.searchParams.set('hl', 'en-US');
  searchUrl.searchParams.set('gl', 'US');
  searchUrl.searchParams.set('ceid', 'US:en');
  return searchUrl.toString();
}

const XML_ENTITY_REPLACEMENTS = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };

/** @param {string} text */
function decodeXmlText(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, entity => XML_ENTITY_REPLACEMENTS[entity])
    .trim();
}

/**
 * Read the text inside the first `<tagName ...>...</tagName>` element.
 * @param {string} xmlFragment
 * @param {string} tagName
 * @returns {string} Decoded text, or '' if the tag is absent.
 */
function readElementText(xmlFragment, tagName) {
  const elementPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`);
  const match = xmlFragment.match(elementPattern);
  return match ? decodeXmlText(match[1]) : '';
}

/**
 * Turn RSS XML into a list of stories. Items without a headline or link are skipped.
 * @param {string} rssXml
 * @returns {NewsStory[]}
 */
export function parseRssFeed(rssXml) {
  const itemBlocks = [...String(rssXml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);

  return itemBlocks
    .map(itemXml => ({
      headline: readElementText(itemXml, 'title'),
      link: readElementText(itemXml, 'link'),
      publisherName: readElementText(itemXml, 'source'),
      publishedAt: readElementText(itemXml, 'pubDate'),
    }))
    .filter(story => story.headline !== '' && story.link !== '');
}

/**
 * Create the news source used by the pipeline.
 * @param {object} dependencies
 * @param {typeof fetch} [dependencies.fetchImplementation]
 * @returns {{ findRecentStories: (search: { industry: string, location: string, lookbackDays: number }) => Promise<NewsStory[]> }}
 */
export function createGoogleNewsSource({ fetchImplementation = fetch } = {}) {
  return {
    async findRecentStories(search) {
      const feedUrl = buildGoogleNewsFeedUrl(search);
      try {
        const response = await fetchWithRetry(feedUrl, {}, { fetchImplementation });
        return parseRssFeed(await response.text());
      } catch (error) {
        throw new NewsSourceError(`Could not load Google News for "${search.industry} ${search.location}": ${error.message}`, error);
      }
    },
  };
}
