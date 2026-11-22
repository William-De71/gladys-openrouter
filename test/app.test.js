// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and a fake OpenRouter API
// (test/helpers/fake-openrouter.js), a real HTTP server on 127.0.0.1. No test
// touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import {
  AI_CHAT_PURPOSES,
  validateAiCompletion,
  validateWidgetContent,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ACTIONS, createApp, SCENE_ACTIONS } from '../src/app.js';
import { TRIGGERS } from '../src/events.js';
import { WIDGETS } from '../src/widgets.js';
import {
  API_KEY,
  completion,
  startFakeOpenRouter,
  webSearchCompletion,
} from './helpers/fake-openrouter.js';

const CHAT = 'POST /api/v1/chat/completions';

const start = async (t, config = { api_key: API_KEY }) => {
  const api = await startFakeOpenRouter();
  const dir = await mkdtemp(join(tmpdir(), 'openrouter-app-'));
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    baseUrl: api.url,
    sleep: async () => {},
    usageFile: join(dir, 'usage.json'),
    timeZone: 'Europe/Paris',
  });
  await gladys.connect();
  await app.whenReady();
  t.after(async () => {
    app.usage.stop();
    await gladys.disconnect?.();
    await api.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { api, gladys, app };
};

test('connects: checks the key and the catalog without spending a token, status OK', async (t) => {
  const { api, gladys } = await start(t);
  assert.deepEqual(
    api.requests.map((r) => r.route),
    ['GET /api/v1/key', 'GET /api/v1/models'],
  );
  assert.equal(gladys.fake.connectionStatuses.at(-1).connected, true);
});

test('without a key: status explains it, nothing is called', async (t) => {
  const { api, gladys } = await start(t, {});
  assert.equal(api.requests.length, 0);
  const status = gladys.fake.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(JSON.stringify(status), /openrouter\.ai\/keys/);
});

test('answers the AI requests of the core with valid completions', async (t) => {
  const { api, gladys } = await start(t);
  const ack = await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'Bonjour' }],
    tools: [
      { type: 'function', function: { name: 'x', parameters: { type: 'object', properties: {} } } },
    ],
    tool_choice: 'auto',
    purpose: AI_CHAT_PURPOSES.CHAT,
  });
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(validateAiCompletion(ack.data), []);
  assert.equal(ack.data.choices[0].message.content, 'Bonjour !');
  const body = api.requests.at(-1).body;
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.reasoning, { effort: 'low' }, 'the catalog knows Claude Haiku');
});

test('a failing provider: the ack fails, one error event, status down, then recovery', async (t) => {
  const { api, gladys } = await start(t);
  for (let i = 0; i < 3; i += 1) {
    api.reply(CHAT, {
      status: 402,
      body: { error: { code: 402, message: 'Insufficient credits' } },
    });
  }
  for (let i = 0; i < 3; i += 1) {
    const ack = await gladys.fake.aiChat({
      messages: [{ role: 'user', content: 'x' }],
      purpose: 'chat',
    });
    assert.equal(ack.success, false);
  }
  await tick();
  const errors = gladys.fake.sceneEvents.filter(
    (event) => (event.key ?? event.event_key) === TRIGGERS.ERROR,
  );
  assert.equal(errors.length, 1, JSON.stringify(gladys.fake.sceneEvents));
  assert.equal(JSON.stringify(errors[0]).includes('credits'), true);
  const status = gladys.fake.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(JSON.stringify(status), /Plus de crédits OpenRouter/);
  const ack = await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'x' }],
    purpose: 'chat',
  });
  assert.equal(ack.success, true);
  await tick();
  assert.ok(
    gladys.fake.sceneEvents.some((event) => (event.key ?? event.event_key) === TRIGGERS.RECOVERED),
  );
  assert.equal(gladys.fake.connectionStatuses.at(-1).connected, true);
});

test('the web search scene action returns its outputs', async (t) => {
  const { api, gladys } = await start(t);
  api.reply(CHAT, { status: 200, body: webSearchCompletion() });
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.WEB_SEARCH, {
    question: 'Grève demain ?',
  });
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), ['answer', 'sources']);
  assert.match(ack.data.outputs.answer, /grève SNCF/);
  assert.match(ack.data.outputs.sources, /lemonde/);
});

test('the test button answers with each model, its real name and its time', async (t) => {
  const { api, gladys } = await start(t, {
    api_key: API_KEY,
    fast_model: 'openrouter/free',
  });
  api.reply(CHAT, { status: 200, body: completion({ content: 'OK' }) });
  api.reply(CHAT, {
    status: 200,
    body: completion({ content: 'OK' }, { model: 'google/gemma-4-31b-it:free' }),
  });
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION, {});
  assert.equal(ack.success, true);
  const text = ack.data.message.fr;
  assert.match(text, /Discussion — Claude Haiku 5\.5 a répondu en/);
  assert.match(
    text,
    /Routeur — Free Models Router a répondu en .* \(avec google\/gemma-4-31b-it:free\)/,
  );
  assert.match(text, /Les modèles gratuits sont limités/);
});

test('the widget counts what was asked and shows the credit of the key, valid in every language', async (t) => {
  const { gladys } = await start(t);
  await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'x' }],
    purpose: AI_CHAT_PURPOSES.INTENT_CLASSIFICATION,
  });
  await gladys.fake.aiChat({ messages: [{ role: 'user', content: 'x' }], purpose: 'chat' });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await gladys.fake.widgetGet(WIDGETS.USAGE, { language });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], language);
    const tiles = ack.data.content.components.filter((c) => c.type === 'value');
    assert.equal(tiles[0].value, 2);
    assert.equal(tiles.length, 5, 'the key has a limit: its credit left is shown');
  }
});

test('a new configuration is applied and checked at once', async (t) => {
  const { gladys, app } = await start(t);
  await gladys.fake.configUpdated({
    api_key: API_KEY,
    model: 'custom',
    custom_model: 'vendor/does-not-exist',
  });
  assert.equal(app.getConfig().model, 'custom');
  const status = gladys.fake.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(JSON.stringify(status), /vendor\/does-not-exist/);
});

test('a key refused at startup shows on the status', async (t) => {
  const { gladys } = await start(t, { api_key: 'sk-or-v1-revoked' });
  const status = gladys.fake.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(JSON.stringify(status), /OpenRouter a refusé la clé/);
});
