'use strict';
const { PrismaClient } = require('@prisma/client');
// log desligado: mensagens do Prisma podem conter argumentos de queries (dados sensíveis).
module.exports = new PrismaClient({ log: [] });
