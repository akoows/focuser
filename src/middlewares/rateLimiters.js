import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";

export const rateLimitResponse = {
    success: false,
    error: { code: "RATE_LIMITED", message: "Muitas requisições. Aguarde antes de tentar novamente." },
};

function options({ windowMs, max, keyGenerator }) {
    return {
        windowMs,
        max,
        ...(keyGenerator ? { keyGenerator } : {}),
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => res.status(429).json(rateLimitResponse),
    };
}

export function createUserRateLimiter(limitKey) {
    return rateLimit(options({
        windowMs: 60 * 60 * 1000,
        max: (req) => req.app.locals.rateLimits[limitKey],
        keyGenerator: (req) => req.user.id,
    }));
}

export const userRateLimiters = {
    aiPerHour: createUserRateLimiter("aiPerHour"),
    isbnPerHour: createUserRateLimiter("isbnPerHour"),
    exerciseImagesPerHour: createUserRateLimiter("exerciseImagesPerHour"),
};

export function createApiRateLimiters() {
    return {
        global: rateLimit(options({
            windowMs: 15 * 60 * 1000,
            max: (req) => req.app.locals.rateLimits.global,
        })),
        authIp: rateLimit(options({ windowMs: 15 * 60 * 1000, max: 30 })),
        loginIp: rateLimit(options({
            windowMs: 15 * 60 * 1000,
            max: (req) => req.app.locals.rateLimits.login,
        })),
        registrationIp: rateLimit(options({
            windowMs: 60 * 60 * 1000,
            max: (req) => req.app.locals.rateLimits.registration,
        })),
        authCodeIp: rateLimit(options({
            windowMs: 15 * 60 * 1000,
            max: (req) => req.app.locals.rateLimits.authCode,
        })),
        authAccount: rateLimit(options({
            windowMs: 15 * 60 * 1000,
            max: (req) => req.app.locals.rateLimits.authCode,
            keyGenerator: (req) => createHash("sha256")
                .update(req.body.email.trim().toLowerCase())
                .digest("hex"),
        })),
        aiPerUser: userRateLimiters.aiPerHour,
        isbnPerUser: userRateLimiters.isbnPerHour,
    };
}
