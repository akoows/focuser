import { HttpError } from "../utils/apiResponse.js";

export function assertEmailConfigured() {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
        throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "O envio de e-mails não está configurado. Defina RESEND_API_KEY e RESEND_FROM no servidor.");
    }
}

export async function sendAuthCode({ to, code, purpose }) {
    assertEmailConfigured();
    const action = purpose === "login"
        ? "confirmar seu login"
        : purpose === "password-change"
            ? "confirmar a alteração da sua senha"
            : "verificar seu e-mail";
    const subject = purpose === "login"
        ? "Seu código de acesso ao Focuser"
        : purpose === "password-change"
            ? "Confirme a alteração da sua senha do Focuser"
            : "Verifique seu e-mail do Focuser";

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: process.env.RESEND_FROM,
                to: [to],
                subject,
                text: `Use o código ${code} para ${action}. Ele expira em 10 minutos.`,
                html: `<p>Use este código para ${action}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>O código expira em 10 minutos. Se você não solicitou, ignore esta mensagem.</p>`,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            console.warn(`[email] Resend retornou HTTP ${response.status}.`);
            throw new Error("Resend request failed.");
        }
    } catch (error) {
        if (error instanceof HttpError) throw error;
        console.error("[email] Falha ao enviar código de autenticação.", error);
        throw new HttpError(503, "EMAIL_DELIVERY_FAILED", "Não foi possível enviar o código por e-mail. Tente novamente.");
    }
}
