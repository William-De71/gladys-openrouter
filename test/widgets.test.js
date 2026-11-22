import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { buildUsageWidget, compactTokens, formatCost, keyTile } from '../src/widgets.js';
import { KEY } from './helpers/fake-openrouter.js';

const NOW = Date.UTC(2026, 10, 1, 17, 0, 0);
const day = (date, tokens, cost) => ({ date, tokens, cost });
const snapshot = {
  today_key: '2026-11-01',
  today: {
    requests: 42,
    errors: 2,
    prompt_tokens: 180_000,
    completion_tokens: 12_400,
    cost: 0.0312,
    by_use: {},
  },
  month: {
    requests: 420,
    errors: 2,
    prompt_tokens: 1_800_000,
    completion_tokens: 124_000,
    cost: 1.27,
  },
  days: [
    day('2026-10-30', 95_000, 0.016),
    day('2026-10-31', 240_000, 0.041),
    day('2026-11-01', 192_400, 0.0312),
  ],
  last_request: {
    at: NOW - 120_000,
    use: 'chat',
    model: '~anthropic/claude-haiku-latest',
    ms: 6400,
    ok: true,
  },
  last_error: {
    at: NOW - 3_600_000,
    use: 'router',
    model: '~openai/gpt-luna-latest',
    kind: 'rate_limit',
    message: 'HTTP 429',
  },
};
const free = {
  ...snapshot,
  today: { ...snapshot.today, cost: 0 },
  month: { ...snapshot.month, cost: 0 },
  days: snapshot.days.map((entry) => ({ ...entry, cost: 0 })),
};
const empty = {
  today_key: '2026-11-01',
  today: { requests: 0, errors: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0, by_use: {} },
  month: { requests: 0, errors: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0 },
  days: [],
  last_request: null,
  last_error: null,
};
const NAMES = {
  '~anthropic/claude-haiku-latest': 'Claude Haiku 5.5',
  '~openai/gpt-luna-latest': 'GPT-6 Luna',
};
const modelName = (id) => NAMES[id] ?? id;

const budget = (content) => {
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8, `${content.components.length} components`);
  assert.ok(count(['value', 'gauge']) <= 6);
  assert.ok(count(['text']) <= 2);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['status']) <= 1);
  assert.ok(count(['button']) <= 4);
};

test('every state gives a valid content within the budget, in every language', () => {
  const configured = normalizeConfig({ api_key: 'k' });
  const cases = [
    { snapshot, config: configured, failing: null, key: KEY },
    { snapshot, config: configured, failing: { kind: 'auth', since: NOW - 600_000 } },
    {
      snapshot: empty,
      config: configured,
      failing: null,
      key: { ...KEY, limit: null, limit_remaining: null },
    },
    { snapshot: free, config: configured, failing: null, key: { ...KEY, limit_remaining: 0 } },
    { snapshot, config: normalizeConfig(), failing: null, key: KEY },
    {
      snapshot,
      config: normalizeConfig({
        api_key: 'k',
        model: 'custom',
        custom_model: 'mistralai/mistral-large-4-0',
      }),
      failing: null,
    },
  ];
  for (const language of LANGUAGES) {
    for (const options of cases) {
      const content = buildUsageWidget({
        ...options,
        modelName,
        language,
        now: NOW,
        timeZone: 'Europe/Paris',
      });
      assert.deepEqual(validateWidgetContent(content), [], language);
      budget(content);
    }
  }
});

test('the numbers of the day, the cost per day, the credit left, the failing state', () => {
  const content = buildUsageWidget({
    snapshot,
    config: normalizeConfig({ api_key: 'k' }),
    failing: { kind: 'rate_limit', since: NOW - 600_000 },
    key: KEY,
    modelName,
    language: 'fr',
    now: NOW,
    timeZone: 'Europe/Paris',
  });
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [42, formatCost(0.0312, 'fr'), formatCost(1.27, 'fr'), 2, formatCost(8.5, 'fr')],
  );
  assert.equal(tiles[3].color, 'warning');
  assert.equal(tiles[4].color, 'success');
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.unit, 'USD');
  assert.deepEqual(
    chart.series[0].points.map((point) => point.v),
    [0.016, 0.041, 0.0312],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].color, 'danger');
  assert.match(status.items[0].value, /En erreur depuis 17:50/);
  assert.equal(status.items[1].value, 'Claude Haiku 5.5 · GPT-6 Luna');
  assert.match(status.items[2].value, /discussion, il y a 2 min \(6,4 s\)/);
  const link = content.components.find((c) => c.type === 'button');
  assert.equal(link.link.url, 'https://openrouter.ai/activity');
});

test('free use: tokens per day, and the free requests left when the key has no limit', () => {
  const content = buildUsageWidget({
    snapshot: free,
    config: normalizeConfig({ api_key: 'k' }),
    failing: null,
    key: {
      ...KEY,
      limit: null,
      limit_remaining: null,
      free_model_daily_requests: { used: 45, limit: 50, remaining: 5 },
    },
    modelName,
    language: 'en',
    now: NOW,
  });
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.unit, 'tokens');
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.equal(tiles[4].value, '5/50');
  assert.equal(tiles[4].color, 'warning');
});

test('without a key: a message instead of the chart, no credit tile', () => {
  const content = buildUsageWidget({
    snapshot,
    config: normalizeConfig(),
    failing: null,
    key: KEY,
    language: 'en',
    now: NOW,
  });
  assert.ok(content.components.some((c) => c.type === 'text' && c.variant === 'body'));
  assert.ok(!content.components.some((c) => c.type === 'chart'));
  assert.equal(content.components.filter((c) => c.type === 'value').length, 4);
});

test('amounts and token counts stay short', () => {
  assert.equal(formatCost(0, 'en'), '$0');
  assert.equal(formatCost(0.0042, 'en'), '$0.0042');
  assert.equal(formatCost(1.27, 'en'), '$1.27');
  assert.ok(formatCost(1.27, 'fr').includes('1,27'));
  assert.ok(formatCost(123456.78, 'de').length <= 12);
  assert.equal(formatCost(NaN, 'en'), '$0');
  assert.equal(compactTokens(850, 'en'), '850');
  assert.equal(compactTokens(12_400, 'en'), '12.4K');
  assert.equal(compactTokens(NaN, 'fr'), '0');
  assert.equal(keyTile(null, 'en'), null);
  assert.equal(keyTile({ limit_remaining: 0, limit: 10 }, 'en').color, 'danger');
  assert.equal(keyTile({ limit_remaining: 0.5, limit: 10 }, 'en').color, 'warning');
  assert.equal(keyTile({}, 'en'), null);
});
