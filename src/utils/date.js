import { HttpError } from "./apiResponse.js";

export const MAX_BACKDATE_DAYS = 7;

export function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateKeyInTimezone(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function dateKeyStartInTimezone(dateKey, timezone) {
    if (!isDateKey(dateKey)) throw new HttpError(400, "VALIDATION_ERROR", "Data deve estar no formato YYYY-MM-DD.");
    const [year, month, day] = dateKey.split("-").map(Number);
    const target = Date.UTC(year, month - 1, day);
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });
    let timestamp = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
            .map(({ type, value }) => [type, value]));
        const represented = Date.UTC(
            Number(parts.year), Number(parts.month) - 1, Number(parts.day),
            Number(parts.hour), Number(parts.minute), Number(parts.second),
        );
        const correction = target - represented;
        timestamp += correction;
        if (correction === 0) return new Date(timestamp);
    }
    return new Date(timestamp);
}

export function dateKeyToUtcDate(dateKey) {
    return new Date(`${dateKey}T12:00:00.000Z`);
}

export function addDateKeyDays(dateKey, amount) {
    const date = new Date(`${dateKey}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
    const fromTime = Date.parse(`${from}T00:00:00.000Z`);
    const toTime = Date.parse(`${to}T00:00:00.000Z`);
    return Math.round((toTime - fromTime) / 86400000) + 1;
}

export function weekdayForDateKey(dateKey) {
    return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

export function startOfWeek(dateKey) {
    const weekday = weekdayForDateKey(dateKey);
    return addDateKeyDays(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

export function dateRange(from, to, maxDays = 366) {
    if (!isDateKey(from) || !isDateKey(to) || from > to) {
        throw new HttpError(400, "VALIDATION_ERROR", "Intervalo de datas inválido.");
    }
    const days = daysBetween(from, to);
    if (days > maxDays) {
        throw new HttpError(422, "RANGE_TOO_LARGE", `O intervalo não pode exceder ${maxDays} dias.`);
    }
    return Array.from({ length: days }, (_, index) => addDateKeyDays(from, index));
}

export function isHabitScheduled(habit, dateKey) {
    if (dateKey < habit.startDateKey
        && daysBetween(dateKey, habit.startDateKey) - 1 > MAX_BACKDATE_DAYS) return false;
    return habit.frequency === "DAILY" || habit.daysOfWeek.includes(weekdayForDateKey(dateKey));
}

export function resolvePeriod(query, today) {
    if (query.from || query.to) {
        if (!query.from || !query.to) {
            throw new HttpError(400, "VALIDATION_ERROR", "Informe from e to juntos.");
        }
        return { from: query.from, to: query.to, type: "custom" };
    }

    const period = query.period ?? "week";
    if (!["week", "month"].includes(period)) {
        throw new HttpError(400, "VALIDATION_ERROR", "O período deve ser week ou month.");
    }
    const days = period === "week" ? 7 : 30;
    return { from: addDateKeyDays(today, -(days - 1)), to: today, type: period };
}
