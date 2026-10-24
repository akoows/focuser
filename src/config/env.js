const DEFAULTS = {
    port: 3000,
    jwtExpiresInDays: 7,
    bcryptCost: 12,
    globalRateLimit: 1_000,
    loginRateLimit: 10,
    registrationRateLimit: 10,
    authCodeRateLimit: 10,
    aiRateLimit: 5,
    isbnRateLimit: 20,
    exerciseImagesRateLimit: 60,
    groqTimeoutMs: 15_000,
    googleBooksTimeoutMs: 8_000,
};
const MAX_JWT_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function parseInteger(value, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === "") return fallback;
    if (!/^\d+$/.test(String(value))) throw new Error(`${name} deve ser um número inteiro.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} deve estar entre ${min} e ${max}.`);
    }
    return parsed;
}

function parseBoolean(value, name, fallback) {
    if (value === undefined || value === "") return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${name} deve ser "true" ou "false".`);
}

function parseJwtSettings(env) {
    const secret = env.JWT_SECRET;
    if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
        throw new Error("JWT_SECRET é obrigatório e deve conter ao menos 32 bytes.");
    }

    if (env.JWT_EXPIRES_IN) {
        const match = /^([1-9]\d*)(s|m|h|d)$/i.exec(env.JWT_EXPIRES_IN);
        if (!match) throw new Error("JWT_EXPIRES_IN deve usar segundos, minutos, horas ou dias (ex.: 7d).");
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
        const maxAmount = Math.floor(MAX_JWT_AGE_MS / unitMs);
        if (!Number.isSafeInteger(amount) || amount > maxAmount) {
            throw new Error("A validade do JWT não pode exceder 365 dias.");
        }
        return {
            secret,
            expiresIn: `${amount}${unit}`,
            maxAgeMs: amount * unitMs,
        };
    }

    const days = parseInteger(
        env.JWT_EXPIRES_IN_DAYS,
        "JWT_EXPIRES_IN_DAYS",
        DEFAULTS.jwtExpiresInDays,
        { max: 365 },
    );
    return { secret, expiresIn: `${days}d`, maxAgeMs: days * 86_400_000 };
}

function parseOrigin(origin) {
    if (["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"].includes(origin)) {
        return origin;
    }
    let parsed;
    try {
        parsed = new URL(origin);
    } catch {
        throw new Error("CORS_ORIGINS contém uma origem inválida.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)
        || parsed.origin !== origin
        || parsed.username
        || parsed.password) {
        throw new Error("CORS_ORIGINS deve conter somente origens HTTP(S) válidas, sem caminhos ou credenciais.");
    }
    return origin;
}

function parseCorsOrigins(env, nodeEnv) {
    const origins = (env.CORS_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(parseOrigin);
    if (nodeEnv === "production") {
        if (!origins.length) throw new Error("CORS_ORIGINS deve ser configurada em produção.");
        if (origins.some((origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))) {
            throw new Error("CORS_ORIGINS não pode permitir localhost em produção.");
        }
        if (origins.some((origin) => origin.startsWith("http://") && !origin.startsWith("http://tauri.localhost"))) {
            throw new Error("Origens web de produção devem usar HTTPS.");
        }
    }
    return origins;
}

export function readIntegerSetting(env, name, fallback, options) {
    return parseInteger(env[name], name, fallback, options);
}

export function readJwtSettings(env = process.env) {
    return parseJwtSettings(env);
}

export function readCookieSettings(env = process.env) {
    const sameSite = (env.COOKIE_SAMESITE || env.COOKIE_SAME_SITE || "lax").toLowerCase();
    if (!["lax", "strict", "none"].includes(sameSite)) {
        throw new Error("COOKIE_SAMESITE deve ser lax, strict ou none.");
    }
    const production = env.NODE_ENV === "production";
    const secure = parseBoolean(env.COOKIE_SECURE, "COOKIE_SECURE", production);
    if (production && !secure) throw new Error("COOKIE_SECURE deve ser true em produção.");
    if (sameSite === "none" && !secure) {
        throw new Error('COOKIE_SECURE deve ser true quando COOKIE_SAMESITE="none".');
    }
    return { sameSite, secure };
}

export function parseApiConfig(env = process.env) {
    const errors = [];
    const collect = (operation, fallback) => {
        try {
            return operation();
        } catch (error) {
            errors.push(error.message);
            return fallback;
        }
    };

    const nodeEnv = env.NODE_ENV || "development";
    if (!["development", "test", "production"].includes(nodeEnv)) {
        errors.push("NODE_ENV deve ser development, test ou production.");
    }

    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        errors.push("DATABASE_URL é obrigatório.");
    } else {
        try {
            const parsed = new URL(databaseUrl);
            if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol) || !parsed.pathname.slice(1)) {
                errors.push("DATABASE_URL deve apontar para um banco MongoDB com nome definido.");
            }
        } catch {
            errors.push("DATABASE_URL não contém uma URL MongoDB válida.");
        }
    }

    const jwtSettings = collect(() => parseJwtSettings(env), {
        expiresIn: `${DEFAULTS.jwtExpiresInDays}d`,
        maxAgeMs: DEFAULTS.jwtExpiresInDays * 86_400_000,
    });
    const cookieSettings = collect(() => readCookieSettings({ ...env, NODE_ENV: nodeEnv }), {
        sameSite: "lax",
        secure: nodeEnv === "production",
    });
    const rateLimits = {
        global: collect(() => parseInteger(env.RATE_LIMIT_GLOBAL_MAX, "RATE_LIMIT_GLOBAL_MAX", DEFAULTS.globalRateLimit), DEFAULTS.globalRateLimit),
        login: collect(() => parseInteger(env.RATE_LIMIT_LOGIN_MAX, "RATE_LIMIT_LOGIN_MAX", DEFAULTS.loginRateLimit), DEFAULTS.loginRateLimit),
        registration: collect(() => parseInteger(env.RATE_LIMIT_REGISTER_MAX, "RATE_LIMIT_REGISTER_MAX", DEFAULTS.registrationRateLimit), DEFAULTS.registrationRateLimit),
        authCode: collect(() => parseInteger(env.RATE_LIMIT_AUTH_CODE_MAX, "RATE_LIMIT_AUTH_CODE_MAX", DEFAULTS.authCodeRateLimit), DEFAULTS.authCodeRateLimit),
        aiPerHour: collect(() => parseInteger(env.RATE_LIMIT_AI_PER_HOUR, "RATE_LIMIT_AI_PER_HOUR", DEFAULTS.aiRateLimit), DEFAULTS.aiRateLimit),
        isbnPerHour: collect(() => parseInteger(env.RATE_LIMIT_ISBN_LOOKUP_PER_HOUR, "RATE_LIMIT_ISBN_LOOKUP_PER_HOUR", DEFAULTS.isbnRateLimit), DEFAULTS.isbnRateLimit),
        exerciseImagesPerHour: collect(() => parseInteger(env.RATE_LIMIT_EXERCISE_IMAGES_PER_HOUR, "RATE_LIMIT_EXERCISE_IMAGES_PER_HOUR", DEFAULTS.exerciseImagesRateLimit), DEFAULTS.exerciseImagesRateLimit),
    };
    const port = collect(() => parseInteger(env.PORT, "PORT", DEFAULTS.port, { max: 65_535 }), DEFAULTS.port);
    const trustProxy = collect(() => parseInteger(env.TRUST_PROXY, "TRUST_PROXY", 0, { min: 0, max: 10 }), 0);
    const bcryptCost = collect(() => parseInteger(env.BCRYPT_COST, "BCRYPT_COST", DEFAULTS.bcryptCost, { min: 4, max: 15 }), DEFAULTS.bcryptCost);
    const groqTimeoutMs = collect(() => parseInteger(env.GROQ_TIMEOUT_MS, "GROQ_TIMEOUT_MS", DEFAULTS.groqTimeoutMs, { min: 500, max: 120_000 }), DEFAULTS.groqTimeoutMs);
    const googleBooksTimeoutMs = collect(() => parseInteger(env.GOOGLE_BOOKS_TIMEOUT_MS, "GOOGLE_BOOKS_TIMEOUT_MS", DEFAULTS.googleBooksTimeoutMs, { min: 500, max: 120_000 }), DEFAULTS.googleBooksTimeoutMs);
    const corsOrigins = collect(() => parseCorsOrigins(env, nodeEnv), []);

    if (errors.length) throw new Error(`Configuração inválida da API: ${[...new Set(errors)].join(" ")}`);

    return {
        nodeEnv,
        port,
        trustProxy,
        corsOrigins,
        cookie: cookieSettings,
        jwtExpiresIn: jwtSettings.expiresIn,
        jwtCookieMaxAgeMs: jwtSettings.maxAgeMs,
        bcryptCost,
        rateLimits,
        groqTimeoutMs,
        googleBooksTimeoutMs,
    };
}
