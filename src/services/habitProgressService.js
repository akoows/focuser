import { prisma } from "../lib/prisma.js";
import { addDateKeyDays, isHabitScheduled } from "../utils/date.js";

export function getCheckInCounts(checkIns) {
    const counts = new Map();
    for (const checkIn of checkIns) {
        const key = `${checkIn.habitId}:${checkIn.dateKey}`;
        counts.set(key, Math.max(counts.get(key) ?? 0, checkIn.occurrence ?? 1));
    }
    return counts;
}

export function getNextCheckInOccurrence(existingCheckIns, dailyTarget, amount = 1) {
    const completed = existingCheckIns.reduce(
        (count, item) => Math.max(count, item.occurrence ?? 1),
        0
    );
    return completed + amount > dailyTarget ? null : completed + amount;
}

export function getCompletedCheckInSet(habits, checkInsOrCounts) {
    const checkInCounts = checkInsOrCounts instanceof Map
        ? checkInsOrCounts
        : getCheckInCounts(checkInsOrCounts);
    const targets = new Map(habits.map((habit) => [habit.id, habit.dailyTarget ?? 1]));
    const completed = new Set();

    for (const [key, count] of checkInCounts) {
        const separator = key.indexOf(":");
        const habitId = key.slice(0, separator);
        if (count >= (targets.get(habitId) ?? Number.POSITIVE_INFINITY)) completed.add(key);
    }

    return completed;
}

export function getStreakStats(habits, checkInSet, today) {
    const dateKeys = Array.from({ length: 365 }, (_, index) => addDateKeyDays(today, -index));
    let currentStreak = 0;
    let bestStreak = 0;
    let runningStreak = 0;
    let currentIsOpen = true;

    for (const dateKey of dateKeys) {
        const scheduled = habits.filter((habit) => isHabitScheduled(habit, dateKey));
        if (scheduled.length === 0) continue;
        const complete = scheduled.every((habit) => checkInSet.has(`${habit.id}:${dateKey}`));
        if (complete) {
            runningStreak += 1;
            bestStreak = Math.max(bestStreak, runningStreak);
            if (currentIsOpen) currentStreak += 1;
        } else {
            currentIsOpen = false;
            runningStreak = 0;
        }
    }
    return { currentStreak, bestStreak };
}

export function getStreakWindow(throughDate) {
    return {
        from: addDateKeyDays(throughDate, -364),
        to: throughDate,
    };
}

export function buildHabitHistorySeries(habit, dates, values) {
    const target = habit.dailyTarget ?? 1;
    return dates.map((date) => {
        const value = values.get(date) ?? 0;
        const scheduled = isHabitScheduled(habit, date);
        return { date, scheduled, value, target, completed: scheduled && value >= target };
    });
}

export function getHabitStreak(habit, checkInSet, throughDate) {
    let currentStreak = 0;
    let longestStreak = 0;
    let runningStreak = 0;
    let currentIsOpen = true;

    for (let index = 0; index < 365; index += 1) {
        const dateKey = addDateKeyDays(throughDate, -index);
        if (dateKey < habit.startDateKey) break;
        if (!isHabitScheduled(habit, dateKey)) continue;
        if (checkInSet.has(`${habit.id}:${dateKey}`)) {
            runningStreak += 1;
            longestStreak = Math.max(longestStreak, runningStreak);
            if (currentIsOpen) currentStreak += 1;
        } else {
            currentIsOpen = false;
            runningStreak = 0;
        }
    }
    return { currentStreak, longestStreak };
}

export async function refreshHabitStreak(habit, throughDate) {
    const { from } = getStreakWindow(throughDate);
    const checkIns = await prisma.checkIn.findMany({
        where: { habitId: habit.id, dateKey: { gte: from, lte: throughDate } },
        select: { habitId: true, dateKey: true, occurrence: true },
    });
    const checkInCounts = getCheckInCounts(checkIns);
    const checkInSet = getCompletedCheckInSet([habit], checkInCounts);
    const streaks = getHabitStreak(habit, checkInSet, throughDate);
    if (habit.currentStreak === streaks.currentStreak && habit.longestStreak === streaks.longestStreak) {
        return streaks;
    }
    await prisma.habit.update({
        where: { id: habit.id },
        data: { currentStreak: streaks.currentStreak, longestStreak: streaks.longestStreak },
    });
    return streaks;
}

export async function refreshHabitStreakSafely(habit, throughDate, {
    refresh = refreshHabitStreak,
    logger = console.error,
} = {}) {
    try {
        return await refresh(habit, throughDate);
    } catch (error) {
        logger("[api] Habit streak refresh failed after check-in mutation.", {
            name: typeof error?.name === "string" ? error.name : "Error",
            code: typeof error?.code === "string" ? error.code : undefined,
        });
        return {
            currentStreak: habit.currentStreak ?? 0,
            longestStreak: habit.longestStreak ?? 0,
        };
    }
}

export function getHabitProgressStats(habit, series, checkInSet, streakCheckInSet, throughDate) {
    const totals = getScheduledHabitTotals(habit, series, checkInSet);
    const streaks = getStreakStats([habit], streakCheckInSet, throughDate);

    return { ...totals, ...streaks };
}

export function getScheduledHabitTotals(habit, series, checkInSet) {
    const scheduledDates = series
        .filter((day) => isHabitScheduled(habit, day.date))
        .map((day) => day.date);
    const completed = scheduledDates.filter((date) => checkInSet.has(`${habit.id}:${date}`)).length;

    return {
        scheduled: scheduledDates.length,
        completed,
        completionRate: scheduledDates.length ? completed / scheduledDates.length : 0,
    };
}
