// -----------------------------------------------------------------------------
// Dashboard widget of the OpenRouter integration.
//
//   - `usage`  what the assistant consumed through OpenRouter: requests, cost
//              of the day and of the month, errors of the day, and what the
//              key has left (its credit limit, or the free requests of the
//              day) (tiles); cost per day over 30 days, or tokens when every
//              request was free (bar chart); the state, the models, the last
//              answer and the last error (status); a link to the activity
//              page of OpenRouter, the reference for the bill.
//
// Counted by the integration from the `usage` of every answer (usage.js):
// requests made outside Gladys with the same key are not in it. What the key
// has left comes from GET /key, read at most every 5 minutes. Every text
// exists in the four languages (the content is cached per language). Budget
// of a card: 8 components, 1 main one, 6 tiles, 2 texts (1 body), 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { resolveModel } from './config.js';
import { ago, formatNumber, t } from './i18n.js';
import { formatTime } from './time.js';

export const WIDGETS = { USAGE: 'usage' };
const TTL_SECONDS = 60;
export const ACTIVITY_URL = 'https://openrouter.ai/activity';

const LOCALES = ['en', 'fr', 'de', 'es'];

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A token count, short: "850", "12.4K" / "12,4 k".
 * @param {number} value - Tokens.
 * @param {string} language - The language.
 * @returns {string} The text (≤ 12 characters).
 */
export function compactTokens(value, language) {
  const number = Number.isFinite(value) ? value : 0;
  return clip(
    new Intl.NumberFormat(LOCALES.includes(language) ? language : 'en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(number),
    12,
  );
}

/**
 * @description An amount of credits (US dollars): two decimals, four below
 * one cent, "$0" for nothing — "$0.0042", "1,27 $US".
 * @param {number} value - Dollars.
 * @param {string} language - The language.
 * @returns {string} The text (≤ 12 characters).
 */
export function formatCost(value, language) {
  const number = Number.isFinite(value) && value > 0 ? value : 0;
  const digits = number === 0 ? 0 : number < 0.01 ? 4 : 2;
  return clip(
    new Intl.NumberFormat(LOCALES.includes(language) ? language : 'en', {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(number),
    12,
  );
}

/**
 * @description The tile of what the key has left, if the key says it.
 * @param {object|null} key - `data` of GET /key.
 * @param {string} language - The language.
 * @returns {object|null} A `value` component.
 */
export function keyTile(key, language) {
  if (!key) {
    return null;
  }
  const remaining = Number(key.limit_remaining);
  if (
    key.limit_remaining !== null &&
    key.limit_remaining !== undefined &&
    Number.isFinite(remaining)
  ) {
    const limit = Number(key.limit);
    const low = Number.isFinite(limit) && limit > 0 ? remaining / limit < 0.1 : remaining < 1;
    return {
      type: 'value',
      label: clip(t('tileKeyLeft', language), 24),
      value: formatCost(Math.max(0, remaining), language),
      icon: 'credit-card',
      color:
        remaining <= 0 ? WIDGET_COLORS.DANGER : low ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    };
  }
  const free = key.free_model_daily_requests;
  if (free && Number.isFinite(Number(free.remaining)) && Number.isFinite(Number(free.limit))) {
    const left = Math.max(0, Number(free.remaining));
    return {
      type: 'value',
      label: clip(t('tileFreeLeft', language), 24),
      value: `${left}/${Number(free.limit)}`,
      icon: 'gift',
      color:
        left === 0
          ? WIDGET_COLORS.DANGER
          : left < Number(free.limit) / 5
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.SUCCESS,
    };
  }
  return null;
}

/**
 * @description The "usage" widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - `usage.snapshot()`.
 * @param {object} options.config - The normalized config.
 * @param {object|null} options.failing - `events.state()`.
 * @param {object|null} [options.key] - `data` of GET /key, when known.
 * @param {(id: string|null) => string} [options.modelName] - Display names.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @returns {object} The content.
 */
export function buildUsageWidget({
  snapshot,
  config,
  failing,
  key = null,
  modelName = (id) => id ?? '–',
  language,
  now,
  timeZone,
}) {
  const time = (instant) => formatTime(instant, { language, timeZone, now });
  const chat = resolveModel(config, 'model');
  const router = resolveModel(config, 'fast_model');
  const components = [];

  if (!config.api_key) {
    components.push({ type: 'text', variant: 'body', text: clip(t('widgetNoKey', language), 300) });
  }

  const today = snapshot.today;
  components.push(
    {
      type: 'value',
      label: clip(t('tileRequestsToday', language), 24),
      value: today.requests,
      icon: 'message-circle',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: clip(t('tileCostToday', language), 24),
      value: formatCost(today.cost, language),
      icon: 'dollar-sign',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      label: clip(t('tileCostMonth', language), 24),
      value: formatCost(snapshot.month.cost, language),
      icon: 'calendar',
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      label: clip(t('tileErrorsToday', language), 24),
      value: today.errors,
      icon: 'alert-triangle',
      color: today.errors > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    },
  );
  const left = config.api_key ? keyTile(key, language) : null;
  if (left) {
    components.push(left);
  }

  // Without a key the body text takes the place of the chart (8 components).
  const paid = snapshot.days.some((day) => day.cost > 0);
  if (config.api_key && snapshot.days.some((day) => day.tokens > 0)) {
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: clip(t(paid ? 'chartCostTitle' : 'chartTokensTitle', language), 60),
      unit: paid ? 'USD' : 'tokens',
      series: [
        {
          name: t(paid ? 'chartCostSeries' : 'chartTokensSeries', language),
          points: snapshot.days.map((day) => ({
            t: `${day.date}T12:00:00Z`,
            v: paid ? Math.round(day.cost * 10000) / 10000 : day.tokens,
          })),
        },
      ],
    });
  }

  const items = [];
  if (failing) {
    items.push({
      label: clip(t('rowState', language), 40),
      value: clip(t('stateFailing', language, { time: time(failing.since) }), 40),
      color: WIDGET_COLORS.DANGER,
    });
  } else {
    items.push({
      label: clip(t('rowState', language), 40),
      value: clip(t(config.api_key ? 'stateOk' : 'stateNoKey', language), 40),
      color: config.api_key ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }
  items.push({
    label: clip(t('rowModels', language), 40),
    value: clip(
      chat === router ? modelName(chat) : `${modelName(chat)} · ${modelName(router)}`,
      40,
    ),
    color: WIDGET_COLORS.NEUTRAL,
  });
  const last = snapshot.last_request;
  items.push({
    label: clip(t('rowLastRequest', language), 40),
    value: clip(
      last
        ? last.ok && last.ms
          ? t('valueLastRequestTime', language, {
              use: t(`use_${last.use}`, language),
              ago: ago(last.at, now, language),
              seconds: formatNumber(last.ms / 1000, language, 1),
            })
          : t('valueLastRequest', language, {
              use: t(`use_${last.use}`, language),
              ago: ago(last.at, now, language),
            })
        : t('never', language),
      40,
    ),
    color: !last ? WIDGET_COLORS.NEUTRAL : last.ok ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  });
  const error = snapshot.last_error;
  if (error) {
    items.push({
      label: clip(t('rowLastError', language), 40),
      value: clip(`${time(error.at)} · ${t(`kind_${error.kind}`, language)}`, 40),
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items });

  components.push({
    type: 'button',
    label: clip(t('buttonActivity', language), 24),
    icon: 'external-link',
    style: 'secondary',
    link: { url: ACTIVITY_URL },
  });

  return { ttl_seconds: TTL_SECONDS, components };
}
