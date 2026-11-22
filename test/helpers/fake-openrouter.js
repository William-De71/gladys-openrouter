// -----------------------------------------------------------------------------
// A fake OpenRouter API on 127.0.0.1, for the tests: real HTTP, no network.
//
// Every request is recorded (`requests`); the answer of each route comes from
// a queue of handlers (`reply(route, handler)`), or a default one. A handler
// returns `{ status, body, headers }`. The fixtures follow the API reference
// (openrouter.ai/docs, read on 2026-11-22) and the public model list: the
// completions are not captured from the real API.
//
// `node --test` also runs this file: nothing starts on import.
// -----------------------------------------------------------------------------

import { createServer } from 'node:http';

export const API_KEY = 'sk-or-v1-test0123456789abcdef';

/**
 * @description A chat completion as OpenRouter returns it.
 * @param {object} [message] - The assistant message.
 * @param {object} [extra] - Other fields (finish_reason, usage, model).
 * @returns {object} The body.
 */
export function completion(message = { role: 'assistant', content: 'Bonjour !' }, extra = {}) {
  return {
    id: 'gen-1793480400-a1b2c3',
    object: 'chat.completion',
    model: extra.model ?? 'anthropic/claude-haiku-5.5',
    created: 1793480400,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', ...message },
        finish_reason: extra.finish_reason ?? 'stop',
        native_finish_reason: extra.finish_reason ?? 'end_turn',
      },
    ],
    usage: extra.usage ?? {
      prompt_tokens: 1200,
      completion_tokens: 80,
      total_tokens: 1280,
      cost: 0.00016,
      is_byok: false,
    },
  };
}

/**
 * @description A completion of the web plugin, with its citations.
 * @returns {object} The body.
 */
export function webSearchCompletion() {
  return completion(
    {
      content: 'La grève SNCF est reconduite demain [1], avec un TGV sur deux [1, 2].',
      annotations: [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://www.lemonde.fr/a',
            title: 'Le Monde',
            start_index: 0,
            end_index: 10,
          },
        },
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://www.lemonde.fr/a',
            title: 'Le Monde',
            start_index: 11,
            end_index: 20,
          },
        },
        {
          type: 'url_citation',
          url_citation: { url: 'https://www.francetvinfo.fr/b', title: 'France Info' },
        },
      ],
    },
    {
      usage: { prompt_tokens: 3000, completion_tokens: 40, total_tokens: 3040, cost: 0.0074 },
    },
  );
}

/** A few entries of GET /models, in the shape of the real list. */
export const MODELS = [
  {
    id: '~anthropic/claude-haiku-latest',
    name: 'Anthropic: Claude Haiku Latest',
    alias_target: { name: 'Anthropic: Claude Haiku 5.5', slug: 'anthropic/claude-haiku-5.5' },
    architecture: { input_modalities: ['text', 'image', 'file'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
    reasoning: {
      mandatory: false,
      supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
      default_effort: 'medium',
    },
  },
  {
    id: '~anthropic/claude-sonnet-latest',
    name: 'Anthropic: Claude Sonnet Latest',
    alias_target: { name: 'Anthropic: Claude Sonnet 5.5', slug: 'anthropic/claude-sonnet-5.5' },
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
    reasoning: {
      mandatory: true,
      supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'],
      default_effort: 'high',
    },
  },
  {
    id: '~openai/gpt-luna-latest',
    name: 'OpenAI: GPT Luna Latest',
    alias_target: { name: 'OpenAI: GPT-6 Luna', slug: 'openai/gpt-6-luna' },
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
    reasoning: {
      mandatory: false,
      supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
    },
  },
  {
    id: '~google/gemini-flash-latest',
    name: 'Google: Gemini Flash Latest',
    alias_target: { name: 'Google: Gemini 4 Hydrogen', slug: 'google/gemini-4-hydrogen' },
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
    reasoning: { mandatory: true, supported_efforts: ['xhigh', 'high', 'medium', 'low'] },
  },
  {
    id: 'openrouter/free',
    name: 'Free Models Router',
    alias_target: null,
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
  },
  {
    id: 'openrouter/auto',
    name: 'Auto Router',
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['max_tokens', 'reasoning', 'tool_choice', 'tools'],
  },
  {
    id: 'qwen/qwen3.8-flash',
    name: 'Qwen: Qwen3.8 Flash',
    architecture: { input_modalities: ['text'] },
    supported_parameters: ['max_tokens', 'temperature'],
  },
];

/** GET /key of a key with a credit limit. */
export const KEY = {
  label: 'sk-or-v1-tes...def',
  limit: 10,
  limit_reset: 'monthly',
  limit_remaining: 8.5,
  usage: 1.5,
  usage_daily: 0.12,
  usage_monthly: 1.5,
  is_free_tier: false,
  free_model_daily_requests: { used: 3, limit: 1000, remaining: 997 },
};

/**
 * @description Start the fake API.
 * @returns {Promise<object>} `{ url, requests, reply, close }`.
 */
export async function startFakeOpenRouter() {
  const requests = [];
  const queues = new Map();
  const defaults = {
    'POST /api/v1/chat/completions': () => ({ status: 200, body: completion() }),
    'GET /api/v1/models': () => ({ status: 200, body: { data: MODELS } }),
    'GET /api/v1/key': () => ({ status: 200, body: { data: KEY } }),
  };

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const path = decodeURIComponent(req.url);
      const route = `${req.method} ${path.split('?')[0]}`;
      const request = {
        route,
        path,
        headers: req.headers,
        authorization: req.headers.authorization,
        body: raw ? JSON.parse(raw) : null,
      };
      requests.push(request);
      let answer;
      if (request.authorization !== `Bearer ${API_KEY}`) {
        answer = { status: 401, body: { error: { message: 'User not found.', code: 401 } } };
      } else {
        const queue = queues.get(route);
        const handler = queue?.length ? queue.shift() : defaults[route];
        answer = handler
          ? handler(request)
          : { status: 404, body: { error: { message: 'Not Found', code: 404 } } };
      }
      res.writeHead(answer.status, {
        'Content-Type': 'application/json',
        ...(answer.headers ?? {}),
      });
      res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    requests,
    /**
     * @description Queue the answer of the next request of a route.
     * @param {string} route - "POST /api/v1/chat/completions", "GET /api/v1/key"…
     * @param {Function|object} handler - `(request) => answer`, or the answer.
     */
    reply(route, handler) {
      if (!queues.has(route)) {
        queues.set(route, []);
      }
      queues.get(route).push(typeof handler === 'function' ? handler : () => handler);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
