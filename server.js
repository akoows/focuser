import express from "express";
import cors from "cors";
import { router } from "./src/index.js";

const app = express();
app.use(cors());
app.use(express.json());

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

// Rotas
app.use(router);

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