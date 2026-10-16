import { HttpError } from "../utils/apiResponse.js";

export function buildWorkoutEndUpdate(session, status, timestamp = new Date()) {
    if (session.status !== "IN_PROGRESS") {
        throw new HttpError(409, "INVALID_WORKOUT_STATE", "A sessão já foi encerrada.");
    }
    if (status === "COMPLETED") return { status, completedAt: timestamp };
    if (status === "ABANDONED") return { status, abandonedAt: timestamp };
    throw new HttpError(400, "VALIDATION_ERROR", "Estado final de sessão inválido.");
}
