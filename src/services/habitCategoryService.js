'use strict';
const { z } = require('zod');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const categories = ['Saúde', 'Estudos', 'Produtividade', 'Bem-estar', 'Pessoal', 'Finanças', 'Lazer', 'Outro'];
const categorySchema = z.object({ category: z.enum(categories) }).strict();
const prompt = `Classifique o hábito do usuário em exatamente uma destas categorias: ${categories.join(', ')}. Considere o nome e a descrição. Retorne somente um objeto JSON no formato {"category":"categoria"}.`;

function parseCategory(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).trim());
  } catch {
    throw new AppError(502, 'GROQ_INVALID_CATEGORY', 'O Groq retornou uma categoria inválida.');
  }
  const result = categorySchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(502, 'GROQ_INVALID_CATEGORY', 'O Groq retornou uma categoria inválida.');
  }
  return result.data.category;
}

async function categorize(name, description) {
  if (!config.groq.apiKey) {
    throw new AppError(503, 'GROQ_NOT_CONFIGURED', 'A classificação de hábitos exige configurar GROQ_API_KEY na API.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.groq.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.groq.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify({ name, description: description || null }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn('groq_habit_category_provider_status', { status: response.status });
      throw new AppError(502, 'GROQ_CATEGORY_ERROR', 'Não foi possível definir a categoria do hábito agora.');
    }
    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new AppError(502, 'GROQ_INVALID_CATEGORY', 'O Groq retornou uma resposta inválida para a categoria.');
    }
    return parseCategory(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      logger.warn('groq_habit_category_timeout');
      throw new AppError(504, 'GROQ_CATEGORY_TIMEOUT', 'A classificação do hábito demorou demais para responder.');
    }
    if (error instanceof AppError) throw error;
    logger.warn('groq_habit_category_failed', { ...(error?.name ? { errName: error.name } : {}) });
    throw new AppError(502, 'GROQ_CATEGORY_ERROR', 'Não foi possível definir a categoria do hábito agora.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { categories, parseCategory, categorize };
