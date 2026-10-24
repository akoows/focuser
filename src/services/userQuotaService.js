import { HttpError } from "../utils/apiResponse.js";

const MAX_WRITE_CONFLICT_RETRIES = 3;

export async function createWithinUserQuota({ prisma, userId, resource, limit, errorCode, errorMessage, data }) {
    if (!prisma?.$transaction || typeof userId !== "string" || typeof resource !== "string"
        || !Number.isInteger(limit) || limit < 1 || typeof errorCode !== "string"
        || typeof errorMessage !== "string" || !data || typeof data !== "object") {
        throw new TypeError("A valid Prisma client and user quota configuration are required.");
    }
    for (let attempt = 0; attempt <= MAX_WRITE_CONFLICT_RETRIES; attempt += 1) {
        try {
            return await prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({ where: { id: userId }, select: { quotaVersion: true } });
                if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
                const count = await tx[resource].count({ where: { userId } });
                if (count >= limit) throw new HttpError(422, errorCode, errorMessage);
                const reserved = await tx.user.updateMany({
                    where: {
                        id: userId,
                        OR: [
                            { quotaVersion: user.quotaVersion },
                            { quotaVersion: { isSet: false } },
                        ],
                    },
                    data: { quotaVersion: { increment: 1 } },
                });
                if (reserved.count !== 1) throw Object.assign(new Error("User quota reservation conflicted."), { code: "P2034" });
                return tx[resource].create({ data: { ...data, userId } });
            });
        } catch (error) {
            if (error?.code !== "P2034" || attempt === MAX_WRITE_CONFLICT_RETRIES) throw error;
        }
    }
}
