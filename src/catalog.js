// -----------------------------------------------------------------------------
// The model catalog of OpenRouter (GET /models, ~900 KB, 400+ models).
//
// What it tells per model, and what it is used for:
//   - `name` and `alias_target`: "Claude Haiku 5.5" behind
//     `~anthropic/claude-haiku-latest`, for the logs, the status and the widget;
//   - `reasoning.supported_efforts` / `mandatory`: which `reasoning.effort`
//     to send (a model that cannot turn reasoning off gets its lowest level);
//   - `supported_parameters` includes `tools`: the assistant drives Gladys
//     through tools, a model without them gets a warning;
//   - `architecture.input_modalities` includes `image`: the chat images.
//
// Read at the first need and every 12 hours, only the fields above are kept.
// A failure keeps the last list: the catalog helps, it is never needed to
// answer.
// -----------------------------------------------------------------------------

import { presetName } from './config.js';

export const CATALOG_TTL_MS = 12 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

/** Reasoning levels from the least to the most, as OpenRouter names them. */
export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * @description The part of a catalog entry kept in memory.
 * @param {object} model - An entry of GET /models.
 * @returns {object} `{ id, name, target, efforts, mandatory, tools, images, free }`.
 */
export function summarize(model) {
  const efforts = Array.isArray(model?.reasoning?.supported_efforts)
    ? model.reasoning.supported_efforts.filter((effort) => EFFORT_ORDER.includes(effort))
    : null;
  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
  const inputs = Array.isArray(model?.architecture?.input_modalities)
    ? model.architecture.input_modalities
    : [];
  return {
    id: String(model?.id ?? ''),
    name: cleanName(model?.alias_target?.name ?? model?.name ?? model?.id),
    target: typeof model?.alias_target?.slug === 'string' ? model.alias_target.slug : null,
    efforts: efforts && efforts.length > 0 ? efforts : null,
    mandatory: model?.reasoning?.mandatory === true,
    reasons: parameters.includes('reasoning') || Boolean(efforts),
    tools: parameters.length === 0 ? null : parameters.includes('tools'),
    images: inputs.length === 0 ? null : inputs.includes('image'),
  };
}

/**
 * @description "Anthropic: Claude Haiku 5.5" -> "Claude Haiku 5.5".
 * @param {unknown} name - The catalog name.
 * @returns {string} The name without the vendor prefix.
 */
function cleanName(name) {
  const text = String(name ?? '').trim();
  const colon = text.indexOf(': ');
  return colon > 0 && colon < 30 ? text.slice(colon + 2) : text;
}

/**
 * @description The `reasoning.effort` to send for a model and a wanted level.
 * @param {object|undefined} entry - The catalog summary of the model.
 * @param {string} level - `none`, `low`, `medium` or `high`.
 * @returns {string|undefined} The effort, undefined to send no `reasoning`.
 */
export function effortFor(entry, level) {
  if (!entry || !entry.efforts) {
    // Unknown model, router, or a model without levels: nothing for "none"
    // (most models do not reason by default); else the level as asked,
    // OpenRouter maps or drops what a provider does not know.
    if (entry && entry.reasons === false) {
      return undefined;
    }
    return level === 'none' ? undefined : level;
  }
  if (entry.efforts.includes(level)) {
    return level;
  }
  // The closest level the model accepts; on a tie, the lower one (faster).
  const wanted = EFFORT_ORDER.indexOf(level);
  let best;
  let bestDistance = Infinity;
  for (const effort of entry.efforts) {
    const distance = Math.abs(EFFORT_ORDER.indexOf(effort) - wanted);
    if (
      distance < bestDistance ||
      (distance === bestDistance && EFFORT_ORDER.indexOf(effort) < EFFORT_ORDER.indexOf(best))
    ) {
      best = effort;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * @description Build the catalog cache.
 * @param {object} options - Options.
 * @param {() => Promise<Array<object>>} options.fetchModels - `client.models`.
 * @param {() => number} [options.now] - Clock.
 * @param {(err: Error) => void} [options.onError] - Failures (logged).
 * @returns {object} `{ refresh, ensure, lookup, name, loaded }`.
 */
export function createCatalog({ fetchModels, now = Date.now, onError = () => {} }) {
  let entries = new Map();
  let loadedAt = 0;
  let failedAt = 0;
  let pending = null;

  async function refresh() {
    if (pending) {
      return pending;
    }
    pending = (async () => {
      try {
        const models = await fetchModels();
        if (models.length > 0) {
          entries = new Map(models.map((model) => [String(model.id), summarize(model)]));
          loadedAt = now();
        }
      } catch (err) {
        failedAt = now();
        onError(err);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  return {
    refresh,

    /**
     * @description The catalog, read again when older than 12 hours (and not
     * after a failure of less than 10 minutes).
     * @returns {Promise<void>} When it is as fresh as it can be.
     */
    async ensure() {
      const stale = entries.size === 0 || now() - loadedAt > CATALOG_TTL_MS;
      const cooling = failedAt > 0 && now() - failedAt < RETRY_AFTER_FAILURE_MS;
      if (stale && !cooling) {
        await refresh();
      }
    },

    /**
     * @param {string|null} id - A model id.
     * @returns {object|undefined} Its summary.
     */
    lookup(id) {
      return id ? entries.get(id) : undefined;
    },

    /**
     * @param {string|null} id - A model id.
     * @returns {string} Its display name ("Claude Haiku 5.5"), or the id.
     */
    name(id) {
      if (!id) {
        return '–';
      }
      return entries.get(id)?.name || presetName(id);
    },

    /** @returns {boolean} Whether a list was read. */
    loaded() {
      return entries.size > 0;
    },
  };
}
