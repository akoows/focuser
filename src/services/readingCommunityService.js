import { prisma } from "../lib/prisma.js";
import { cursorAfter, encodeCursor } from "../utils/cursor.js";

const READING_BOOK_SELECT = {
    id: true,
    title: true,
    author: true,
    coverId: true,
    coverUrl: true,
};

export function createReadingCommunityService(prismaClient) {
    return {
        async recentFeed(userId, { limit = 20, after = null } = {}) {
            const friendships = await prismaClient.friendship.findMany({
                where: {
                    status: "ACCEPTED",
                    OR: [{ requesterId: userId }, { addresseeId: userId }],
                },
                select: { requesterId: true, addresseeId: true },
            });
            const readerIds = new Set([userId]);
            for (const friendship of friendships) {
                readerIds.add(friendship.requesterId);
                readerIds.add(friendship.addresseeId);
            }

            const logs = await prismaClient.readingLog.findMany({
                where: {
                    userId: { in: [...readerIds] },
                    ...(after ? { AND: [cursorAfter(after)] } : {}),
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: limit + 1,
            });
            const page = logs.slice(0, limit);
            const userIds = [...new Set(page.map((log) => log.userId))];
            const bookIds = [...new Set(page.map((log) => log.bookId))];
            const [users, books] = await Promise.all([
                userIds.length
                    ? prismaClient.user.findMany({
                        where: { id: { in: userIds } },
                        select: { id: true, name: true, username: true, avatarUrl: true },
                    })
                    : [],
                bookIds.length
                    ? prismaClient.readingBook.findMany({
                        where: { id: { in: bookIds } },
                        select: READING_BOOK_SELECT,
                    })
                    : [],
            ]);
            const usersById = new Map(users.map((user) => [user.id, user]));
            const booksById = new Map(books.map((book) => [book.id, book]));

            const items = page.flatMap((log) => {
                const user = usersById.get(log.userId);
                const book = booksById.get(log.bookId);
                if (!user || !book) return [];
                return [{
                    id: log.id,
                    pagesRead: log.pagesRead,
                    minutesRead: log.minutesRead,
                    loggedAt: log.createdAt,
                    book,
                    user: {
                        ...user,
                        username: user.username && !user.username.startsWith("~unset:") ? user.username : null,
                    },
                }];
            });
            const hasMore = logs.length > limit;
            const last = page.at(-1);
            return {
                items,
                pagination: {
                    limit,
                    hasMore,
                    nextCursor: hasMore && last ? encodeCursor(last) : null,
                },
            };
        },
    };
}

export const readingCommunityService = createReadingCommunityService(prisma);
