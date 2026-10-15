'use strict';
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function assertConfigured() {
  if (!config.resend.apiKey || !config.resend.from) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'O envio de e-mails não está configurado. Defina RESEND_API_KEY e RESEND_FROM no servidor.');
  }
}

async function sendCode({ to, code, purpose }) {
  assertConfigured();
  const isLogin = purpose === 'login';
  const isPasswordChange = purpose === 'password-change';
  const action = isPasswordChange ? 'confirmar a alteração da sua senha' : isLogin ? 'confirmar seu login' : 'verificar seu e-mail';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.resend.from,
        to: [to],
        subject: isPasswordChange ? 'Confirme a alteração da sua senha do Focuser' : isLogin ? 'Seu código de acesso ao Focuser' : 'Verifique seu e-mail do Focuser',
        text: `Use o código ${code} para ${action}. Ele expira em 10 minutos.`,
        html: `<p>Use este código para ${action}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>O código expira em 10 minutos. Se você não solicitou, ignore esta mensagem.</p>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend API retornou HTTP ${response.status}`);
  } catch (error) {
    logger.error('Falha ao enviar código de autenticação por e-mail', error);
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Não foi possível enviar o código por e-mail. Tente novamente.');
  }
}

module.exports = { assertConfigured, sendCode };
