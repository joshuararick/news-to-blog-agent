/** Shared test data and fake collaborators. */

export const SAMPLE_RSS_FEED = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[Greenville announces new HVAC efficiency rebates]]></title>
  <link>https://news.example/rebates</link>
  <pubDate>Thu, 09 Oct 2026 12:00:00 GMT</pubDate>
  <source url="https://greenvillenews.example">The Greenville News</source>
</item>
<item>
  <title>Heat pump installs rise &amp; costs fall</title>
  <link>https://news.example/heat-pumps</link>
</item>
<item>
  <title></title>
  <link>https://news.example/untitled</link>
</item>
</channel></rss>`;

/** A body comfortably inside the allowed word range. */
export const VALID_POST_BODY = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ');

/** Build an Anthropic Messages API response containing `replyText`. */
export function makeClaudeResponse(replyText) {
  return { content: [{ type: 'text', text: replyText }] };
}

/** A minimal stand-in for a fetch Response. */
export function makeFakeResponse({ status = 200, body = '' } = {}) {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

/** fetch replacement that returns the queued responses in order and records each call. */
export function makeScriptedFetch(responses) {
  const calls = [];
  const fetchImplementation = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImplementation, calls };
}

export const noWait = async () => {};
