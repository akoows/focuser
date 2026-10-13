import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/apiResponse.js";
import { assertEmailConfigured, sendEmail } from "./email.js";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CHALLENGES_PER_WINDOW = 5;

export function createAuthCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashAuthCode(code) {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
        throw new HttpError(500, "AUTH_NOT_CONFIGURED", "Configure JWT_SECRET com ao menos 32 bytes.");
    }
    return createHmac("sha256", secret).update(code).digest("hex");
}

function matchesCode(code, expectedHash) {
    const actualHash = Buffer.from(hashAuthCode(code), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export async function issueAuthChallenge(user, purpose) {
    assertEmailConfigured();
    const now = new Date();
    await prisma.authChallenge.deleteMany({
        where: {
            userId: user.id,
            purpose,
            createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
    });
    const recentCount = await prisma.authChallenge.count({
        where: {
            userId: user.id,
            purpose,
            createdAt: { gt: new Date(now.getTime() - CHALLENGE_TTL_MS) },
        },
    });
    if (recentCount >= MAX_CHALLENGES_PER_WINDOW) {
        throw new HttpError(429, "AUTH_CHALLENGE_RATE_LIMITED", "Aguarde antes de solicitar outro código.");
    }
    const code = createAuthCode();
    const codeHash = hashAuthCode(code);
    const subject = purpose === "EMAIL_VERIFICATION" ? "Verifique seu e-mail no Focuser" : "Seu código de acesso ao Focuser";
    const description = purpose === "EMAIL_VERIFICATION"
        ? "Use este código para verificar seu endereço de e-mail:"
        : "Use este código para concluir seu login:";
    await sendEmail({
        to: user.email,
        subject,
        text: `${description}\n\n${code}\n\nO código expira em 10 minutos. Se você não solicitou esta mensagem, ignore-a.`,
    });
    await prisma.authChallenge.deleteMany({
        where: { userId: user.id, purpose, consumedAt: null },
    });
    await prisma.authChallenge.create({
        data: {
            userId: user.id,
            purpose,
            codeHash,
            expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        },
    });
}

export async function consumeAuthChallenge(userId, purpose, code) {
    const now = new Date();
    const challenge = await prisma.authChallenge.findFirst({
        where: {
            userId,
            purpose,
            consumedAt: null,
            expiresAt: { gt: now },
            attemptCount: { lt: MAX_ATTEMPTS },
        },
        orderBy: { createdAt: "desc" },
    });
    if (!challenge) {
        throw new HttpError(400, "INVALID_VERIFICATION_CODE", "Código inválido ou expirado.");
    }
    if (!matchesCode(code, challenge.codeHash)) {
        await prisma.authChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { attemptCount: { increment: 1 } },
        });
        throw new HttpError(400, "INVALID_VERIFICATION_CODE", "Código inválido ou expirado.");
    }
    const consumed = await prisma.authChallenge.updateMany({
        where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: now },
            attemptCount: { lt: MAX_ATTEMPTS },
        },
        data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
        throw new HttpError(400, "INVALID_VERIFICATION_CODE", "Código inválido ou expirado.");
    }
    return challenge;
}
