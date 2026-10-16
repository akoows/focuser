import { Router } from "express";
import { 
    userCreateController, 
    userDeleteController, 
    userEditController, 
    userListController, 
    userLoginController, 
    userPerIDController} from "../controllers/userController.js";

const userRouter = Router();

userRouter.post("/", userCreateController); // Criar usurario
userRouter.delete("/:id", userDeleteController); // Deletar usurario
userRouter.put("/:id", userEditController); // Editar usuário
userRouter.get("/", userListController); // Listar Usuários
userRouter.post("/login", userLoginController); // Login do Usuário
userRouter.get("/:id", userPerIDController); // Buscar usuário por ID

export default userRouter;