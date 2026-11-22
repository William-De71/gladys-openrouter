// -----------------------------------------------------------------------------
// Scene action `web_search`: a question answered by the chat model with
// OpenRouter's web plugin (`plugins: [{ id: "web" }]`, docs:
// guides/features/plugins/web-search). The chat of Gladys has no web access;
// this action gives a scene a fresh answer ("the news of the day", "is the A7
// motorway blocked?") to send in a notification.
//
// The engine is Exa, always: about $0.007 a search for 5 results, billed by
// OpenRouter on top of the tokens, the same whatever the model. The "native"
// search of some providers would cost their own price and, for OpenAI,
// require the sources to be shown as clickable links, which an SMS or a
// voice message cannot do. The sources come back as `url_citation`
// annotations: they are returned as a separate output, never mixed into the
// answer.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { providerFor, resolveModel } from './config.js';
import { textOf } from './convert.js';
import { ERROR_KINDS, OpenRouterError } from './openrouter-api.js';

const logger = createLogger({ name: 'web-search' });

export const WEB_SEARCH_TIMEOUT_MS = 85_000;
export const SEARCH_RESULTS = 5;
const MAX_QUESTION = 1000;
const MAX_ANSWER = 10_000;
const MAX_SOURCES = 5;

const INSTRUCTIONS =
  'You answer for a home automation scene: the text may be read aloud or sent as a phone notification. ' +
  'Use the web results when the question needs fresh facts. Answer in the language of the question, briefly ' +
  '(a few sentences), in plain text without Markdown, links or source list.';

/**
 * @description The answer and the sources of a completion.
 * @param {object} response - The chat completion.
 * @returns {{ answer: string, sources: Array<{ title: string, url: string }> }} What was found.
 */
export function readAnswer(response) {
  const message = response?.choices?.[0]?.message ?? {};
  const sources = [];
  const seen = new Set();
  for (const annotation of Array.isArray(message.annotations) ? message.annotations : []) {
    if (annotation?.type !== 'url_citation') {
      continue;
    }
    const citation = annotation.url_citation ?? {};
    const url =
      typeof citation.url === 'string' && /^https?:\/\//.test(citation.url) ? citation.url : '';
    const title = String(citation.title ?? '').trim();
    const key = url || title;
    if (key && !seen.has(key)) {
      seen.add(key);
      sources.push({ title, url });
    }
  }
  // Some models still write "[1]" style markers: they mean nothing in an SMS.
  const answer = textOf(message.content)
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '')
    .trim();
  return { answer, sources };
}

/**
 * @description The sources as one text: "Title — https://…" per line.
 * @param {Array<{ title: string, url: string }>} sources - The sources.
 * @returns {string} The lines.
 */
export function formatSources(sources) {
  return sources
    .slice(0, MAX_SOURCES)
    .map(({ title, url }) => [title, url].filter(Boolean).join(' — '))
    .join('\n');
}

/**
 * @description Create the scene action handler.
 * @param {object} options - Options.
 * @param {object} options.client - The OpenRouter client.
 * @param {() => object} options.getConfig - The normalized config.
 * @param {object} [options.usage] - The usage store.
 * @param {(err: OpenRouterError, context: object) => void} [options.onFailure] - Failure hook.
 * @param {() => void} [options.onSuccess] - Success hook.
 * @param {() => number} [options.now] - Clock.
 * @returns {(fields: object) => Promise<object>} The handler: `{ answer, sources }`.
 */
export function createWebSearchHandler({
  client,
  getConfig,
  usage,
  onFailure = () => {},
  onSuccess = () => {},
  now = Date.now,
}) {
  return async function webSearch(fields = {}) {
    const question = String(fields.question ?? '').trim();
    if (!question) {
      throw new Error('The question is empty');
    }
    const config = getConfig();
    const model = resolveModel(config, 'model');
    const started = now();
    try {
      if (!model) {
        throw new OpenRouterError(
          ERROR_KINDS.MODEL,
          'The configuration chooses another model but its id is empty',
        );
      }
      const extra = String(fields.instructions ?? '').trim();
      const body = {
        model,
        messages: [
          {
            role: 'system',
            content: extra ? `${INSTRUCTIONS}\n${extra.slice(0, MAX_QUESTION)}` : INSTRUCTIONS,
          },
          { role: 'user', content: question.slice(0, MAX_QUESTION) },
        ],
        plugins: [{ id: 'web', engine: 'exa', max_results: SEARCH_RESULTS }],
        max_tokens: config.max_tokens,
        user: 'gladys',
      };
      const provider = providerFor(config.privacy);
      if (provider) {
        body.provider = provider;
      }
      const response = await client.chat(body, { timeoutMs: WEB_SEARCH_TIMEOUT_MS });
      const { answer, sources } = readAnswer(response);
      if (!answer) {
        throw new OpenRouterError(
          ERROR_KINDS.SERVER,
          'The model returned no text for this question',
        );
      }
      const ms = now() - started;
      logger.info(
        `web search: answered in ${(ms / 1000).toFixed(1)} s with ${sources.length} source(s)`,
      );
      usage?.recordSuccess({ use: 'web', model, usage: response?.usage, ms });
      onSuccess();
      return { answer: answer.slice(0, MAX_ANSWER), sources: formatSources(sources) };
    } catch (err) {
      const error =
        err instanceof OpenRouterError
          ? err
          : new OpenRouterError(ERROR_KINDS.SERVER, err?.message ?? String(err));
      logger.warn(`web search failed (${error.kind}): ${error.message}`);
      usage?.recordError({ use: 'web', model, kind: error.kind, message: error.message });
      onFailure(error, { use: 'web', model });
      throw error;
    }
  };
}
