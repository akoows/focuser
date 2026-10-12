import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../../app/generated/prisma/index.js");

export const prisma = new PrismaClient();