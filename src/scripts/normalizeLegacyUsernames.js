import { prisma } from "../lib/prisma.js";
import { normalizeLegacyUsernames } from "../services/legacyUsernameMigration.js";

try {
    const { updatedCount } = await normalizeLegacyUsernames(prisma);
    console.log(`Contas antigas atualizadas: ${updatedCount}. Nenhuma conta ou dado foi removido.`);
} catch (error) {
    console.error("Não foi possível normalizar usernames antigos:", error);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
