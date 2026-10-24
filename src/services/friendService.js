import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/apiResponse.js";
import { cursorAfter, encodeCursor } from "../utils/cursor.js";

const FRIEND_SELECT = { id: true, name: true, username: true, avatarUrl: true, accentColor: true };

function friendSummary(user, friendship) {
    return { ...user, friendshipId: friendship.id, since: friendship.updatedAt };
}

function requestSummary(user, friendship) {
    return { ...user, requestId: friendship.id, requestedAt: friendship.createdAt };
}

export function createFriendService(prismaClient) {
    return {
        async list(userId, { limit = 20, after = null } = {}) {
            const relations = await prismaClient.friendship.findMany({
                where: {
                    AND: [
                        { OR: [{ requesterId: userId }, { addresseeId: userId }] },
                        ...(after ? [cursorAfter(after)] : []),
                    ],
                },
                include: {
                    requester: { select: FRIEND_SELECT },
                    addressee: { select: FRIEND_SELECT },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: limit + 1,
            });

            const friends = [];
            const incomingRequests = [];
            const outgoingRequests = [];
            const page = relations.slice(0, limit);
            for (const relation of page) {
                const isRequester = relation.requesterId === userId;
                const otherUser = isRequester ? relation.addressee : relation.requester;
                if (relation.status === "ACCEPTED") {
                    friends.push(friendSummary(otherUser, relation));
                } else if (isRequester) {
                    outgoingRequests.push(requestSummary(otherUser, relation));
                } else {
                    incomingRequests.push(requestSummary(otherUser, relation));
                }
            }
            const hasMore = relations.length > limit;
            const last = page.at(-1);
            return {
                friends,
                incomingRequests,
                outgoingRequests,
                pagination: {
                    limit,
                    hasMore,
                    nextCursor: hasMore && last ? encodeCursor(last) : null,
                },
            };
        },

        async status(userId, username) {
            const target = await prismaClient.user.findUnique({
                where: { username },
                select: { id: true },
            });
            if (!target || target.id === userId) {
                return { status: target?.id === userId ? "SELF" : "NONE", requestId: null };
            }

            const relation = await prismaClient.friendship.findFirst({
                where: {
                    OR: [
                        { requesterId: userId, addresseeId: target.id },
                        { requesterId: target.id, addresseeId: userId },
                    ],
                },
                select: { id: true, requesterId: true, status: true },
            });
            if (!relation) return { status: "NONE", requestId: null };
            if (relation.status === "ACCEPTED") return { status: "FRIENDS", requestId: relation.id };
            return {
                status: relation.requesterId === userId ? "SENT" : "RECEIVED",
                requestId: relation.id,
            };
        },

        async sendRequest(userId, username) {
            const target = await prismaClient.user.findUnique({
                where: { username },
                select: { id: true },
            });
            if (!target) {
                throw new HttpError(404, "FRIEND_USER_NOT_FOUND", "Não foi encontrado um usuário com esse nome.");
            }
            if (target.id === userId) {
                throw new HttpError(400, "FRIEND_REQUEST_SELF", "Você não pode enviar um pedido de amizade para si mesmo.");
            }

            const existing = await prismaClient.friendship.findFirst({
                where: {
                    OR: [
                        { requesterId: userId, addresseeId: target.id },
                        { requesterId: target.id, addresseeId: userId },
                    ],
                },
                select: { id: true, requesterId: true, status: true },
            });
            if (existing?.status === "ACCEPTED") {
                throw new HttpError(409, "ALREADY_FRIENDS", "Vocês já são amigos.");
            }
            if (existing?.requesterId === userId) {
                throw new HttpError(409, "FRIEND_REQUEST_ALREADY_SENT", "O pedido de amizade já foi enviado.");
            }
            if (existing) {
                throw new HttpError(409, "FRIEND_REQUEST_RECEIVED", "Essa pessoa já enviou um pedido. Você pode aceitá-lo na sua central de amigos.");
            }

            try {
                const relation = await prismaClient.friendship.create({
                    data: {
                        requesterId: userId,
                        addresseeId: target.id,
                        pairKey: [userId, target.id].sort().join(":"),
                    },
                    select: { id: true, createdAt: true },
                });
                return { status: "SENT", requestId: relation.id, requestedAt: relation.createdAt };
            } catch (error) {
                if (error.code === "P2002") {
                    throw new HttpError(409, "FRIEND_REQUEST_ALREADY_SENT", "Já existe um pedido de amizade entre essas contas.");
                }
                throw error;
            }
        },

        async respondToRequest(userId, requestId) {
            const relation = await prismaClient.friendship.findUnique({
                where: { id: requestId },
                select: { id: true, addresseeId: true, status: true },
            });
            if (!relation || relation.addresseeId !== userId) {
                throw new HttpError(404, "FRIEND_REQUEST_NOT_FOUND", "Pedido de amizade não encontrado.");
            }
            if (relation.status !== "PENDING") {
                throw new HttpError(409, "FRIEND_REQUEST_NOT_PENDING", "Este pedido de amizade não está mais pendente.");
            }
            const updated = await prismaClient.friendship.updateMany({
                where: { id: requestId, addresseeId: userId, status: "PENDING" },
                data: { status: "ACCEPTED" },
            });
            if (updated.count !== 1) {
                throw new HttpError(409, "FRIEND_REQUEST_NOT_PENDING", "Este pedido de amizade não está mais pendente.");
            }
            return { status: "FRIENDS" };
        },

        async removeRequest(userId, requestId) {
            const relation = await prismaClient.friendship.findUnique({
                where: { id: requestId },
                select: { id: true, requesterId: true, addresseeId: true, status: true },
            });
            if (!relation || (relation.requesterId !== userId && relation.addresseeId !== userId)) {
                throw new HttpError(404, "FRIEND_REQUEST_NOT_FOUND", "Pedido de amizade não encontrado.");
            }
            if (relation.status !== "PENDING") {
                throw new HttpError(409, "FRIEND_REQUEST_NOT_PENDING", "Este pedido de amizade não está mais pendente.");
            }
            const removed = await prismaClient.friendship.deleteMany({
                where: {
                    id: requestId,
                    status: "PENDING",
                    OR: [{ requesterId: userId }, { addresseeId: userId }],
                },
            });
            if (removed.count !== 1) {
                throw new HttpError(409, "FRIEND_REQUEST_NOT_PENDING", "Este pedido de amizade não está mais pendente.");
            }
            return { removed: true };
        },

        async removeFriend(userId, friendId) {
            const relation = await prismaClient.friendship.findFirst({
                where: {
                    status: "ACCEPTED",
                    OR: [
                        { requesterId: userId, addresseeId: friendId },
                        { requesterId: friendId, addresseeId: userId },
                    ],
                },
                select: { id: true },
            });
            if (!relation) throw new HttpError(404, "FRIENDSHIP_NOT_FOUND", "Amizade não encontrada.");
            const removed = await prismaClient.friendship.deleteMany({
                where: {
                    id: relation.id,
                    status: "ACCEPTED",
                    OR: [
                        { requesterId: userId, addresseeId: friendId },
                        { requesterId: friendId, addresseeId: userId },
                    ],
                },
            });
            if (removed.count !== 1) throw new HttpError(404, "FRIENDSHIP_NOT_FOUND", "Amizade não encontrada.");
            return { removed: true };
        },
    };
}

export const friendService = createFriendService(prisma);
