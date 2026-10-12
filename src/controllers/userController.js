// Importações dos Services
import { userCreate } from "../services/User/userCreate.js";
import { userDelete } from "../services/User/userDelete.js";
import { userEdit } from "../services/User/userEdit.js";
import { userList } from "../services/User/userList.js";
import { userLogin } from "../services/User/userLogin.js";
import { userPerID } from "../services/User/userPerID.js";

// Controllers
export async function userCreateController(req, res) {
    try {
        const user = await userCreate(req.body);
        return res.status(201).json(user);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

export async function userDeleteController(req, res) {
    try {
        const user = await userDelete(req.params.id);
        return res.status(201).json(user);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

export async function userEditController(req, res) {
    try {
        const { id } = req.params;
        const data = req.body;
 
        if (!id) {
            return res.status(400).json({ error: "ID do usuário é obrigatório!" });
        }
 
        if (!data || Object.keys(data).length === 0) {
            return res.status(400).json({ error: "Nenhum dado para atualizar!" });
        }
 
        const updatedUser = await userEdit(id, data);
 
        return res.status(200).json(updatedUser);
    } catch (error) {
        if (error.message.includes("inexistente")) {
            return res.status(404).json({ error: error.message });
        }
 
        if (error.message.includes("inválido") || error.message.includes("inválida")) {
            return res.status(400).json({ error: error.message });
        }
 
        return res.status(500).json({ error: "Erro interno ao editar usuário." });
    }
}

export async function userListController(req, res) {
    try {
        const users = await userList();
        return res.status(200).json(users);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

export async function userLoginController(req, res) {
    try {
        const { email, pass } = req.body;
 
        if (!email || !pass) {
            return res.status(400).json({ error: "Email e senha são obrigatórios!" });
        }
 
        const user = await userLogin({ email, pass });
 
        return res.status(200).json(user);
    } catch (error) {
        if (error.message.includes("não encontrado")) {
            return res.status(404).json({ error: error.message });
        }
 
        if (error.message.includes("incorreta")) {
            return res.status(401).json({ error: error.message });
        }
 
        return res.status(500).json({ error: "Erro interno ao realizar login.\n\n" + error });
    }
}

export async function userPerIDController(req, res) {
    try {
        const { id } = req.params;
 
        if (!id) {
            return res.status(400).json({ error: "ID do usuário é obrigatório!" });
        }
 
        const user = await userPerID(id);
 
        return res.status(200).json(user);
    } catch (error) {
        if (error.message.includes("não encontrado")) {
            return res.status(404).json({ error: error.message });
        }
 
        return res.status(500).json({ error: "Erro interno ao buscar usuário." });
    }
}