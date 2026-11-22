# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **ai:** the Gladys AI provider on OpenRouter, with the administrator's own API key: the chat and its tool calls, the intent router, the scene "ask the AI" action and the weekly digest
- **models:** a chat model and a fast router model among aliases that follow the newest Claude, GPT, Gemini and DeepSeek models, OpenRouter's Auto and Free routers, or any other model id; reasoning level adapted to what each model accepts, from the live model catalog; reasoning details passed back with the tool results
- **privacy:** restrict the requests to providers without data collection, or with zero data retention
- **scenes:** "ask with web search" action (OpenRouter web plugin, answer and sources as outputs); triggers when the assistant fails (key refused, no credits left, rate limit, model unavailable, API unreachable) and when it answers again
- **widgets:** requests, cost of the day and of the month, credit left on the key or free requests of the day, cost per day over 30 days, last answer and last error
- **configuration:** "Test the connection" button; connection status checked without spending anything
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README
