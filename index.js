// -----------------------------------------------------------------------------
// Entry point of the OpenRouter external integration.
//
// An AI provider (manifest `type: "ai"`): once an administrator selects it in
// Settings, Artificial Intelligence, every AI request of the Gladys instance —
// the chat and its tool calls, the intent router, the scene `ai.ask` action,
// the weekly digest — is answered through OpenRouter, by the model the
// administrator chose among 400+, with their own API key. On top of that:
//   - scene action: a question answered with OpenRouter's web search;
//   - scene triggers: OpenRouter fails / answers again;
//   - dashboard widget: requests, cost and credit left.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the days of the usage counters)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the OpenRouter integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
