// -----------------------------------------------------------------------------
// Client of the OpenRouter API (https://openrouter.ai/api/v1).
//
// Plain fetch, no SDK: three endpoints only —
//   - POST /chat/completions   the assistant and the web search action
//   - GET  /models             the catalog (names, reasoning efforts, tools)
//   - GET  /key                the key: label, limit, spend, free requests
//
// Every call runs under a deadline. A 429 or a 5xx is retried while the
// deadline leaves room for it, honouring Retry-After; anything else fails at
// once with an OpenRouterError that says what went wrong without echoing the
// key. A 402 (no credits left, key limit reached) is never retried: it is
// kind `credits`, which only the administrator can fix.
//
// OpenRouter may also fail INSIDE an HTTP 200: a provider that breaks after
// the headers gives a body with a top-level `error` and no `choices`, or a
// choice whose `finish_reason` is `error` (docs: api-reference/errors).
// Both are turned into errors here, by the code they carry.
// -----------------------------------------------------------------------------

export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * App attribution (docs: app-attribution): OpenRouter shows the requests of
 * Gladys under this name in the activity of the key. No user data in them.
 */
export const APP_URL = 'https://github.com/William-De71/gladys-openrouter';
export const APP_TITLE = 'Gladys Assistant';

/** The error kinds, also the `kind` variable of the `error` scene trigger. */
export const ERROR_KINDS = {
  AUTH: 'auth',
  CREDITS: 'credits',
  MODEL: 'model',
  RATE_LIMIT: 'rate_limit',
  REQUEST: 'request',
  SERVER: 'server',
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
const MAX_ATTEMPTS = 3;

export class OpenRouterError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - What went wrong (never the key).
   * @param {object} [details] - `{ status, retryAfterMs, errorType }`.
   */
  constructor(kind, message, { status = null, retryAfterMs = null, errorType = null } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.errorType = errorType;
  }
}

/**
 * @description The kind of a failure, from its code and the `error_type` of
 * its metadata (provider errors).
 * @param {number} status - The HTTP status, or the `error.code` of the body.
 * @param {string|null} [errorType] - `error.metadata.error_type`.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOf(status, errorType = null) {
  if (errorType === 'rate_limit_exceeded') {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (errorType === 'context_length_exceeded' || errorType === 'max_tokens_exceeded') {
    return ERROR_KINDS.REQUEST;
  }
  if (status === 401) {
    return ERROR_KINDS.AUTH;
  }
  if (status === 402) {
    return ERROR_KINDS.CREDITS;
  }
  if (status === 404) {
    return ERROR_KINDS.MODEL;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (status === 408) {
    return ERROR_KINDS.TIMEOUT;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  // 400 bad request, 403 moderation or guardrail, 413, 422: this request only.
  return ERROR_KINDS.REQUEST;
}

/**
 * @description Hide what looks like a key.
 * @param {string} text - A text.
 * @returns {string} The text, keys masked.
 */
export function maskKeys(text) {
  return String(text ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/sk-or-[a-zA-Z0-9_-]+/g, 'sk-or-***');
}

/**
 * @description The message of an error body, short and without secrets.
 * @param {unknown} body - The parsed body, or the raw text.
 * @returns {string} The message.
 */
export function errorMessageOf(body) {
  let message = '';
  if (typeof body === 'string') {
    message = body;
  } else if (body && typeof body === 'object') {
    const error = body.error && typeof body.error === 'object' ? body.error : body;
    const candidate = error.message ?? body.message ?? body.error;
    message = typeof candidate === 'string' ? candidate : JSON.stringify(candidate ?? '');
    // The provider's own words, when OpenRouter relays them.
    const raw = error.metadata?.raw;
    if (typeof raw === 'string' && raw && !message.includes(raw.slice(0, 40))) {
      message += ` (${raw})`;
    }
    const reasons = error.metadata?.reasons;
    if (Array.isArray(reasons) && reasons.length > 0) {
      message += ` (${reasons.join(', ')})`;
    }
  }
  return maskKeys(message).replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * @description Milliseconds asked by a Retry-After header.
 * @param {string|null} value - The header.
 * @param {number} now - Now (ms).
 * @returns {number|null} Milliseconds, null when absent or unreadable.
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * @description The error a body carries although its HTTP status is 200.
 * @param {object} body - The parsed body.
 * @returns {OpenRouterError|null} The error, null when the body is a success.
 */
export function errorInBody(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : undefined;
  const error =
    (body?.error && !choice ? body.error : null) ??
    (choice?.finish_reason === 'error' || choice?.error ? (choice.error ?? {}) : null);
  if (!error) {
    return null;
  }
  const code = Number(error.code);
  const errorType =
    typeof error.metadata?.error_type === 'string' ? error.metadata.error_type : null;
  const status = Number.isFinite(code) && code >= 400 ? code : 502;
  const message = errorMessageOf({ error }) || 'the provider failed while answering';
  return new OpenRouterError(kindOf(status, errorType), `Provider error ${status}: ${message}`, {
    status,
    errorType,
  });
}

/**
 * @description Build a client.
 * @param {object} options - Options.
 * @param {() => string} options.getApiKey - The current API key.
 * @param {string} [options.baseUrl] - The API root (tests point it to a fake).
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Waiting (tests skip it).
 * @param {() => number} [options.now] - Clock.
 * @returns {object} `{ chat, models, key }`.
 */
export function createOpenRouterClient({
  getApiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  const root = baseUrl.replace(/\/+$/, '');

  /**
   * @description One HTTP call, retried on 429 / 5xx / network while the
   * deadline allows.
   * @param {string} method - GET or POST.
   * @param {string} path - Path under /api/v1.
   * @param {object} [options] - `{ body, timeoutMs, retries }`.
   * @returns {Promise<object>} The parsed JSON body.
   */
  async function request(method, path, { body, timeoutMs = 30_000, retries = true } = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new OpenRouterError(ERROR_KINDS.AUTH, 'No OpenRouter API key in the configuration');
    }
    const deadline = now() + timeoutMs;
    let lastError = null;
    for (let attempt = 1; attempt <= (retries ? MAX_ATTEMPTS : 1); attempt += 1) {
      const remaining = deadline - now();
      if (remaining <= 0) {
        break;
      }
      try {
        return await once(method, path, body, apiKey, remaining);
      } catch (err) {
        lastError = err;
        const retryable =
          err.kind === ERROR_KINDS.RATE_LIMIT ||
          err.kind === ERROR_KINDS.SERVER ||
          err.kind === ERROR_KINDS.UNREACHABLE;
        if (!retryable || !retries || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        const wait = err.retryAfterMs ?? RETRY_BASE_MS * 2 ** (attempt - 1);
        // A long wait asked by OpenRouter (the daily cap of the free models),
        // or no room left for the wait and a useful answer: fail now, with
        // the real reason, rather than later with a timeout.
        if (wait > RETRY_MAX_MS || now() + wait + 1000 >= deadline) {
          throw err;
        }
        await sleep(wait);
      }
    }
    throw (
      lastError ??
      new OpenRouterError(ERROR_KINDS.TIMEOUT, `No answer within ${Math.round(timeoutMs / 1000)} s`)
    );
  }

  async function once(method, path, body, apiKey, timeoutMs) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'HTTP-Referer': APP_URL,
          'X-OpenRouter-Title': APP_TITLE,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new OpenRouterError(
          ERROR_KINDS.TIMEOUT,
          `No answer within ${Math.round(timeoutMs / 1000)} s`,
        );
      }
      throw new OpenRouterError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach the OpenRouter API (${err?.cause?.code ?? err?.message ?? 'network error'})`,
      );
    }
    const text = await response.text().catch(() => '');
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const message = errorMessageOf(parsed ?? text) || response.statusText || 'error';
      const errorType =
        typeof parsed?.error?.metadata?.error_type === 'string'
          ? parsed.error.metadata.error_type
          : null;
      throw new OpenRouterError(
        kindOf(response.status, errorType),
        `HTTP ${response.status}: ${message}`,
        {
          status: response.status,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), now()),
          errorType,
        },
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new OpenRouterError(
        ERROR_KINDS.SERVER,
        'The OpenRouter API answered something that is not JSON',
        { status: response.status },
      );
    }
    const inBody = errorInBody(parsed);
    if (inBody) {
      throw inBody;
    }
    return parsed;
  }

  return {
    /**
     * @description POST /chat/completions.
     * @param {object} body - A chat completion request.
     * @param {object} [options] - `{ timeoutMs, retries }`.
     * @returns {Promise<object>} The completion.
     */
    chat(body, options) {
      return request('POST', '/chat/completions', { ...options, body });
    },
    /**
     * @description GET /models: every model with its properties.
     * @param {object} [options] - `{ timeoutMs }`.
     * @returns {Promise<Array<object>>} The models.
     */
    async models(options) {
      const body = await request('GET', '/models', { timeoutMs: 20_000, ...options });
      return Array.isArray(body?.data) ? body.data : [];
    },
    /**
     * @description GET /key: the key of the configuration (spends nothing,
     * proves the key is valid).
     * @param {object} [options] - `{ timeoutMs }`.
     * @returns {Promise<object>} `data` of the answer.
     */
    async key(options) {
      const body = await request('GET', '/key', { timeoutMs: 15_000, retries: false, ...options });
      return body?.data && typeof body.data === 'object' ? body.data : {};
    },
  };
}
