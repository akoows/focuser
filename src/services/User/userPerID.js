import { prisma } from "../../lib/prisma.js";
import { secureUser } from "../../dtos/secureUser.js";

export async function userPerID(userID) {
    try {
        const user = await prisma.user.findUnique({ where: { id: userID } });

        if (!user) {
            throw new Error("Usuário não encontrado!");
        }

        return secureUser(user);
    } catch (error) {
        throw new Error("Erro ao buscar usuário!", { cause: error });
    }
}