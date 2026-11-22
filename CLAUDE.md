# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that makes **OpenRouter** (400+
models behind one key: Claude, GPT, Gemini, DeepSeek, free models…) the AI
provider of a Gladys instance: a Node.js service (Node 22+, ESM, no build
step) in its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the official OpenRouter API (`https://openrouter.ai/api/v1`) with the
administrator's API key. Runtime dependency: the SDK only (plain `fetch`, no
OpenRouter client). `type: "ai"`, Gladys 5.3.0+, `transports: ["cloud"]`,
`categories: ["assistants"]`. Not affiliated with OpenRouter.

The contract (SDK README, "AI providers"): one OpenAI-compatible chat
completion in (`messages`, `tools`, `tool_choice`, `max_tokens`, `purpose`,
`categories`, no `model`), one OpenAI-compatible completion out. The agentic
loop (prompts, tools, history) runs in the core; this integration only picks
the model and prepares the request. **Never tested with a real OpenRouter
key**: request and response shapes follow the API reference
(openrouter.ai/docs, `llms.txt` and the `.md` pages) and the public
`GET /api/v1/models`, checked on 2026-11-22.

## Commands

```bash
npm install
npm test                                  # node --test; a fake OpenRouter API on 127.0.0.1
node --test test/chat.test.js             # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/manifest.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js               SDK wiring only (new GladysIntegration + createApp)
src/app.js             every handler: onAiChat, web search scene action, test button,
                       widget, configuration, status following the requests, GET /key cache
src/chat.js            the AI provider: model per purpose, reasoning effort from the
                       catalog, retry without it when refused, privacy (provider object),
                       refusals, cut answers, usage, hooks
src/convert.js         messages of the core -> OpenRouter: calls and results paired
                       (placeholder ids, lone calls, orphans, duplicates), images,
                       reasoning_details memory by call id; the answer bounded
src/catalog.js         GET /models every 12 h: real names behind aliases, reasoning
                       efforts, tools, images; effortFor()
src/openrouter-api.js  fetch client: chat, models, key; attribution headers, deadline,
                       retries on 429 / 5xx / network with Retry-After, 402 never retried,
                       errors inside an HTTP 200, keys masked
src/websearch.js       scene action: chat completion with the web plugin (Exa, 5 results)
src/events.js          triggers: error (once per failure kind), recovered
src/usage.js           /data/usage.json: requests, tokens and cost per local day, 62 days
src/widgets.js         the usage widget (cost, credit of the key)
src/connection.js      status (GET /key + catalog, nothing spent) and the test button
src/config.js          model presets (aliases), custom id, reasoning, max_tokens, privacy
src/i18n.js            runtime texts, en / fr / de / es
src/time.js            local days and times (TZ of Gladys, Intl only)
test/helpers/fake-openrouter.js  the fake API (chat, models, key, 401 on a bad key)
.github/scripts/release.mjs     version, changelog, bump (tested in test/)
```

## Rules

- **Every key users store is forever**: the keys of `config_schema` and the
  values of the `model` / `fast_model` / `reasoning` / `privacy` selects,
  `actions`, the widget, the triggers (fields, options, variables), the scene
  action (fields, outputs). `test/structure.test.js` compares them to
  `test/fixtures/manifest.baseline.json`: never update it to make a test pass
  without a documented migration. A new scene action field is optional or has
  a default.
- **Model presets are aliases** (`~vendor/family-latest`) or routers
  (`openrouter/auto`, `openrouter/free`): OpenRouter moves an alias to the
  newest model of its family, so the stored value never ages. Never offer a
  dated model id in a select; "Other model" covers the rest.
- **Deadlines of the core**: the ack is awaited 20 s for
  `intent-classification`, 120 s otherwise; the handler gives up at 18 s and
  110 s. Retries (429, 5xx, network) only while the deadline leaves room; a
  Retry-After longer than 8 s fails at once (the daily cap of the free
  models). A 402 (`credits`) is never retried. The router never waits for the
  catalog.
- **Never fall back silently**: a failure throws (the core names it to the
  user); never answer from another provider, never return an empty turn. Do
  not use OpenRouter's `models` fallback array: the administrator chose a
  model, and a fallback to a paid model would bill without consent.
- **Reasoning**: only efforts the catalog lists for a model are sent
  (`effortFor`); the router asks for `none` and gets the lowest level its model
  accepts. Never `exclude: true`: the `reasoning_details` must come back, to
  be passed back unmodified on the assistant turn of the tool calls
  (`createReasoningStore`, by the id of the first call, 6 h, 500 entries).
- **Calls and results stay paired**: Anthropic and Google refuse a lone call,
  a lone result or duplicate ids. Placeholder ids of the core (`unknown`,
  `tool_call_unknown`) get a stable made-up id, results take the open calls in
  order, a call left alone gets `MISSING_OUTPUT`, an orphan result is dropped.
- **The completion is bounded like the core does** (`validateAiCompletion`):
  `content` a string or null, at most 20 tool calls, names
  `^[a-zA-Z0-9_-]{1,64}$`, `arguments` a JSON string, ids at most 128
  characters. `reasoning_details` never reach the core.
- **Errors inside an HTTP 200** (a top-level `error`, or a choice with
  `finish_reason: "error"`) are errors, by the code they carry
  (`errorInBody`).
- **Web search**: always the Exa engine (fixed price, same for every model;
  the native search of OpenAI would require clickable citations). The sources
  are a separate output, never mixed into the answer.
- **Scene events** once per transition: `error` when the failure kind changes,
  `recovered` at the first answer after. A refused request (`request` kind:
  HTTP 400, 403 moderation, refusal, content filter) starts nothing and does
  not change the status.
- **The API key** is a `secret`: never logged, never in /data, never in an
  error message (`maskKeys` hides `sk-or-…` and `Bearer …`). The attribution
  headers carry the repository URL and "Gladys Assistant" only.
- **The container rootfs is read-only.** Write only under `/data` (usage
  counters, written at most every 10 s and at shutdown).
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in en, fr, de, es; `test/i18n.test.js` checks it.
  German says "du", Spanish "usted". Tile labels stay within about 15
  characters (the dashboard truncates them).
- **Widget images.** After any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Logo**: the OpenRouter mark (simple-icons, CC0 path) names the service
  only; keep the "not affiliated" notices.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- A wrong or revoked key is a 401 "User not found."; `GET /key` proves the
  key without spending anything. `GET /credits` needs a management key: not
  used.
- A 404 "No endpoints found" is a wrong model id, or a privacy setting that
  leaves no provider (free models usually need data collection allowed).
- `usage.cost` is in credits (1 credit = 1 US dollar), present on every
  non-streaming answer.
- An alias answers with the id of its target in `model`
  (`anthropic/claude-haiku-5.5`); a router answers with the model it picked.
- Free models: 20 requests a minute, 50 a day (1,000 after 10 credits bought);
  the router counts one request per chat message.
- `max_tokens` counts the reasoning: a `length` answer may carry no text.
- `AbortSignal.timeout` does not keep the process alive: a test that waits on
  it needs its own timer.
- `node --test` also runs `test/helpers/`: nothing starts on import.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
