import test from "node:test";
import assert from "node:assert/strict";
import { parseApiConfig } from "./env.js";

const validEnv = {
    NODE_ENV: "test",
    DATABASE_URL: "mongodb://127.0.0.1:27017/focuser_test?replicaSet=rs0",
    JWT_SECRET: "a-test-secret-that-is-at-least-thirty-two-bytes-long",
};

test("API environment accepts documented settings and keeps JWT and cookie expiry aligned", () => {
    const config = parseApiConfig({
        ...validEnv,
        COOKIE_SAMESITE: "strict",
        COOKIE_SECURE: "false",
        JWT_EXPIRES_IN_DAYS: "14",
        BCRYPT_COST: "13",
        RATE_LIMIT_GLOBAL_MAX: "450",
        RATE_LIMIT_REGISTER_MAX: "6",
        RATE_LIMIT_AUTH_CODE_MAX: "8",
        RATE_LIMIT_AI_PER_HOUR: "4",
        RATE_LIMIT_ISBN_LOOKUP_PER_HOUR: "12",
        RATE_LIMIT_EXERCISE_IMAGES_PER_HOUR: "36",
        GROQ_TIMEOUT_MS: "20000",
        GOOGLE_BOOKS_TIMEOUT_MS: "9000",
        TRUST_PROXY: "2",
    });

    assert.equal(config.cookie.sameSite, "strict");
    assert.equal(config.cookie.secure, false);
    assert.equal(config.jwtExpiresIn, "14d");
    assert.equal(config.jwtCookieMaxAgeMs, 14 * 24 * 60 * 60 * 1000);
    assert.equal(config.bcryptCost, 13);
    assert.equal(config.rateLimits.global, 450);
    assert.equal(config.rateLimits.registration, 6);
    assert.equal(config.rateLimits.authCode, 8);
    assert.equal(config.rateLimits.aiPerHour, 4);
    assert.equal(config.rateLimits.isbnPerHour, 12);
    assert.equal(config.rateLimits.exerciseImagesPerHour, 36);
    assert.equal(config.groqTimeoutMs, 20_000);
    assert.equal(config.googleBooksTimeoutMs, 9_000);
    assert.equal(config.trustProxy, 2);
});

test("legacy cookie and JWT setting names remain compatible", () => {
    const config = parseApiConfig({
        ...validEnv,
        COOKIE_SAME_SITE: "none",
        COOKIE_SECURE: "true",
        JWT_EXPIRES_IN: "2h",
    });

    assert.equal(config.cookie.sameSite, "none");
    assert.equal(config.cookie.secure, true);
    assert.equal(config.jwtExpiresIn, "2h");
    assert.equal(config.jwtCookieMaxAgeMs, 2 * 60 * 60 * 1000);
});

test("API uses 1000 global requests per IP per 15 minutes by default", () => {
    const config = parseApiConfig(validEnv);
    assert.equal(config.rateLimits.global, 1_000);
});

test("startup config rejects missing critical settings and malformed values without echoing secrets", () => {
    assert.throws(() => parseApiConfig({}), (error) => {
        assert.match(error.message, /DATABASE_URL/);
        assert.match(error.message, /JWT_SECRET/);
        return true;
    });
    assert.throws(() => parseApiConfig({
        ...validEnv,
        COOKIE_SAMESITE: "none",
        COOKIE_SECURE: "false",
    }), /COOKIE_SECURE/);
    assert.throws(() => parseApiConfig({
        ...validEnv,
        NODE_ENV: "production",
        CORS_ORIGINS: "http://localhost:4173",
    }), /produção/);
    assert.throws(() => parseApiConfig({
        ...validEnv,
        TRUST_PROXY: "true",
    }), /TRUST_PROXY/);
    assert.throws(() => parseApiConfig({
        ...validEnv,
        JWT_SECRET: "short-secret",
    }), (error) => {
        assert.match(error.message, /JWT_SECRET/);
        assert.doesNotMatch(error.message, /short-secret/);
        return true;
    });
});
