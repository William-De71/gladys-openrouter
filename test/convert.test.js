import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiCompletion } from '@gladysassistant/integration-sdk';
import {
  createReasoningStore,
  hasImages,
  MISSING_OUTPUT,
  textOf,
  toOpenAiCompletion,
  toOpenRouterMessages,
  toOpenRouterToolChoice,
  toOpenRouterTools,
} from '../src/convert.js';

const call = (id, name = 'device_set_value', args = '{}') => ({
  id,
  type: 'function',
  function: { name, arguments: args },
});

test('a tool-calling turn of the core goes through, calls and results paired', () => {
  const messages = toOpenRouterMessages([
    { role: 'system', content: 'You are Gladys.' },
    { role: 'developer', content: [{ type: 'text', text: 'Be brief.' }] },
    { role: 'user', content: 'Allume le salon' },
    { role: 'assistant', content: 'Je regarde.', tool_calls: [] },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        call('call_abc', 'device_set_value', '{"room":"salon"}'),
        {
          id: 'toolu_02',
          type: 'function',
          function: { name: 'device_get_state', arguments: { room: 'salon' } },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_abc', content: 'ok' },
    { role: 'tool', tool_call_id: 'toolu_02', content: [{ type: 'text', text: '{"on":true}' }] },
    { role: 'function', content: 'legacy' },
  ]);
  assert.deepEqual(messages, [
    { role: 'system', content: 'You are Gladys.' },
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Allume le salon' },
    { role: 'assistant', content: 'Je regarde.' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        call('call_abc', 'device_set_value', '{"room":"salon"}'),
        call('toolu_02', 'device_get_state', '{"room":"salon"}'),
      ],
    },
    { role: 'tool', tool_call_id: 'call_abc', content: 'ok' },
    { role: 'tool', tool_call_id: 'toolu_02', content: '{"on":true}' },
  ]);
});

test('placeholder ids, lone calls, orphan results and duplicate ids are repaired', () => {
  const messages = toOpenRouterMessages([
    { role: 'user', content: 'x' },
    { role: 'assistant', content: null, tool_calls: [call('unknown'), call('unknown')] },
    { role: 'tool', tool_call_id: 'unknown', content: 'first' },
    { role: 'tool', tool_call_id: 'tool_call_unknown', content: 'second' },
    { role: 'tool', tool_call_id: 'unknown', content: 'orphan' },
    { role: 'assistant', content: null, tool_calls: [call('call_1'), call('call_1')] },
    { role: 'tool', tool_call_id: 'call_1', content: 'only one result' },
    { role: 'user', content: 'y' },
  ]);
  const [a, b] = messages[1].tool_calls;
  assert.match(a.id, /^call_[0-9a-f]{24}$/);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(messages[2], { role: 'tool', tool_call_id: a.id, content: 'first' });
  assert.deepEqual(messages[3], { role: 'tool', tool_call_id: b.id, content: 'second' });
  assert.equal(messages[4].role, 'assistant', 'the orphan result is dropped');
  const [c, d] = messages[4].tool_calls;
  assert.equal(c.id, 'call_1');
  assert.notEqual(d.id, 'call_1', 'a duplicate id gets its own');
  assert.deepEqual(messages[5], {
    role: 'tool',
    tool_call_id: 'call_1',
    content: 'only one result',
  });
  assert.deepEqual(messages[6], { role: 'tool', tool_call_id: d.id, content: MISSING_OUTPUT });
  assert.deepEqual(messages[7], { role: 'user', content: 'y' });
  // The same history gives the same ids: the provider cache stays warm.
  assert.deepEqual(
    toOpenRouterMessages([
      { role: 'user', content: 'x' },
      { role: 'assistant', content: null, tool_calls: [call('unknown')] },
    ]),
    toOpenRouterMessages([
      { role: 'user', content: 'x' },
      { role: 'assistant', content: null, tool_calls: [call('unknown')] },
    ]),
  );
});

test('images go through as image_url parts; text-only parts become a string', () => {
  const [user] = toOpenRouterMessages([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Qui est à la porte ?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA', detail: 'low' } },
        { type: 'input_audio', input_audio: {} },
      ],
    },
  ]);
  assert.deepEqual(user.content, [
    { type: 'text', text: 'Qui est à la porte ?' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA', detail: 'low' } },
  ]);
  assert.equal(
    toOpenRouterMessages([{ role: 'user', content: ['a', { type: 'text', text: 'b' }] }])[0]
      .content,
    'a\nb',
  );
  assert.equal(hasImages([{ role: 'user', content: [{ type: 'image_url' }] }]), true);
  assert.equal(hasImages([{ role: 'user', content: 'x' }]), false);
  assert.equal(textOf(null), '');
});

test('tools keep known keys only, tool_choice is kept or normalized', () => {
  assert.deepEqual(
    toOpenRouterTools([
      {
        type: 'function',
        function: { name: 'a', description: 'A', parameters: { type: 'object' }, strict: true },
      },
      { type: 'function', function: { name: 'b', parameters: [] } },
      { type: 'web_search' },
    ]),
    [
      {
        type: 'function',
        function: { name: 'a', parameters: { type: 'object' }, description: 'A' },
      },
      { type: 'function', function: { name: 'b', parameters: { type: 'object', properties: {} } } },
    ],
  );
  assert.equal(toOpenRouterToolChoice('required'), 'required');
  assert.equal(toOpenRouterToolChoice('any'), 'required');
  assert.equal(toOpenRouterToolChoice('none'), 'none');
  assert.deepEqual(toOpenRouterToolChoice({ type: 'function', function: { name: 'a' } }), {
    type: 'function',
    function: { name: 'a' },
  });
  assert.equal(toOpenRouterToolChoice(undefined), undefined);
});

test('the answer is bounded like the core bounds it, and passes validateAiCompletion', () => {
  const calls = Array.from({ length: 25 }, (_, i) => call(`call_${i}`, `tool_${i}`));
  calls.push(call('bad', 'not a valid name!'));
  calls.push({ type: 'function', function: { name: 'no_id', arguments: { a: 1 } } });
  const completion = toOpenAiCompletion({
    id: 'gen-1',
    model: 'anthropic/claude-haiku-5.5',
    choices: [
      { finish_reason: 'stop', message: { role: 'assistant', content: null, tool_calls: calls } },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.1 },
  });
  const message = completion.choices[0].message;
  assert.equal(message.tool_calls.length, 20);
  assert.equal(message.content, null);
  assert.equal(completion.choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(validateAiCompletion(completion), []);
  const text = toOpenAiCompletion({
    choices: [
      {
        message: {
          content: [
            { type: 'text', text: 'Bon' },
            { type: 'text', text: 'jour' },
          ],
        },
      },
    ],
  });
  assert.equal(text.choices[0].message.content, 'Bonjour');
  assert.deepEqual(validateAiCompletion(toOpenAiCompletion({})), []);
  assert.equal(toOpenAiCompletion({}).choices[0].message.content, '');
});

test('reasoning_details are remembered by the first call id, then expire', () => {
  let now = 0;
  const store = createReasoningStore({ max: 2, ttlMs: 1000, now: () => now });
  const details = [{ type: 'reasoning.text', text: 'hmm', signature: 'sig' }];
  toOpenAiCompletion(
    {
      choices: [
        {
          message: {
            content: null,
            reasoning: 'hmm',
            reasoning_details: details,
            tool_calls: [call('toolu_A'), call('toolu_B')],
          },
        },
      ],
    },
    { reasoning: store },
  );
  assert.deepEqual(store.recall('toolu_A'), details);
  assert.equal(store.recall('toolu_B'), undefined);
  const [, assistant] = toOpenRouterMessages(
    [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: null, tool_calls: [call('toolu_A'), call('toolu_B')] },
    ],
    store,
  );
  assert.deepEqual(assistant.reasoning_details, details);
  // A turn without tool calls keeps nothing.
  toOpenAiCompletion(
    { choices: [{ message: { content: 'ok', reasoning_details: details } }] },
    { reasoning: store },
  );
  assert.equal(store.size(), 1);
  store.remember('x', details);
  store.remember('y', details);
  assert.equal(store.recall('toolu_A'), undefined, 'the oldest one is dropped beyond max');
  now = 5000;
  assert.equal(store.recall('y'), undefined, 'expired');
});
