import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { createOpenRouterClient, ERROR_KINDS } from '../src/openrouter-api.js';
import { createWebSearchHandler, formatSources, readAnswer } from '../src/websearch.js';
import {
  API_KEY,
  completion,
  startFakeOpenRouter,
  webSearchCompletion,
} from './helpers/fake-openrouter.js';

const ROUTE = 'POST /api/v1/chat/completions';

const setup = async (t, raw = {}) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const config = normalizeConfig({ api_key: API_KEY, ...raw });
  const client = createOpenRouterClient({
    getApiKey: () => config.api_key,
    baseUrl: api.url,
    sleep: async () => {},
  });
  const seen = { success: [], failures: [] };
  const handler = createWebSearchHandler({
    client,
    getConfig: () => config,
    usage: { recordSuccess: (e) => seen.success.push(e), recordError: () => {} },
    onFailure: (err) => seen.failures.push(err.kind),
  });
  return { api, handler, seen };
};

test('asks the chat model with the Exa web plugin and returns the declared outputs', async (t) => {
  const { api, handler, seen } = await setup(t, { privacy: 'no_training' });
  api.reply(ROUTE, { status: 200, body: webSearchCompletion() });
  const outputs = await handler({ question: 'Grève SNCF demain ?', instructions: 'Une phrase.' });
  assert.deepEqual(Object.keys(outputs).sort(), ['answer', 'sources']);
  assert.equal(outputs.answer, 'La grève SNCF est reconduite demain, avec un TGV sur deux.');
  assert.equal(
    outputs.sources,
    'Le Monde — https://www.lemonde.fr/a\nFrance Info — https://www.francetvinfo.fr/b',
  );
  const { body } = api.requests[0];
  assert.equal(body.model, '~anthropic/claude-haiku-latest');
  assert.deepEqual(body.plugins, [{ id: 'web', engine: 'exa', max_results: 5 }]);
  assert.deepEqual(body.provider, { data_collection: 'deny' });
  assert.equal(body.messages[1].content, 'Grève SNCF demain ?');
  assert.match(body.messages[0].content, /plain text[\s\S]*\nUne phrase\.$/);
  assert.equal(seen.success[0].use, 'web');
  assert.equal(seen.success[0].usage.cost, 0.0074);
});

test('empty question, failures, empty answer', async (t) => {
  const { api, handler, seen } = await setup(t);
  await assert.rejects(handler({ question: '   ' }), /empty/);
  api.reply(ROUTE, {
    status: 402,
    body: { error: { code: 402, message: 'Insufficient credits' } },
  });
  await assert.rejects(handler({ question: 'x' }), (err) => err.kind === ERROR_KINDS.CREDITS);
  api.reply(ROUTE, { status: 200, body: completion({ content: '' }) });
  await assert.rejects(handler({ question: 'x' }), /no text/);
  assert.deepEqual(seen.failures, ['credits', 'server']);
});

test('answers without citations and long source lists are read', () => {
  assert.deepEqual(readAnswer(completion({ content: ' Oui. ' })), { answer: 'Oui.', sources: [] });
  assert.deepEqual(readAnswer(null), { answer: '', sources: [] });
  const many = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, url: `https://e.x/${i}` }));
  assert.equal(formatSources(many).split('\n').length, 5);
  assert.equal(formatSources([{ title: 'Sans lien', url: '' }]), 'Sans lien');
});
