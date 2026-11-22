import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_TTL_MS, createCatalog, effortFor, summarize } from '../src/catalog.js';
import { MODELS } from './helpers/fake-openrouter.js';

test('a catalog entry keeps the name behind an alias, the efforts, tools and images', () => {
  assert.deepEqual(summarize(MODELS[0]), {
    id: '~anthropic/claude-haiku-latest',
    name: 'Claude Haiku 5.5',
    target: 'anthropic/claude-haiku-5.5',
    efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
    mandatory: false,
    reasons: true,
    tools: true,
    images: true,
  });
  const qwen = summarize(MODELS.find((model) => model.id === 'qwen/qwen3.8-flash'));
  assert.equal(qwen.name, 'Qwen3.8 Flash');
  assert.equal(qwen.tools, false);
  assert.equal(qwen.images, false);
  assert.equal(qwen.reasons, false);
  assert.equal(summarize({ id: 'a/b' }).tools, null, 'unknown, not false');
});

test('the effort is the closest level the model accepts, the lower one on a tie', () => {
  const sonnet = summarize(MODELS[1]);
  assert.equal(effortFor(sonnet, 'none'), 'low');
  assert.equal(effortFor(sonnet, 'medium'), 'medium');
  const deepseek = { efforts: ['max', 'high', 'low', 'none'], reasons: true };
  assert.equal(effortFor(deepseek, 'medium'), 'low');
  assert.equal(effortFor({ efforts: ['high', 'none'], reasons: true }, 'low'), 'none');
  assert.equal(effortFor(undefined, 'none'), undefined);
  assert.equal(effortFor(undefined, 'high'), 'high');
  assert.equal(effortFor({ efforts: null, reasons: false }, 'high'), undefined);
});

test('the catalog is read once, again after 12 hours, and kept on failure', async () => {
  let now = 1_000_000;
  let calls = 0;
  let fail = false;
  const errors = [];
  const catalog = createCatalog({
    fetchModels: async () => {
      calls += 1;
      if (fail) {
        throw new Error('down');
      }
      return MODELS;
    },
    now: () => now,
    onError: (err) => errors.push(err.message),
  });
  assert.equal(catalog.name('~openai/gpt-luna-latest'), 'GPT Luna (latest)', 'preset name before');
  await catalog.ensure();
  await catalog.ensure();
  assert.equal(calls, 1);
  assert.equal(catalog.name('~openai/gpt-luna-latest'), 'GPT-6 Luna');
  assert.equal(catalog.lookup('nope/model'), undefined);
  now += CATALOG_TTL_MS + 1;
  fail = true;
  await catalog.ensure();
  assert.equal(calls, 2);
  assert.deepEqual(errors, ['down']);
  assert.equal(catalog.name('~openai/gpt-luna-latest'), 'GPT-6 Luna', 'the old list stays');
  await catalog.ensure();
  assert.equal(calls, 2, 'no new try within 10 minutes of a failure');
  assert.equal(catalog.name(null), '–');
});
