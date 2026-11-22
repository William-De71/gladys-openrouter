// -----------------------------------------------------------------------------
// The AI provider: one OpenAI chat completion in, one out, answered through
// OpenRouter.
//
// The whole agentic loop (prompts, tools, history) stays in the Gladys core:
// this handler picks the model, prepares the request (convert.js), calls
// /chat/completions and bounds the answer. It runs no tool.
//
// What each `purpose` gets:
//   - `intent-classification` (the router, before every chat turn): the fast
//     model with the least reasoning it accepts, under 18 s (the core waits
//     20 s);
//   - `chat`, `weekly-digest` and anything else: the main model at the
//     reasoning level of the configuration, under 110 s (the core waits 120 s).
// -----------------------------------------------------------------------------

import { AI_CHAT_PURPOSES, createLogger } from '@gladysassistant/integration-sdk';
import { MAX_TOKENS_MAX, providerFor, resolveModel } from './config.js';
import { effortFor } from './catalog.js';
import {
  createReasoningStore,
  hasImages,
  toOpenAiCompletion,
  toOpenRouterMessages,
  toOpenRouterToolChoice,
  toOpenRouterTools,
} from './convert.js';
import { ERROR_KINDS, OpenRouterError } from './openrouter-api.js';

const logger = createLogger({ name: 'chat' });

export const CHAT_TIMEOUT_MS = 110_000;
export const ROUTER_TIMEOUT_MS = 18_000;

/**
 * @description The use counted for a purpose.
 * @param {string} purpose - The `purpose` of the request.
 * @returns {string} `router`, `digest` or `chat`.
 */
export function useOf(purpose) {
  if (purpose === AI_CHAT_PURPOSES.INTENT_CLASSIFICATION) {
    return 'router';
  }
  if (purpose === AI_CHAT_PURPOSES.WEEKLY_DIGEST) {
    return 'digest';
  }
  return 'chat';
}

/**
 * @description Build the OpenRouter request of a core request.
 * @param {object} request - `{ messages, tools?, tool_choice?, max_tokens?, purpose }`.
 * @param {object} config - The normalized config.
 * @param {object} [options] - Options.
 * @param {object} [options.catalog] - The model catalog (catalog.js).
 * @param {object} [options.reasoning] - The reasoning store.
 * @param {Set<string>} [options.noReasoning] - Models that refused `reasoning`.
 * @returns {object} The body.
 */
export function buildBody(
  request,
  config,
  { catalog, reasoning = createReasoningStore(), noReasoning = new Set() } = {},
) {
  const router = request?.purpose === AI_CHAT_PURPOSES.INTENT_CLASSIFICATION;
  const model = resolveModel(config, router ? 'fast_model' : 'model');
  if (!model) {
    throw new OpenRouterError(
      ERROR_KINDS.MODEL,
      'The configuration chooses another model but its id is empty',
    );
  }
  const body = {
    model,
    messages: toOpenRouterMessages(request?.messages, reasoning),
    // The caller's `max_tokens` is sized for an answer without reasoning.
    max_tokens: Math.min(
      MAX_TOKENS_MAX,
      Math.max(config.max_tokens, Number(request?.max_tokens) || 0),
    ),
    // A stable pseudonym, as OpenRouter asks (abuse detection), not a user id.
    user: 'gladys',
  };
  const tools = toOpenRouterTools(request?.tools);
  if (tools.length > 0) {
    body.tools = tools;
    const choice = toOpenRouterToolChoice(request?.tool_choice);
    if (choice !== undefined) {
      body.tool_choice = choice;
    }
  }
  if (!noReasoning.has(model)) {
    const effort = effortFor(catalog?.lookup(model), router ? 'none' : config.reasoning);
    if (effort !== undefined) {
      // Not `exclude: true`: the `reasoning_details` must come back, to be
      // passed back with the tool results (convert.js).
      body.reasoning = { effort };
    }
  }
  const provider = providerFor(config.privacy);
  if (provider) {
    body.provider = provider;
  }
  return body;
}

/**
 * @description Whether a refusal is about the `reasoning` parameter.
 * @param {unknown} err - The error.
 * @returns {boolean} True for a 400 that names it.
 */
function refusedReasoning(err) {
  return (
    err instanceof OpenRouterError &&
    err.kind === ERROR_KINDS.REQUEST &&
    err.status === 400 &&
    /reasoning|effort|thinking/i.test(err.message)
  );
}

/**
 * @description Create the `onAiChat` handler.
 * @param {object} options - Options.
 * @param {object} options.client - The OpenRouter client.
 * @param {() => object} options.getConfig - The normalized config.
 * @param {object} [options.catalog] - The model catalog.
 * @param {object} [options.usage] - The usage store (usage.js).
 * @param {(err: OpenRouterError, context: object) => void} [options.onFailure] - Failure hook.
 * @param {() => void} [options.onSuccess] - Success hook.
 * @param {() => number} [options.now] - Clock.
 * @returns {(request: object) => Promise<object>} The handler.
 */
export function createChatHandler({
  client,
  getConfig,
  catalog,
  usage,
  onFailure = () => {},
  onSuccess = () => {},
  now = Date.now,
}) {
  // Models that refused `reasoning`: never sent to them again until the
  // integration restarts.
  const noReasoning = new Set();
  const reasoning = createReasoningStore({ now });
  const name = (id) => catalog?.name(id) ?? id;

  return async function onAiChat(request) {
    const config = getConfig();
    const use = useOf(request?.purpose);
    const router = use === 'router';
    const timeoutMs = router ? ROUTER_TIMEOUT_MS : CHAT_TIMEOUT_MS;
    const started = now();
    let body;
    try {
      // The catalog only refines the request: never wait for it on the router.
      if (catalog && !router) {
        await catalog.ensure();
      }
      body = buildBody(request, config, { catalog, reasoning, noReasoning });
      let response;
      try {
        response = await client.chat(body, { timeoutMs });
      } catch (err) {
        if (!body.reasoning || !refusedReasoning(err)) {
          throw err;
        }
        logger.warn(
          `${body.model} refused reasoning effort ${body.reasoning.effort}: sent without it from now on`,
        );
        noReasoning.add(body.model);
        const { reasoning: _dropped, ...rest } = body;
        body = rest;
        response = await client.chat(body, {
          timeoutMs: Math.max(1000, timeoutMs - (now() - started)),
        });
      }
      const raw = response?.choices?.[0]?.message ?? {};
      const completion = toOpenAiCompletion(response, { reasoning });
      const message = completion.choices[0].message;
      const finish = completion.choices[0].finish_reason;
      const ms = now() - started;
      if (!message.content && !message.tool_calls) {
        if (typeof raw.refusal === 'string' && raw.refusal) {
          throw new OpenRouterError(
            ERROR_KINDS.REQUEST,
            `The model refused to answer: ${raw.refusal.slice(0, 200)}`,
          );
        }
        if (finish === 'length') {
          throw new OpenRouterError(
            ERROR_KINDS.REQUEST,
            `The answer was cut at max_tokens (${body.max_tokens}) before any text: raise it in the configuration`,
          );
        }
        if (finish === 'content_filter') {
          throw new OpenRouterError(ERROR_KINDS.REQUEST, 'The provider filtered the answer');
        }
      }
      if (finish === 'length') {
        logger.warn(
          `The answer hit max_tokens (${body.max_tokens}): raise it in the configuration`,
        );
      }
      // The routers (`openrouter/auto`, `openrouter/free`) name the model
      // that answered; an alias names its target, which the catalog knows.
      const answeredBy =
        typeof response?.model === 'string' &&
        response.model &&
        response.model !== body.model &&
        response.model !== catalog?.lookup(body.model)?.target
          ? ` via ${response.model}`
          : '';
      const cost = Number(response?.usage?.cost);
      logger.info(
        `${request?.purpose ?? 'chat'}: ${name(body.model)}${answeredBy} answered in ${(ms / 1000).toFixed(1)} s` +
          ` (${response?.usage?.prompt_tokens ?? '?'} in, ${response?.usage?.completion_tokens ?? '?'} out` +
          `${Number.isFinite(cost) ? `, $${cost.toFixed(6)}` : ''}` +
          `${message.tool_calls ? `, ${message.tool_calls.length} tool call(s)` : ''})`,
      );
      usage?.recordSuccess({ use, model: body.model, usage: response?.usage, ms });
      onSuccess();
      return completion;
    } catch (err) {
      const error =
        err instanceof OpenRouterError
          ? err
          : new OpenRouterError(ERROR_KINDS.SERVER, err?.message ?? String(err));
      if (hasImages(request?.messages) && error.kind === ERROR_KINDS.REQUEST) {
        error.message += ' (the request carried an image: choose a model that reads images)';
      }
      logger.warn(`${request?.purpose ?? 'chat'} failed (${error.kind}): ${error.message}`);
      usage?.recordError({ use, model: body?.model, kind: error.kind, message: error.message });
      onFailure(error, { use, model: body?.model });
      throw error;
    }
  };
}
