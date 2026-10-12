import { prisma } from "../../lib/prisma.js";
import { secureUser } from "../../dtos/secureUser.js";

export async function userDelete(userID) {
    try {
        const deletedUser = await prisma.user.delete({ where: {id : userID} });
        return secureUser(deletedUser);
    } catch (error) {
        throw new Error("Erro ao deletar o usuário!", { cause: error });
    }
} 