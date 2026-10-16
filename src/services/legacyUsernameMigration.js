const BATCH_SIZE = 100;

const missingUsernameFilter = {
    OR: [
        { username: null },
        { username: { isSet: false } },
    ],
};

export async function normalizeLegacyUsernames(prismaClient) {
    let updatedCount = 0;
    let lastId;

    while (true) {
        const users = await prismaClient.user.findMany({
            where: {
                AND: [
                    missingUsernameFilter,
                    ...(lastId ? [{ id: { gt: lastId } }] : []),
                ],
            },
            select: { id: true },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
        });
        if (!users.length) break;

        for (const user of users) {
            const updated = await prismaClient.user.updateMany({
                where: {
                    id: user.id,
                    ...missingUsernameFilter,
                },
                data: { username: `~unset:${user.id}` },
            });
            updatedCount += updated.count;
        }
        lastId = users[users.length - 1].id;
        if (users.length < BATCH_SIZE) break;
    }

    return { updatedCount };
}
