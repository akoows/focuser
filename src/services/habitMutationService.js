import { HttpError } from "../utils/apiResponse.js";
import { habitTargetCap } from "../validators/index.js";

export function validateHabitPatch(habit, input) {
    const frequency = input.frequency ?? habit.frequency;
    const daysOfWeek = input.daysOfWeek ?? habit.daysOfWeek;
    const dailyTarget = input.dailyTarget ?? habit.dailyTarget ?? 1;
    const step = input.step ?? habit.step ?? 1;
    const unit = input.unit === undefined ? habit.unit : input.unit;
    const cap = habitTargetCap({ unit });
    if (dailyTarget > cap || step > cap || step > dailyTarget) {
        throw new HttpError(400, "VALIDATION_ERROR", "Meta e passo devem respeitar os limites da unidade.");
    }
    if (input.daysOfWeek && frequency !== "CUSTOM") {
        throw new HttpError(400, "VALIDATION_ERROR", "daysOfWeek só pode ser alterado em frequência CUSTOM.");
    }
    if (frequency === "CUSTOM" && daysOfWeek.length === 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "Informe ao menos um dia para frequência CUSTOM.");
    }
}

export function buildHabitPatchMutation(habit, userId, input, category) {
    const data = { ...input };
    if (category !== undefined) data.category = category;
    if (input.frequency === "DAILY") data.daysOfWeek = [0, 1, 2, 3, 4, 5, 6];

    return {
        where: {
            id: habit.id,
            userId,
            dailyTarget: habit.dailyTarget,
            step: habit.step,
            unit: habit.unit,
            frequency: habit.frequency,
            daysOfWeek: { equals: habit.daysOfWeek },
        },
        data,
    };
}

export async function compareAndSetHabitPatch({ habit, userId, input, category, updateMany, findUpdated }) {
    if (typeof updateMany !== "function" || typeof findUpdated !== "function") {
        throw new TypeError("updateMany and findUpdated must be functions.");
    }
    const result = await updateMany(buildHabitPatchMutation(habit, userId, input, category));
    if (result.count !== 1) {
        throw new HttpError(409, "HABIT_CHANGED", "O hábito mudou. Atualize os dados e tente novamente.");
    }
    const updated = await findUpdated();
    if (!updated) throw new HttpError(409, "HABIT_CHANGED", "O hábito mudou. Atualize os dados e tente novamente.");
    return updated;
}
