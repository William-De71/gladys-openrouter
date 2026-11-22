// -----------------------------------------------------------------------------
// Connection status and the "Test the connection" action.
//
// The status shown in the Configuration screen says whether OpenRouter can
// answer: a key is there, OpenRouter accepts it (GET /key, which spends
// nothing), both chosen models exist in the catalog and can call tools (the
// assistant drives Gladys through tools). Only the test action spends a few
// tokens, on purpose, to show a real answer and its time.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isFreeModel, resolveModel } from './config.js';
import { effortFor } from './catalog.js';
import { ERROR_KINDS, OpenRouterError } from './openrouter-api.js';
import { all, t } from './i18n.js';

const logger = createLogger({ name: 'connection' });

const TEST_TIMEOUT_MS = 25_000;
const ROLES = [
  ['chat', 'model'],
  ['router', 'fast_model'],
];

/**
 * @description The localized reason of a failure.
 * @param {unknown} err - The error.
 * @param {string} name - The display name of the model concerned.
 * @returns {object} `{ en, fr, de, es }`.
 */
export function failureMessage(err, name) {
  const kind = err instanceof OpenRouterError ? err.kind : ERROR_KINDS.SERVER;
  switch (kind) {
    case ERROR_KINDS.AUTH:
      return all('statusBadKey');
    case ERROR_KINDS.CREDITS:
      return all('statusNoCredits');
    case ERROR_KINDS.MODEL:
      return all('statusNoModel', { model: name ?? '?' });
    case ERROR_KINDS.RATE_LIMIT:
      return all('statusRateLimited');
    case ERROR_KINDS.UNREACHABLE:
    case ERROR_KINDS.TIMEOUT:
      return all('statusUnreachable');
    default:
      return all('statusApiError', { detail: err?.message ?? String(err) });
  }
}

/**
 * @description Check the configuration against OpenRouter, without generating
 * text.
 * @param {object} client - The OpenRouter client.
 * @param {object} catalog - The model catalog.
 * @param {object} config - The normalized config.
 * @returns {Promise<{ ok: boolean, message?: object, warnings: Array<object>, key?: object }>} The result.
 */
export async function checkConnection(client, catalog, config) {
  if (!config.api_key) {
    return { ok: false, message: all('statusNoKey'), warnings: [] };
  }
  const warnings = [];
  for (const [, field] of ROLES) {
    if (!resolveModel(config, field)) {
      return { ok: false, message: all('statusNoCustom'), warnings };
    }
  }
  let key;
  try {
    key = await client.key();
  } catch (err) {
    logger.warn(`Key check failed: ${err?.message ?? err}`);
    return { ok: false, message: failureMessage(err), warnings };
  }
  await catalog.ensure();
  for (const model of new Set(ROLES.map(([, field]) => resolveModel(config, field)))) {
    const entry = catalog.lookup(model);
    if (catalog.loaded() && !entry) {
      return {
        ok: false,
        message: all('statusNoModel', { model }),
        warnings,
        key,
      };
    }
    if (entry?.tools === false) {
      warnings.push(all('statusNoTools', { model: catalog.name(model) }));
    }
  }
  const usesFree = ROLES.some(([, field]) => isFreeModel(resolveModel(config, field)));
  if (usesFree) {
    warnings.push(all('statusFreeLimits'));
  }
  if (key?.limit_remaining !== null && key?.limit_remaining !== undefined) {
    if (Number(key.limit_remaining) <= 0) {
      return { ok: false, message: all('statusNoCredits'), warnings, key };
    }
  }
  return { ok: true, warnings, key };
}

/**
 * @description The "Test the connection" action: one tiny real answer from
 * each model.
 * @param {object} client - The OpenRouter client.
 * @param {object} catalog - The model catalog.
 * @param {object} config - The normalized config.
 * @param {() => number} [now] - Clock.
 * @returns {Promise<object>} The message shown under the button, `{ en, fr, de, es }`.
 */
export async function testConnection(client, catalog, config, now = Date.now) {
  if (!config.api_key) {
    return all('statusNoKey');
  }
  await catalog.ensure();
  const lines = [];
  const tested = new Map();
  for (const [role, field] of ROLES) {
    const model = resolveModel(config, field);
    if (!model) {
      lines.push((language) => `${t(`role_${role}`, language)} — ${t('statusNoCustom', language)}`);
      continue;
    }
    if (tested.has(model)) {
      const same = tested.get(model);
      lines.push((language) => `${t(`role_${role}`, language)} — ${same(language)}`);
      continue;
    }
    const name = catalog.name(model);
    const started = now();
    let line;
    try {
      const effort = effortFor(catalog.lookup(model), 'none');
      const response = await client.chat(
        {
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
          ...(effort ? { reasoning: { effort } } : {}),
          user: 'gladys',
        },
        { timeoutMs: TEST_TIMEOUT_MS, retries: false },
      );
      const seconds = (now() - started) / 1000;
      const via =
        typeof response?.model === 'string' &&
        response.model &&
        response.model !== model &&
        response.model !== catalog.lookup(model)?.target
          ? response.model
          : null;
      line = (language) =>
        t(via ? 'testAnsweredVia' : 'testAnswered', language, {
          model: name,
          via,
          seconds: seconds.toLocaleString(language, { maximumFractionDigits: 1 }),
        });
    } catch (err) {
      logger.warn(`Test of ${model} failed: ${err?.message ?? err}`);
      const reason = failureMessage(err, name);
      line = (language) => reason[language];
    }
    tested.set(model, line);
    lines.push((language) => `${t(`role_${role}`, language)} — ${line(language)}`);
  }
  return all((language) => lines.map((line) => line(language)).join('\n'));
}
