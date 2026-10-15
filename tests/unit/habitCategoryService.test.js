'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/focuser_test_placeholder';
process.env.JWT_SECRET = 'segredo-de-teste-apenas-para-testes-0123456789abcdef';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config/env');
const { categories, parseCategory, categorize } = require('../../src/services/habitCategoryService');

test('parses only a known Groq category', () => {
  assert.equal(parseCategory('{"category":"Estudos"}'), 'Estudos');
  assert.throws(() => parseCategory('{"category":"Books"}'), { code: 'GROQ_INVALID_CATEGORY' });
  assert.throws(() => parseCategory('not JSON'), { code: 'GROQ_INVALID_CATEGORY' });
});

test('categorizes a habit through Groq without sending unrelated user data', async (t) => {
  const originalKey = config.groq.apiKey;
  const originalFetch = global.fetch;
  config.groq.apiKey = 'test-key';
  t.after(() => {
    config.groq.apiKey = originalKey;
    global.fetch = originalFetch;
  });
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.authorization, 'Bearer test-key');
    const payload = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(payload.messages[1].content), {
      name: 'Ler todos os dias',
      description: null,
    });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"category":"Estudos"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  assert.equal(await categorize('Ler todos os dias'), 'Estudos');
  assert.ok(categories.includes('Estudos'));
});

test('reports missing Groq configuration instead of inventing a category', async (t) => {
  const originalKey = config.groq.apiKey;
  config.groq.apiKey = '';
  t.after(() => { config.groq.apiKey = originalKey; });
  await assert.rejects(categorize('Caminhar'), { code: 'GROQ_NOT_CONFIGURED', status: 503 });
});
