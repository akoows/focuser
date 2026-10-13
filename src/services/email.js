import { HttpError } from "../utils/apiResponse.js";

export function assertEmailConfigured() {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
        throw new HttpError(
            503,
            "EMAIL_NOT_CONFIGURED",
            "Verificação por e-mail indisponível: configure RESEND_API_KEY e EMAIL_FROM."
        );
    }
}

export async function sendEmail({ to, subject, text }) {
    assertEmailConfigured();
    let response;
    try {
        response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: process.env.EMAIL_FROM,
                to: [to],
                subject,
                text,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "Não foi possível enviar o e-mail de verificação.");
    }
    if (!response.ok) {
        throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "O provedor de e-mail recusou o envio.");
    }
}

