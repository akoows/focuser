import { prisma } from "../../lib/prisma.js";
import { secureUser } from "../../dtos/secureUser.js";
import bcrypt from "bcryptjs";
import { readIntegerSetting } from "../../config/env.js";

export async function userEdit(userID, data) {
    try {
        const user = await prisma.user.findUnique({ where: { id: userID } });

        if (!user) {
            throw new Error("Usuário inexistente!");
        }

        if (data.email && typeof data.email !== "string") {
            throw new Error("Nome inválido!");
        }

        if (data.pass && typeof data.pass !== "string") {
            throw new Error("Senha inválida!");
        }

        const updatedUser = await prisma.user.update({
            where: { id: userID },
            data: {
                email: data.email ?? user.email,
                pass: data.pass ? await bcrypt.hash(data.pass, readIntegerSetting(process.env, "BCRYPT_COST", 12, { min: 4, max: 15 })) : user.pass
            }
        });

        return secureUser(updatedUser);
    } catch (error) {
        throw error.message.includes("Usuário") || error.message.includes("Nome") || error.message.includes("Senha")
            ? error
            : new Error("Erro ao editar o usuário!", { cause: error });
    }
}