import { addDateKeyDays, dateKeyStartInTimezone } from "../utils/date.js";

export function buildWorkoutCalendarQuery(userId, date, timezone) {
    return {
        where: {
            userId,
            status: "COMPLETED",
            completedAt: {
                gte: dateKeyStartInTimezone(date, timezone),
                lt: dateKeyStartInTimezone(addDateKeyDays(date, 1), timezone),
            },
        },
        orderBy: { completedAt: "asc" },
        take: 100,
    };
}
