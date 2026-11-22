import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_MODELS,
  DEFAULT_CONFIG,
  isFreeModel,
  MODELS,
  normalizeConfig,
  presetName,
  providerFor,
  resolveModel,
  ROUTER_MODELS,
} from '../src/config.js';

test('defaults fill an empty or broken configuration', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  const config = normalizeConfig({
    api_key: '  sk-or-v1-abc  ',
    model: 'gpt-5',
    fast_model: 'custom',
    custom_model: 'bad id with spaces',
    reasoning: 'max',
    max_tokens: '999999',
    privacy: 'paranoid',
  });
  assert.equal(config.api_key, 'sk-or-v1-abc');
  assert.equal(config.model, '~anthropic/claude-haiku-latest', 'an unknown model falls back');
  assert.equal(config.fast_model, 'custom');
  assert.equal(config.custom_model, '', 'an id that cannot be a model id is ignored');
  assert.equal(config.reasoning, 'low');
  assert.equal(config.max_tokens, 32000);
  assert.equal(config.privacy, 'standard');
  assert.equal(normalizeConfig({ max_tokens: 'x' }).max_tokens, 8000);
  assert.equal(normalizeConfig({ max_tokens: 10 }).max_tokens, 1024);
});

test('each select keeps only its own values', () => {
  // Sonnet is a chat choice, not a router choice.
  assert.equal(
    normalizeConfig({ model: '~anthropic/claude-sonnet-latest' }).model,
    '~anthropic/claude-sonnet-latest',
  );
  assert.equal(
    normalizeConfig({ fast_model: '~anthropic/claude-sonnet-latest' }).fast_model,
    '~openai/gpt-luna-latest',
  );
  for (const id of [...CHAT_MODELS, ...ROUTER_MODELS]) {
    assert.ok(MODELS[id], id);
  }
});

test('a select set to "custom" calls the custom id, null when it is empty', () => {
  for (const id of [
    'mistralai/mistral-large-4-0',
    'meta-llama/llama-3.2-3b-instruct:free',
    '~x-ai/grok-latest',
  ]) {
    const config = normalizeConfig({ model: 'custom', custom_model: ` ${id} ` });
    assert.equal(resolveModel(config, 'model'), id);
    assert.equal(resolveModel(config, 'fast_model'), '~openai/gpt-luna-latest');
  }
  assert.equal(
    normalizeConfig({ model: 'custom', custom_model: 'gpt-4o' }).custom_model,
    '',
    'no vendor',
  );
  assert.equal(resolveModel(normalizeConfig({ model: 'custom' }), 'model'), null);
  assert.equal(presetName('openrouter/auto'), 'Auto Router');
  assert.equal(presetName('x/y'), 'x/y');
});

test('privacy levels and free models', () => {
  assert.equal(providerFor('standard'), undefined);
  assert.deepEqual(providerFor('no_training'), { data_collection: 'deny' });
  assert.deepEqual(providerFor('zdr'), { data_collection: 'deny', zdr: true });
  assert.equal(isFreeModel('openrouter/free'), true);
  assert.equal(isFreeModel('google/gemma-4-31b-it:free'), true);
  assert.equal(isFreeModel('openrouter/auto'), false);
  assert.equal(isFreeModel(null), false);
});
