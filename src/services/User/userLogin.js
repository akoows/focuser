import { prisma } from "../../lib/prisma.js";
import { secureUser } from "../../dtos/secureUser.js";
import bcrypt from "bcrypt";

export async function userLogin(data) {
    try {
        const user = await prisma.user.findUnique({ where: { email: data.email } });

        if (!user) {
            throw new Error("Usuário não encontrado!");
        }

        const validPass = await bcrypt.compare(data.pass, user.pass);

        if (!validPass) {
            throw new Error("Senha incorreta!");
        }

        return secureUser(user);
    } catch (error) {
        throw new Error("Erro ao realizar login!", { cause: error });
    }
}