import { HttpError } from "../utils/apiResponse.js";

const ACTIVE_STATUSES = ["RUNNING", "PAUSED"];

export function buildFocusSessionMutation(session, userId, action, now = new Date()) {
    const where = {
        id: session.id,
        userId,
        status: session.status,
        resumedAt: session.resumedAt,
        ...(session.elapsedSeconds === undefined ? {} : { elapsedSeconds: session.elapsedSeconds }),
    };
    let data;
    let endsSession = false;

    if (action === "pause") {
        if (session.status !== "RUNNING") {
            throw new HttpError(409, "INVALID_SESSION_STATE", "Somente uma sessão em andamento pode ser pausada.");
        }
        const elapsed = session.resumedAt
            ? Math.max(0, Math.floor((now.getTime() - session.resumedAt.getTime()) / 1000))
            : 0;
        data = { status: "PAUSED", resumedAt: null, elapsedSeconds: { increment: elapsed } };
    } else if (action === "resume") {
        if (session.status !== "PAUSED") {
            throw new HttpError(409, "INVALID_SESSION_STATE", "Somente uma sessão pausada pode ser retomada.");
        }
        data = { status: "RUNNING", resumedAt: now };
    } else if (action === "complete" || action === "cancel") {
        if (!ACTIVE_STATUSES.includes(session.status)) {
            throw new HttpError(409, "INVALID_SESSION_STATE", "A sessão já foi encerrada.");
        }
        const elapsed = session.status === "RUNNING" && session.resumedAt
            ? Math.max(0, Math.floor((now.getTime() - session.resumedAt.getTime()) / 1000))
            : 0;
        data = {
            status: action === "complete" ? "COMPLETED" : "CANCELLED",
            resumedAt: null,
            ...(action === "complete" ? { completedAt: now } : { cancelledAt: now }),
            elapsedSeconds: { increment: elapsed },
        };
        endsSession = true;
    } else {
        throw new TypeError("Unknown focus-session action.");
    }

    return { where, data, endsSession };
}

export async function createFocusSessionAndClaim(transaction, userId, data) {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Usuário não encontrado.");

    if (user.activeFocusSessionId) {
        const active = await transaction.focusSession.findFirst({
            where: {
                id: user.activeFocusSessionId,
                userId,
                status: { in: ACTIVE_STATUSES },
            },
        });
        if (active) throw new HttpError(409, "FOCUS_SESSION_ACTIVE", "Finalize ou pause a sessão ativa antes de iniciar outra.");

        const cleared = await transaction.user.updateMany({
            where: { id: userId, activeFocusSessionId: user.activeFocusSessionId },
            data: { activeFocusSessionId: null },
        });
        if (cleared.count !== 1) {
            throw new HttpError(409, "FOCUS_SESSION_CHANGED", "A sessão ativa mudou. Atualize e tente novamente.");
        }
    }

    const session = await transaction.focusSession.create({ data: { ...data, userId } });
    const claimed = await transaction.user.updateMany({
        where: {
            id: userId,
            OR: [
                { activeFocusSessionId: null },
                { activeFocusSessionId: { isSet: false } },
            ],
        },
        data: { activeFocusSessionId: session.id },
    });
    if (claimed.count !== 1) {
        throw new HttpError(409, "FOCUS_SESSION_ACTIVE", "Já existe uma sessão de foco ativa.");
    }
    return session;
}

export function mapFocusSessionTransactionError(error) {
    if (error?.code === "P2034") {
        return new HttpError(409, "FOCUS_SESSION_CHANGED", "A sessão mudou. Atualize e tente novamente.");
    }
    return error;
}
