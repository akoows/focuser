import { z } from "zod";
import { HttpError } from "../utils/apiResponse.js";

const categories = ["Saúde", "Estudos", "Produtividade", "Bem-estar", "Pessoal", "Finanças", "Lazer", "Outro"];
const categorySchema = z.object({ category: z.enum(categories) }).strict();
const prompt = `Classifique o hábito em exatamente uma destas categorias: ${categories.join(", ")}. Considere o nome e a descrição. Retorne somente JSON no formato {"category":"categoria"}.`;

export async function categorizeHabit(name, description) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new HttpError(503, "GROQ_NOT_CONFIGURED", "A classificação de hábitos exige configurar GROQ_API_KEY na API.");
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
            signal: AbortSignal.timeout(10_000),
        });
    } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw new HttpError(504, "GROQ_CATEGORY_TIMEOUT", "A classificação do hábito demorou demais para responder.");
        }
        throw new HttpError(502, "GROQ_CATEGORY_ERROR", "Não foi possível definir a categoria do hábito agora.");
    }
    if (!response.ok) {
        console.warn(`[groq] Classificação de hábito retornou HTTP ${response.status}.`);
        throw new HttpError(502, "GROQ_CATEGORY_ERROR", "Não foi possível definir a categoria do hábito agora.");
    }

    let text;
    try {
        const payload = await response.json();
        text = payload?.choices?.[0]?.message?.content;
    } catch {
        throw new HttpError(502, "GROQ_INVALID_CATEGORY", "O Groq retornou uma resposta inválida para a categoria.");
    }
    let parsed;
    try {
        parsed = JSON.parse(String(text));
    } catch {
        throw new HttpError(502, "GROQ_INVALID_CATEGORY", "O Groq retornou uma categoria inválida.");
    }
    const result = categorySchema.safeParse(parsed);
    if (!result.success) {
        throw new HttpError(502, "GROQ_INVALID_CATEGORY", "O Groq retornou uma categoria inválida.");
    }
    return result.data.category;
}
