// Bibliotecas
import express from "express";

// Routers
import userRouter from "./routes/userRoutes.js";

const router = express.Router();

// Instanciando Rotas
router.use("/users", userRouter);

// Exportando router
export { router };