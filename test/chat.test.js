import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_CHAT_PURPOSES, validateAiCompletion } from '@gladysassistant/integration-sdk';
import { buildBody, createChatHandler, useOf } from '../src/chat.js';
import { normalizeConfig } from '../src/config.js';
import { createCatalog } from '../src/catalog.js';
import { createOpenRouterClient, ERROR_KINDS } from '../src/openrouter-api.js';
import { API_KEY, completion, startFakeOpenRouter } from './helpers/fake-openrouter.js';

const TOOLS = [
  {
    type: 'function',
    function: { name: 'device_set_value', parameters: { type: 'object', properties: {} } },
  },
];

const setup = async (t, raw = {}) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const config = normalizeConfig({ api_key: API_KEY, ...raw });
  const client = createOpenRouterClient({
    getApiKey: () => config.api_key,
    baseUrl: api.url,
    sleep: async () => {},
  });
  const catalog = createCatalog({ fetchModels: () => client.models() });
  const recorded = { success: [], error: [], failures: [], successes: 0 };
  const usage = {
    recordSuccess: (entry) => recorded.success.push(entry),
    recordError: (entry) => recorded.error.push(entry),
  };
  const handler = createChatHandler({
    client,
    getConfig: () => config,
    catalog,
    usage,
    onFailure: (err, context) => recorded.failures.push({ kind: err.kind, ...context }),
    onSuccess: () => {
      recorded.successes += 1;
    },
  });
  const chats = () => api.requests.filter((request) => request.route.endsWith('/completions'));
  return { api, handler, recorded, config, catalog, chats };
};

test('the router gets the fast model without reasoning; the chat the main model with tools', async (t) => {
  const { handler, recorded, chats } = await setup(t);
  await handler({
    messages: [
      { role: 'system', content: 'Classify' },
      { role: 'user', content: 'Allume' },
    ],
    purpose: AI_CHAT_PURPOSES.INTENT_CLASSIFICATION,
  });
  const router = chats()[0].body;
  assert.equal(router.model, '~openai/gpt-luna-latest');
  assert.equal(router.reasoning, undefined, 'catalog not read yet: nothing sent for "none"');
  assert.equal(router.tools, undefined);
  assert.equal(router.user, 'gladys');

  const answer = await handler({
    messages: [{ role: 'user', content: 'Allume le salon' }],
    tools: TOOLS,
    tool_choice: 'required',
    max_tokens: 2000,
    purpose: AI_CHAT_PURPOSES.CHAT,
    categories: ['devices'],
  });
  const chat = chats()[1].body;
  assert.equal(chat.model, '~anthropic/claude-haiku-latest');
  assert.deepEqual(chat.reasoning, { effort: 'low' });
  assert.equal(chat.tool_choice, 'required');
  assert.equal(chat.max_tokens, 8000, 'the configured budget when the caller asks less');
  assert.equal(chat.provider, undefined);
  assert.equal(chat.purpose, undefined);
  assert.equal(chat.categories, undefined);
  assert.deepEqual(validateAiCompletion(answer), []);
  assert.deepEqual(
    recorded.success.map((entry) => entry.use),
    ['router', 'chat'],
  );
  assert.equal(recorded.success[1].usage.cost, 0.00016);
  assert.equal(recorded.successes, 2);
});

test('the reasoning level follows what the model accepts, from the catalog', async (t) => {
  const { catalog } = await setup(t);
  await catalog.refresh();
  const body = (raw, purpose = 'chat') =>
    buildBody({ messages: [], purpose }, normalizeConfig({ api_key: 'k', ...raw }), { catalog });
  // Sonnet cannot turn reasoning off: the router gets its lowest level.
  assert.deepEqual(
    body(
      { fast_model: 'custom', custom_model: '~anthropic/claude-sonnet-latest' },
      AI_CHAT_PURPOSES.INTENT_CLASSIFICATION,
    ).reasoning,
    { effort: 'low' },
  );
  assert.deepEqual(body({}, AI_CHAT_PURPOSES.INTENT_CLASSIFICATION).reasoning, { effort: 'none' });
  assert.deepEqual(body({ model: '~google/gemini-flash-latest', reasoning: 'none' }).reasoning, {
    effort: 'low',
  });
  assert.deepEqual(body({ reasoning: 'high' }).reasoning, { effort: 'high' });
  // A model without reasoning gets nothing; a router without levels the level as asked.
  assert.equal(body({ model: 'custom', custom_model: 'qwen/qwen3.8-flash' }).reasoning, undefined);
  assert.deepEqual(body({ model: 'openrouter/auto', reasoning: 'medium' }).reasoning, {
    effort: 'medium',
  });
});

test('the privacy setting restricts the providers', () => {
  const body = (privacy) => buildBody({ messages: [] }, normalizeConfig({ api_key: 'k', privacy }));
  assert.equal(body('standard').provider, undefined);
  assert.deepEqual(body('no_training').provider, { data_collection: 'deny' });
  assert.deepEqual(body('zdr').provider, { data_collection: 'deny', zdr: true });
});

test('the purposes are counted as router, digest or chat', () => {
  assert.equal(useOf(AI_CHAT_PURPOSES.INTENT_CLASSIFICATION), 'router');
  assert.equal(useOf(AI_CHAT_PURPOSES.WEEKLY_DIGEST), 'digest');
  assert.equal(useOf(AI_CHAT_PURPOSES.CHAT), 'chat');
  assert.equal(useOf(undefined), 'chat');
});

test('no tools: neither tools nor tool_choice is sent', () => {
  const body = buildBody(
    { messages: [], tools: [], tool_choice: 'auto' },
    normalizeConfig({ api_key: 'k' }),
  );
  assert.equal(body.tools, undefined);
  assert.equal(body.tool_choice, undefined);
});

test('a model that refuses the reasoning parameter is asked again without it, then never', async (t) => {
  const { api, handler, chats } = await setup(t, {
    model: 'custom',
    custom_model: 'mistralai/mistral-nemo',
  });
  api.reply('POST /api/v1/chat/completions', {
    status: 400,
    body: { error: { code: 400, message: 'reasoning is not supported for this model' } },
  });
  const answer = await handler({
    messages: [{ role: 'user', content: 'Bonjour' }],
    purpose: 'chat',
  });
  assert.equal(answer.choices[0].message.content, 'Bonjour !');
  assert.deepEqual(chats()[0].body.reasoning, { effort: 'low' });
  assert.equal(chats()[1].body.reasoning, undefined);
  await handler({ messages: [{ role: 'user', content: 'Encore' }], purpose: 'chat' });
  assert.equal(chats()[2].body.reasoning, undefined);
});

test('reasoning_details come back with the tool results of their turn', async (t) => {
  const { api, handler, chats } = await setup(t);
  const details = [
    {
      type: 'reasoning.encrypted',
      data: 'opaque==',
      id: 'r1',
      format: 'anthropic-claude-v1',
      index: 0,
    },
  ];
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: completion(
      {
        content: null,
        reasoning_details: details,
        tool_calls: [
          {
            id: 'toolu_01',
            type: 'function',
            function: { name: 'device_set_value', arguments: '{}' },
          },
        ],
      },
      { finish_reason: 'tool_calls' },
    ),
  });
  const first = await handler({
    messages: [{ role: 'user', content: 'Allume' }],
    tools: TOOLS,
    purpose: 'chat',
  });
  assert.equal(first.choices[0].finish_reason, 'tool_calls');
  assert.equal(first.choices[0].message.reasoning_details, undefined, 'never sent to the core');
  await handler({
    messages: [
      { role: 'user', content: 'Allume' },
      first.choices[0].message,
      { role: 'tool', tool_call_id: 'toolu_01', content: '{"ok":true}' },
    ],
    tools: TOOLS,
    purpose: 'chat',
  });
  const assistant = chats()[1].body.messages[1];
  assert.deepEqual(assistant.reasoning_details, details);
  assert.equal(chats()[1].body.messages[2].tool_call_id, 'toolu_01');
});

test('failures are thrown (the core names them), counted and reported once each', async (t) => {
  const { api, handler, recorded } = await setup(t);
  api.reply('POST /api/v1/chat/completions', {
    status: 401,
    body: { error: { code: 401, message: 'User not found.' } },
  });
  await assert.rejects(
    handler({ messages: [], purpose: 'chat' }),
    (err) => err.kind === ERROR_KINDS.AUTH,
  );
  assert.deepEqual(recorded.failures, [
    { kind: 'auth', use: 'chat', model: '~anthropic/claude-haiku-latest' },
  ]);
  assert.equal(recorded.error[0].kind, 'auth');

  api.reply('POST /api/v1/chat/completions', {
    status: 400,
    body: { error: { code: 400, message: 'Image input not supported' } },
  });
  await assert.rejects(
    handler({
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }],
        },
      ],
      purpose: 'chat',
    }),
    /choose a model that reads images/,
  );
});

test('an answer cut before any text, or refused, fails clearly; a cut text is still returned', async (t) => {
  const { api, handler } = await setup(t);
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: completion({ content: '' }, { finish_reason: 'length' }),
  });
  await assert.rejects(handler({ messages: [], purpose: 'chat' }), /cut at max_tokens/);
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: completion({ content: null, refusal: 'I cannot help with that.' }),
  });
  await assert.rejects(
    handler({ messages: [], purpose: 'chat' }),
    (err) => err.kind === ERROR_KINDS.REQUEST && /refused to answer/.test(err.message),
  );
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: completion({ content: 'Le début' }, { finish_reason: 'length' }),
  });
  const answer = await handler({ messages: [], purpose: 'chat' });
  assert.equal(answer.choices[0].message.content, 'Le début');
});

test('a custom model without id fails without calling OpenRouter', async (t) => {
  const { api, handler } = await setup(t, { fast_model: 'custom' });
  await assert.rejects(
    handler({ messages: [], purpose: AI_CHAT_PURPOSES.INTENT_CLASSIFICATION }),
    (err) => err.kind === ERROR_KINDS.MODEL,
  );
  assert.equal(api.requests.length, 0);
});
