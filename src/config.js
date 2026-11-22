// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the administrator in Gladys from the `config_schema` of the
// manifest; the SDK fetches it (`gladys.getConfig()`) and notifies every
// change (`gladys.onConfigUpdated()`). This module provides the defaults and
// normalizes what arrives, so the rest of the code never deals with
// `undefined`, a number typed as a string, or a model the select no longer
// offers.
// -----------------------------------------------------------------------------

/**
 * The models offered in the Configuration screen. Users store these values
 * forever, so they are OpenRouter's `~vendor/family-latest` aliases (moved by
 * OpenRouter to the newest model of the family) and its routers, not dated
 * model ids that would age within months. Checked against
 * https://openrouter.ai/api/v1/models on 2026-11-22. `custom` hands the
 * choice to the free `custom_model` field (any of the 400+ model ids).
 *
 * `name` is shown until the live catalog (catalog.js) gives the real one,
 * "Claude Haiku 5.5" for `~anthropic/claude-haiku-latest`.
 */
export const MODELS = {
  '~anthropic/claude-haiku-latest': { name: 'Claude Haiku (latest)' },
  '~anthropic/claude-sonnet-latest': { name: 'Claude Sonnet (latest)' },
  '~openai/gpt-terra-latest': { name: 'GPT Terra (latest)' },
  '~openai/gpt-luna-latest': { name: 'GPT Luna (latest)' },
  '~google/gemini-flash-latest': { name: 'Gemini Flash (latest)' },
  '~deepseek/deepseek-flash-latest': { name: 'DeepSeek Flash (latest)' },
  'openrouter/auto': { name: 'Auto Router' },
  'openrouter/free': { name: 'Free Models Router' },
};

/** The values of each select, in the order of the manifest. */
export const CHAT_MODELS = [
  '~anthropic/claude-haiku-latest',
  '~anthropic/claude-sonnet-latest',
  '~openai/gpt-terra-latest',
  '~openai/gpt-luna-latest',
  '~google/gemini-flash-latest',
  '~deepseek/deepseek-flash-latest',
  'openrouter/auto',
  'openrouter/free',
];
export const ROUTER_MODELS = [
  '~openai/gpt-luna-latest',
  '~anthropic/claude-haiku-latest',
  '~deepseek/deepseek-flash-latest',
  'openrouter/free',
];

export const CUSTOM_MODEL = 'custom';

/** The reasoning levels of the configuration (`reasoning` select). */
export const REASONING_LEVELS = ['none', 'low', 'medium', 'high'];

/**
 * Who may serve the requests (`privacy` select):
 *   - `standard`     any provider of the model (OpenRouter's default);
 *   - `no_training`  only providers that do not store or train on the data
 *                    (`provider.data_collection: "deny"`);
 *   - `zdr`          only zero-data-retention endpoints (`provider.zdr`).
 */
export const PRIVACY_LEVELS = ['standard', 'no_training', 'zdr'];

/** An OpenRouter model id typed by hand: `vendor/model[:variant]`, or an alias. */
const MODEL_ID_PATTERN = /^~?[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;

/** Bounds of the `max_tokens` field, mirrored by the manifest. */
export const MAX_TOKENS_MIN = 1024;
export const MAX_TOKENS_MAX = 32000;

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // The OpenRouter API key. A `secret` field: no default, never logged.
  api_key: '',
  // The model of the chat, the scene `ai.ask` action, the weekly digest and
  // the web search action. Claude Haiku: reliable tool calls, low price.
  model: '~anthropic/claude-haiku-latest',
  // The model of the intent router, which runs before every chat turn and must
  // answer within 20 s: a fast, cheap model that can skip reasoning.
  fast_model: '~openai/gpt-luna-latest',
  // The id used by a select set to "custom".
  custom_model: '',
  // How hard the chat model thinks, when it can.
  reasoning: 'low',
  // Output budget of one answer (reasoning included).
  max_tokens: 8000,
  // Which providers may see the requests.
  privacy: 'standard',
};

/**
 * @description Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] - Config returned by the SDK.
 * @returns {object} The normalized config.
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const customModel = String(config.custom_model ?? '').trim();
  return {
    api_key: String(config.api_key ?? '').trim(),
    model: pickModel(config.model, CHAT_MODELS, DEFAULT_CONFIG.model),
    fast_model: pickModel(config.fast_model, ROUTER_MODELS, DEFAULT_CONFIG.fast_model),
    custom_model: MODEL_ID_PATTERN.test(customModel) ? customModel : '',
    reasoning: REASONING_LEVELS.includes(config.reasoning)
      ? config.reasoning
      : DEFAULT_CONFIG.reasoning,
    max_tokens: clampInteger(config.max_tokens, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
    privacy: PRIVACY_LEVELS.includes(config.privacy) ? config.privacy : DEFAULT_CONFIG.privacy,
  };
}

/**
 * @description The model id to call for a select value.
 * @param {object} config - The normalized config.
 * @param {'model'|'fast_model'} key - Which select.
 * @returns {string|null} The API model id, null when "custom" has no id.
 */
export function resolveModel(config, key) {
  const value = config[key];
  if (value === CUSTOM_MODEL) {
    return config.custom_model || null;
  }
  return value;
}

/**
 * @description The display name of a model id without the catalog.
 * @param {string} id - An API model id.
 * @returns {string} "Claude Haiku (latest)", or the id itself.
 */
export function presetName(id) {
  return MODELS[id]?.name ?? id;
}

/**
 * @description The `provider` routing object of a privacy level.
 * @param {string} privacy - One of PRIVACY_LEVELS.
 * @returns {object|undefined} The object to send, undefined for the default.
 */
export function providerFor(privacy) {
  if (privacy === 'no_training') {
    return { data_collection: 'deny' };
  }
  if (privacy === 'zdr') {
    return { data_collection: 'deny', zdr: true };
  }
  return undefined;
}

/**
 * @description Whether a model id is one of the free variants or the free
 * router (rate limited by OpenRouter: 20 a minute, 50 or 1,000 a day).
 * @param {string|null} id - The model id.
 * @returns {boolean} True for `…:free` and `openrouter/free`.
 */
export function isFreeModel(id) {
  return typeof id === 'string' && (id.endsWith(':free') || id === 'openrouter/free');
}

/**
 * @description A select value kept when offered by that select, else the default.
 * @param {unknown} value - The value.
 * @param {Array<string>} offered - The values of the select.
 * @param {string} fallback - The default.
 * @returns {string} A model id or "custom".
 */
function pickModel(value, offered, fallback) {
  if (value === CUSTOM_MODEL || offered.includes(value)) {
    return value;
  }
  return fallback;
}

/**
 * @description An integer within bounds.
 * @param {unknown} value - The value.
 * @param {number} min - The minimum.
 * @param {number} max - The maximum.
 * @returns {number} The integer.
 */
function clampInteger(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) {
    return DEFAULT_CONFIG.max_tokens;
  }
  return Math.min(max, Math.max(min, number));
}
