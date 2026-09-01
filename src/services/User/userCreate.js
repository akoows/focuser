import { prisma } from "../../lib/prisma.js";
import bcrypt from "bcrypt";
import { secureUser } from "../../dtos/secureUser.js";

export async function userCreate(data) {
    const hashedPass = await bcrypt.hash(data.pass, 10);

    const user = {
        name: data.name,
        email: data.email,
        pass: hashedPass
    }
    try {
        const unsecuredUser = await prisma.user.create({ data: user });
        return secureUser(unsecuredUser);
    } catch (error) {
        throw new Error("Erro ao criar ao usuário!", { cause: error})
    }
}