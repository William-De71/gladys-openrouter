import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_TITLE,
  APP_URL,
  createOpenRouterClient,
  ERROR_KINDS,
  errorInBody,
  errorMessageOf,
  kindOf,
  maskKeys,
  OpenRouterError,
  parseRetryAfter,
} from '../src/openrouter-api.js';
import { API_KEY, KEY, MODELS, startFakeOpenRouter } from './helpers/fake-openrouter.js';

const client = (api, options = {}) => {
  const waits = [];
  const instance = createOpenRouterClient({
    getApiKey: () => options.key ?? API_KEY,
    baseUrl: api.url,
    sleep: async (ms) => {
      waits.push(ms);
    },
    ...options,
  });
  return { instance, waits };
};

test('sends the key as a Bearer token with the app attribution, and returns the JSON body', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance } = client(api);
  const body = await instance.chat({
    model: '~anthropic/claude-haiku-latest',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(body.choices[0].message.content, 'Bonjour !');
  const sent = api.requests[0];
  assert.equal(sent.authorization, `Bearer ${API_KEY}`);
  assert.equal(sent.headers['http-referer'], APP_URL);
  assert.equal(sent.headers['x-openrouter-title'], APP_TITLE);
  assert.equal(sent.body.model, '~anthropic/claude-haiku-latest');
  assert.deepEqual(await instance.models(), MODELS);
  assert.deepEqual(await instance.key(), KEY);
  assert.deepEqual(
    api.requests.map((request) => request.route),
    ['POST /api/v1/chat/completions', 'GET /api/v1/models', 'GET /api/v1/key'],
  );
});

test('no key: fails before any request', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance } = client(api, { key: '' });
  await assert.rejects(
    instance.chat({}),
    (err) => err instanceof OpenRouterError && err.kind === ERROR_KINDS.AUTH,
  );
  assert.equal(api.requests.length, 0);
});

test('HTTP failures become error kinds, the key never in the message', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance } = client(api, { key: 'sk-or-v1-wrongkey' });
  await assert.rejects(
    instance.chat({}),
    (err) =>
      err.kind === ERROR_KINDS.AUTH &&
      /HTTP 401: User not found/.test(err.message) &&
      !err.message.includes('wrongkey'),
  );
  const good = client(api).instance;
  api.reply('POST /api/v1/chat/completions', {
    status: 402,
    body: {
      error: {
        code: 402,
        message: 'Insufficient credits',
        metadata: { limit_source: 'openrouter_credits' },
      },
    },
  });
  await assert.rejects(good.chat({}), (err) => err.kind === ERROR_KINDS.CREDITS);
  assert.equal(api.requests.length, 2, 'a 402 is never retried');
  api.reply('POST /api/v1/chat/completions', {
    status: 404,
    body: { error: { code: 404, message: 'No endpoints found for nope/model' } },
  });
  await assert.rejects(good.chat({}), (err) => err.kind === ERROR_KINDS.MODEL);
  api.reply('POST /api/v1/chat/completions', {
    status: 403,
    body: {
      error: {
        code: 403,
        message: 'Input was flagged',
        metadata: { reasons: ['violence'], provider_name: 'X' },
      },
    },
  });
  await assert.rejects(
    good.chat({}),
    (err) => err.kind === ERROR_KINDS.REQUEST && /flagged \(violence\)/.test(err.message),
  );
  api.reply('POST /api/v1/chat/completions', { status: 200, body: 'not json' });
  // Not JSON: a server fault, retried like a 5xx (here without retry).
  await assert.rejects(good.chat({}, { retries: false }), (err) => err.kind === ERROR_KINDS.SERVER);
});

test('an error inside an HTTP 200 is an error, by the code it carries', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance } = client(api);
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: {
      error: {
        code: 429,
        message: 'Provider busy',
        metadata: { error_type: 'rate_limit_exceeded' },
      },
    },
  });
  api.reply('POST /api/v1/chat/completions', {
    status: 200,
    body: {
      choices: [
        {
          index: 0,
          finish_reason: 'error',
          message: { role: 'assistant', content: 'Le dé' },
          error: { code: 502, message: 'Upstream died', metadata: { error_type: 'server' } },
        },
      ],
    },
  });
  await assert.rejects(
    instance.chat({}, { retries: false }),
    (err) => err.kind === ERROR_KINDS.RATE_LIMIT && /Provider busy/.test(err.message),
  );
  await assert.rejects(
    instance.chat({}, { retries: false }),
    (err) => err.kind === ERROR_KINDS.SERVER && err.status === 502,
  );
});

test('429 and 5xx are retried with Retry-After or backoff, then give up', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance, waits } = client(api);
  api.reply('POST /api/v1/chat/completions', {
    status: 429,
    body: { error: { code: 429, message: 'Rate limit exceeded' } },
    headers: { 'Retry-After': '2' },
  });
  api.reply('POST /api/v1/chat/completions', {
    status: 503,
    body: { error: { code: 503, message: 'busy' } },
  });
  const body = await instance.chat({});
  assert.equal(body.choices[0].message.content, 'Bonjour !');
  assert.deepEqual(waits, [2000, 2000]);
  for (let i = 0; i < 3; i += 1) {
    api.reply('POST /api/v1/chat/completions', {
      status: 429,
      body: { error: { code: 429, message: 'Rate limit exceeded' } },
    });
  }
  await assert.rejects(instance.chat({}), (err) => err.kind === ERROR_KINDS.RATE_LIMIT);
  assert.equal(api.requests.length, 6);
  // The key check never retries.
  api.reply('GET /api/v1/key', { status: 503, body: { error: { code: 503, message: 'busy' } } });
  await assert.rejects(instance.key(), (err) => err.kind === ERROR_KINDS.SERVER);
  assert.equal(api.requests.length, 7);
});

test('a wait that would not fit in the deadline fails at once with the real reason', async (t) => {
  const api = await startFakeOpenRouter();
  t.after(api.close);
  const { instance, waits } = client(api);
  api.reply('POST /api/v1/chat/completions', {
    status: 429,
    body: { error: { code: 429, message: 'free-models-per-day' } },
    headers: { 'Retry-After': '30' },
  });
  await assert.rejects(
    instance.chat({}, { timeoutMs: 18_000 }),
    (err) => err.kind === ERROR_KINDS.RATE_LIMIT && /free-models-per-day/.test(err.message),
  );
  assert.deepEqual(waits, []);
});

test('an unreachable API and a timeout are named as such', async () => {
  const unreachable = createOpenRouterClient({
    getApiKey: () => 'k',
    baseUrl: 'http://127.0.0.1:9/api/v1',
    sleep: async () => {},
  });
  await assert.rejects(
    unreachable.chat({}, { retries: false }),
    (err) => err.kind === ERROR_KINDS.UNREACHABLE,
  );
  const slow = createOpenRouterClient({
    getApiKey: () => 'k',
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      ),
  });
  // AbortSignal.timeout does not keep the process alive: this timer does.
  const hold = setTimeout(() => {}, 1000);
  await assert.rejects(
    slow.chat({}, { timeoutMs: 50, retries: false }),
    (err) => err.kind === ERROR_KINDS.TIMEOUT,
  );
  clearTimeout(hold);
});

test('kinds, error bodies, keys and Retry-After are read safely', () => {
  assert.equal(kindOf(401), 'auth');
  assert.equal(kindOf(402), 'credits');
  assert.equal(kindOf(403), 'request');
  assert.equal(kindOf(404), 'model');
  assert.equal(kindOf(408), 'timeout');
  assert.equal(kindOf(429), 'rate_limit');
  assert.equal(kindOf(502), 'server');
  assert.equal(kindOf(400, 'context_length_exceeded'), 'request');
  assert.equal(kindOf(502, 'rate_limit_exceeded'), 'rate_limit');
  assert.equal(maskKeys('key sk-or-v1-abc123 refused'), 'key sk-or-*** refused');
  assert.equal(
    errorMessageOf({ error: { message: 'Bearer abc.def is invalid' } }),
    'Bearer *** is invalid',
  );
  assert.equal(
    errorMessageOf({ error: { message: 'Provider returned error', metadata: { raw: 'boom' } } }),
    'Provider returned error (boom)',
  );
  assert.equal(errorMessageOf('x'.repeat(500)).length, 300);
  assert.equal(errorInBody({ choices: [{ finish_reason: 'stop', message: {} }] }), null);
  assert.equal(errorInBody({ error: { code: 401, message: 'x' } }).kind, 'auth');
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4000), 6000);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter(null), null);
});
