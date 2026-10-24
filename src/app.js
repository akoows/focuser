import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import apiRouter from "./routes/apiRoutes.js";
import { parseApiConfig } from "./config/env.js";
import { createApiRateLimiters } from "./middlewares/rateLimiters.js";
import { HttpError, sendError } from "./utils/apiResponse.js";

const desktopOrigins = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];
const developmentOrigins = [
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
];

export function createApp(config = parseApiConfig()) {
    const app = express();
    const rateLimiters = createApiRateLimiters();
    const allowedOrigins = new Set([
        ...desktopOrigins,
        ...(config.nodeEnv === "production" ? [] : developmentOrigins),
        ...config.corsOrigins,
    ]);

    app.set("trust proxy", config.trustProxy);
    app.locals.rateLimits = config.rateLimits;
    app.use(helmet());
    app.use(cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.has(origin)) return callback(null, true);
            return callback(new HttpError(403, "CORS_ORIGIN_DENIED", "Origem não autorizada pelo CORS."));
        },
        credentials: true,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "X-Focuser-Client"],
        maxAge: 600,
    }));
    app.use(express.json({ limit: "100kb" }));
    app.use(cookieParser());
    app.use("/api", rateLimiters.global);
    app.use("/api/auth", rateLimiters.authIp, (req, res, next) => {
        if (typeof req.body?.email !== "string") return next();
        return rateLimiters.authAccount(req, res, next);
    });
    app.use("/api/auth/login", rateLimiters.loginIp);
    app.use("/api/auth/register", rateLimiters.registrationIp);
    app.use("/api/auth/registration-avatar-signature", rateLimiters.registrationIp);
    app.use("/api/auth/registration-banner-signature", rateLimiters.registrationIp);
    app.use(
        ["/api/auth/verify-email", "/api/auth/resend-verification", "/api/auth/verify-login"],
        rateLimiters.authCodeIp,
    );
    app.use("/api/users/me/password-change", rateLimiters.authCodeIp);

    app.use((req, res, next) => {
        const start = Date.now();
        res.on("finish", () => {
            const duration = Date.now() - start;
            const status = res.statusCode;
            const statusEmoji = status >= 400 ? "❌" : status >= 300 ? "🔀" : "✅";
            console.log(`[${new Date().toISOString()}] ${statusEmoji} ${req.method} ${req.path} - Status: ${status} (${duration}ms)`);
        });
        next();
    });

    app.use("/api", (req, res, next) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)
            && req.get("X-Focuser-Client") !== "web") {
            return res.status(403).json({
                success: false,
                error: { code: "CSRF_PROTECTION", message: "Cabeçalho de proteção CSRF ausente." },
            });
        }
        return next();
    });

    app.use("/api", apiRouter);
    app.use("/api", (_req, res) => res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Rota da API não encontrada." },
    }));
    app.use((error, req, res, _next) => {
        if (req.originalUrl.startsWith("/api")) return sendError(res, error);
        console.error("[server] Request failure.", {
            name: typeof error?.name === "string" ? error.name : "Error",
            code: typeof error?.code === "string" ? error.code : undefined,
        });
        return res.status(500).json({ error: "Erro interno do servidor." });
    });

    return app;
}
