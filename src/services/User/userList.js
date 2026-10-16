import { prisma } from "../../lib/prisma.js";
import { secureUser } from "../../dtos/secureUser.js";

export async function userList() {
    try {
        const users = await prisma.user.findMany();
        return users.map(secureUser);
    } catch (error) {
        throw new Error("Erro ao listar usuários!", { cause: error });
    }
}