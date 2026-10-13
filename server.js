import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRouter from "./src/routes/apiRoutes.js";
import { HttpError, sendError } from "./src/utils/apiResponse.js";

const app = express();
const desktopOrigins = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];
const developmentOrigins = process.env.NODE_ENV === "production" ? [] : [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
];
const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",");
const allowedOrigins = new Set(
    [
        ...desktopOrigins,
        ...developmentOrigins,
        ...configuredOrigins,
    ]
        .map((origin) => origin.trim())
        .filter(Boolean)
);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new HttpError(403, "CORS_ORIGIN_DENIED", "Origem não autorizada pelo CORS."));
    },
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Middleware de log das requisições (método, rota, status e tempo de resposta)
app.use((req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        const timestamp = new Date().toISOString();
        const status = res.statusCode;
        const statusEmoji = status >= 400 ? "❌" : status >= 300 ? "🔀" : "✅";

        console.log(
            `[${timestamp}] ${statusEmoji} ${req.method} ${req.originalUrl} - Status: ${status} (${duration}ms)`
        );
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

app.use("/api", (req, res) => res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Rota da API não encontrada." },
}));

app.use((error, req, res, _next) => {
    if (req.originalUrl.startsWith("/api")) return sendError(res, error);
    console.error("[server]", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
});

// Iniciando servidor e exibindo painel no terminal
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

app.listen(PORT, () => {
    console.log("\n========================================");
    console.log("🚀 SERVIDOR INICIALIZADO COM SUCESSO");
    console.log("========================================");
    console.log(`📍 URL Local:   http://localhost:${PORT}`);
    console.log(`🛠️  Ambiente:    ${NODE_ENV}`);
    console.log(`✅ Rotas:       Mapeadas e prontas`);
    console.log(`⏰ Data/Hora:   ${new Date().toLocaleString("pt-BR")}`);
    console.log("========================================\n");
});