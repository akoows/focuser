import { HttpError } from "../utils/apiResponse.js";

export function goalMutationWhere(goal, userId, requireActive = false) {
    return {
        id: goal.id,
        userId,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        ...(requireActive ? { isActive: true } : {}),
    };
}

export async function compareAndSetGoalUpdate({ goal, userId, data, updateMany, requireActive = false }) {
    if (typeof updateMany !== "function") {
        throw new TypeError("updateMany must be a function.");
    }
    const result = await updateMany({
        where: goalMutationWhere(goal, userId, requireActive),
        data,
    });
    if (result.count !== 1) {
        throw new HttpError(409, "GOAL_CHANGED", "A meta mudou. Atualize e tente novamente.");
    }
    return result;
}
