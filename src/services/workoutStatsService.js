function isValidSet(set) {
    return set.completed === true
        && Number.isFinite(set.weight)
        && set.weight >= 0
        && Number.isInteger(set.reps)
        && set.reps > 0;
}

function estimateOneRepMax(weight, reps) {
    if (weight <= 0 || reps < 1 || reps > 12) return null;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
}

function getCompletedSets(session) {
    return (session.exercises || []).flatMap((exercise) => (
        (exercise.sets || [])
            .filter(isValidSet)
            .map((set) => ({ ...set, exerciseName: exercise.name }))
    ));
}

export function calculateWorkoutStats(sessions, { exerciseName, dateForSession } = {}) {
    const completedSessions = sessions
        .filter((session) => session.status === "COMPLETED" && session.completedAt)
        .sort((first, second) => new Date(first.completedAt) - new Date(second.completedAt));
    const byExercise = new Map();
    const repetitionsBySession = [];
    const volumeBySession = [];
    const weeklyRepetitions = new Map();
    const monthlyRepetitions = new Map();
    const weeklyVolume = new Map();
    const monthlyVolume = new Map();
    let totalReps = 0;
    let totalCompletedSets = 0;
    let totalVolume = 0;

    for (const session of completedSessions) {
        const validSets = getCompletedSets(session);
        const sessionReps = validSets.reduce((sum, set) => sum + set.reps, 0);
        const sessionSetCount = validSets.length;
        const sessionVolume = validSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
        totalReps += sessionReps;
        totalCompletedSets += sessionSetCount;
        totalVolume += sessionVolume;
        const dateKey = dateForSession
            ? dateForSession(session.completedAt)
            : new Date(session.completedAt).toISOString().slice(0, 10);
        const month = dateKey.slice(0, 7);
        const weekday = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
        const weekStart = new Date(`${dateKey}T12:00:00.000Z`);
        weekStart.setUTCDate(weekStart.getUTCDate() - ((weekday + 6) % 7));
        const week = weekStart.toISOString().slice(0, 10);
        if (sessionSetCount > 0) {
            const weekly = weeklyRepetitions.get(week) || { period: week, reps: 0, sets: 0, sessions: 0 };
            weekly.reps += sessionReps;
            weekly.sets += sessionSetCount;
            weekly.sessions += 1;
            weekly.averageReps = weekly.reps / weekly.sets;
            weeklyRepetitions.set(week, weekly);
            const monthly = monthlyRepetitions.get(month) || { period: month, reps: 0, sets: 0, sessions: 0 };
            monthly.reps += sessionReps;
            monthly.sets += sessionSetCount;
            monthly.sessions += 1;
            monthly.averageReps = monthly.reps / monthly.sets;
            monthlyRepetitions.set(month, monthly);
            const weeklyLoad = weeklyVolume.get(week) || { period: week, volume: 0, sessions: 0 };
            weeklyLoad.volume += sessionVolume;
            weeklyLoad.sessions += 1;
            weeklyVolume.set(week, weeklyLoad);
            const monthlyLoad = monthlyVolume.get(month) || { period: month, volume: 0, sessions: 0 };
            monthlyLoad.volume += sessionVolume;
            monthlyLoad.sessions += 1;
            monthlyVolume.set(month, monthlyLoad);
            repetitionsBySession.push({
                sessionId: session.id,
                date: session.completedAt,
                planName: session.planName,
                reps: sessionReps,
                sets: sessionSetCount,
                averageReps: sessionReps / sessionSetCount,
            });
            volumeBySession.push({
                sessionId: session.id,
                date: session.completedAt,
                planName: session.planName,
                volume: sessionVolume,
            });
        }

        for (const exercise of session.exercises || []) {
            if (exerciseName && exercise.name.toLocaleLowerCase() !== exerciseName.toLocaleLowerCase()) continue;
            const key = exercise.name.trim().toLocaleLowerCase();
            const completedSets = (exercise.sets || []).filter(isValidSet);
            if (!completedSets.length) continue;
            const entry = byExercise.get(key) || {
                name: exercise.name,
                bestWeight: 0,
                bestSet: null,
                bestRepSet: null,
                history: [],
            };
            const sessionMaxWeight = Math.max(...completedSets.map((set) => set.weight));
            entry.history.push({
                sessionId: session.id,
                date: session.completedAt,
                weight: sessionMaxWeight,
                averageReps: completedSets.reduce((sum, set) => sum + set.reps, 0) / completedSets.length,
                volume: completedSets.reduce((sum, set) => sum + set.weight * set.reps, 0),
            });
            entry.bestWeight = Math.max(entry.bestWeight, sessionMaxWeight);

            for (const set of completedSets) {
                const estimate = estimateOneRepMax(set.weight, set.reps);
                if (estimate !== null && (!entry.bestSet || estimate > entry.bestSet.estimatedOneRepMax)) {
                    entry.bestSet = {
                        weight: set.weight,
                        reps: set.reps,
                        estimatedOneRepMax: estimate,
                        date: session.completedAt,
                    };
                }
                if (!entry.bestRepSet
                    || set.reps > entry.bestRepSet.reps
                    || (set.reps === entry.bestRepSet.reps && set.weight > entry.bestRepSet.weight)) {
                    entry.bestRepSet = {
                        weight: set.weight,
                        reps: set.reps,
                        date: session.completedAt,
                    };
                }
            }
            byExercise.set(key, entry);
        }
    }

    return {
        sessionsTotal: completedSessions.length,
        totalCompletedSets,
        totalVolume,
        averageReps: totalCompletedSets ? totalReps / totalCompletedSets : null,
        repetitionsBySession: repetitionsBySession.slice(-30),
        repetitionsByWeek: Array.from(weeklyRepetitions.values()).slice(-52),
        repetitionsByMonth: Array.from(monthlyRepetitions.values()).slice(-12),
        volumeBySession: volumeBySession.slice(-30),
        volumeByWeek: Array.from(weeklyVolume.values()).slice(-52),
        volumeByMonth: Array.from(monthlyVolume.values()).slice(-12),
        exercises: Array.from(byExercise.values()).sort((first, second) => first.name.localeCompare(second.name)),
    };
}

export function countCompletedSessionsByDate(sessions, dateForSession) {
    const counts = new Map();
    for (const session of sessions) {
        if (session.status !== "COMPLETED" || !session.completedAt) continue;
        const date = dateForSession(session.completedAt);
        counts.set(date, (counts.get(date) || 0) + 1);
    }
    return counts;
}
