# 📰 News-to-Blog Agent

**Every morning, find fresh local industry news, have an AI (Claude directly, or any model via OpenRouter) write a short blog post about it, and save it to your website as a draft for a human to approve.**

Built for small businesses that want an active, locally relevant blog (good for SEO and trust) without writing every day.

Ships two ways, same logic:

| | When to use | How |
|---|---|---|
| **n8n workflow** (`n8n/workflow.n8n.json`) | The team already uses n8n | Import from file, add 2 credentials |
| **Node.js CLI** (`src/`) | Cron, CI, or developers | `npm run preview` |

---

## Quick start (Node.js)

```bash
cp .env.example .env        # add your Anthropic key, industry, location
npm run preview             # dry run: prints posts, saves nothing
npm start                   # real run: saves drafts to PayloadCMS
npm test                    # 38 tests, no network needed
```

Requires Node 22.9+. **No dependencies.** Only the Node standard library.

Command-line flags override `.env`:

```bash
node src/cli.js --industry "Roofing" --location "Austin TX" --max-posts 2 --dry-run --verbose
node src/cli.js --ai-provider openrouter --dry-run     # needs OPENROUTER_API_KEY + OPENROUTER_MODEL
```

### Choosing the AI
| `AI_PROVIDER` | Needs | Why pick it |
|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | Claude directly: simplest setup, one bill |
| `openrouter` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | One key for Claude, GPT, Grok, Llama...; swap models by editing one line |

Both use the **same prompt and the same reply checks** (`src/writers/blogPostPrompt.js`), so switching models can never weaken the guardrails.

Exit codes: `0` all good · `1` could not run (bad config, news unreachable) · `2` ran, but some posts failed. So cron and CI can alert on it.

### Run it daily
```cron
0 7 * * *  cd /path/to/news-to-blog-agent && npm start >> run.log 2>&1
```

---

## Architecture

```
                       ┌──────────────────────── src/cli.js ────────────────────────┐
                       │  reads env + flags, builds the pieces, runs the pipeline     │
                       └──────────────────────────────┬──────────────────────────────┘
                                                      ▼
  ┌───────────── src/pipeline.js (orchestrates only; knows no vendors) ─────────────┐
  │                                                                                   │
  │   SOURCE                 FILTER                  TRANSFORM              SINK      │
  │   newsSource      →   seenStoryStore     →      postWriter      →     publisher   │
  │   .findRecent         .hasSeen / limit           .writePostAbout       .publish     │
  └─────┬──────────────────────┬─────────────────────────┬─────────────────────┬──────┘
        ▼                      ▼                         ▼                     ▼
  sources/               state/                    writers/                  publishers/
  googleNewsSource.js    seenStoryStore.js         createPostWriter.js       payloadDraftPublisher.js
  (free RSS)             (JSON file)                ├ claudePostWriter.js    consolePublisher.js (dry run)
                                                    ├ openRouterPostWriter.js
                                                    └ blogPostPrompt.js (shared prompt + checks)
                                                         │
                                support/http.js ◀────────┘  retries 429/5xx with exponential backoff
                                support/errors.js           one error class per stage
                                support/logger.js           timestamped, levelled output
```

### Design decisions

- **Dependency injection.** `pipeline.js` receives *something that can* find stories, write posts and publish. It never imports Google, Claude or Payload. Result: the whole pipeline is tested with in-memory fakes, and moving to WordPress means writing one new publisher file. (Proof: OpenRouter support was added without touching `pipeline.js`.)
- **Validate config first.** A missing key fails in the first second with a fix-it message, before any API credit is spent.
- **Failures are isolated per story.** A bad Claude reply skips *that* story, records why in the run summary, and the rest continue. Skipped stories aren't marked as seen, so they retry tomorrow.
- **Retry only what can recover.** 429 and 5xx are retried with 1s → 2s → 4s waits. A 401 (bad key) fails immediately, because retrying won't fix it.
- **Drafts, not auto-publish.** Nothing reaches the public site without a person clicking Publish.
- **No invented facts.** The prompt restricts the AI to the story details, and replies are rejected if they're not valid JSON or fall outside 120–500 words.
- **Never duplicates.** Posted links are remembered in a capped JSON file, written atomically (temp file + rename) so a crash can't corrupt it.
- **Cheap by default.** Claude Haiku costs pennies a day; `CLAUDE_MODEL=claude-sonnet-5-5` for richer prose, or any model via OpenRouter.

---

## PayloadCMS setup

1. On your posts collection: `versions: { drafts: true }`, plus fields `title` (text), `summary` (textarea), `sourceUrl` (text).
2. On your users collection: `auth: { useAPIKey: true }`, then generate a key for a bot user.
3. Put `PAYLOAD_URL` and `PAYLOAD_API_KEY` in `.env`.

Each run logs the admin link of every draft it creates.

## n8n setup

1. **Import** `n8n/workflow.n8n.json`.
2. Create two **Header Auth** credentials:
   - *OpenRouter*: name `Authorization`, value = `Bearer <your OpenRouter key>`
   - *Payload*: name `Authorization`, value = `users API-Key <key>`
3. Edit the **Config** node: industry, location, site URL, and `aiModel` (a slug from https://openrouter.ai/models).
4. Run once, review the drafts, then **activate**.

The news, AI and Payload steps retry up to 3 times (2s apart), and **Shape Post** rejects AI replies that aren't valid JSON or fall outside 120–500 words, so a bad reply fails loudly instead of publishing junk.

---

## Roadmap
- Map posts into Payload's rich-text (Lexical) `content` field.
- Fetch full article text for meatier posts.
- More sources (industry RSS feeds, Reddit) behind the same `findRecentStories` interface.
- Slack or email digest: "3 drafts are waiting for review".
