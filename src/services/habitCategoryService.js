import { z } from "zod";
import { readIntegerSetting } from "../config/env.js";

export const HABIT_CATEGORIES = ["Saúde", "Estudos", "Produtividade", "Bem-estar", "Pessoal", "Finanças", "Lazer", "Outro"];
const categorySchema = z.object({ category: z.enum(HABIT_CATEGORIES) }).strict();
const prompt = `Classifique o hábito em exatamente uma destas categorias: ${HABIT_CATEGORIES.join(", ")}. Considere o nome e a descrição. Retorne somente JSON no formato {"category":"categoria"}.`;

const HEURISTIC_RULES = [
    ["Saúde", ["agua", "hidrat", "beber", "exercic", "trein", "academia", "corrid", "caminhad", "along", "abdominal", "flex", "supino", "remada", "vitamin", "medic", "remedi", "consulta", "dentista", "peso"]],
    ["Estudos", ["estud", "ler", "leitura", "livro", "pagina", "curso", "ingles", "idioma", "prova", "resumo", "faculdade", "aula", "vocabulary", "anki"]],
    ["Bem-estar", ["dormir", "sono", "medi", "respir", "gratid", "reflex", "orac", "yoga", "silencio", "ansiedad", "terapia", "journal", "diario", "gratidao"]],
    ["Produtividade", ["tarefa", "lista", "email", "inbox", "projeto", "planej", "metr", "pomodoro", "foco", "revisar", "organizar", "limpar", "arrumar"]],
    ["Finanças", ["invest", "poupar", "poupa", "economiz", "financ", "orcament", "fatura", "gast", "conta"]],
    ["Lazer", ["jogo", "game", "filme", "serie", "musica", "desenh", "socia", "passeio", "viagem", "hobby"]],
    ["Pessoal", ["banho", "pele", "cabelo", "foto", "ligar", "familia", "amig", "oracao-mae"]],
];

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

export function heuristicCategory(name, description) {
    const text = normalizeText(`${name} ${description || ""}`);
    for (const [category, keywords] of HEURISTIC_RULES) {
        if (keywords.some((keyword) => text.includes(keyword))) return category;
    }
    return "Outro";
}

export async function categorizeHabit(name, description) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return heuristicCategory(name, description);
    }

    let response;
    try {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
                temperature: 0,
                max_tokens: 80,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: JSON.stringify({ name, description: description || null }) },
                ],
            }),
            signal: AbortSignal.timeout(readIntegerSetting(process.env, "GROQ_TIMEOUT_MS", 15_000, { min: 500, max: 120_000 })),
        });
    } catch (error) {
        console.warn(`[groq] Falha na classificação (${error?.name || "Error"}); usando categoria heurística.`);
        return heuristicCategory(name, description);
    }
    if (!response.ok) {
        console.warn(`[groq] Classificação de hábito retornou HTTP ${response.status}; usando categoria heurística.`);
        return heuristicCategory(name, description);
    }

    let text;
    try {
        const payload = await response.json();
        text = payload?.choices?.[0]?.message?.content;
    } catch {
        return heuristicCategory(name, description);
    }
    let parsed;
    try {
        parsed = JSON.parse(String(text));
    } catch {
        return heuristicCategory(name, description);
    }
    const result = categorySchema.safeParse(parsed);
    if (!result.success) {
        return heuristicCategory(name, description);
    }
    return result.data.category;
}
