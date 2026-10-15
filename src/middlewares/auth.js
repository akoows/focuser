import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../utils/apiResponse.js";

export const AUTH_COOKIE = "focuser_token";
const JWT_SECRET = process.env.JWT_SECRET;

function hasStrongJwtSecret() {
    return typeof JWT_SECRET === "string" && Buffer.byteLength(JWT_SECRET, "utf8") >= 32;
}

export function createAuthToken(user) {
    if (!hasStrongJwtSecret()) {
        throw new HttpError(500, "AUTH_NOT_CONFIGURED", "Configure JWT_SECRET com ao menos 32 bytes.");
    }
    return jwt.sign(
        { sub: user.id, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
    if (!hasStrongJwtSecret()) {
        throw new HttpError(500, "AUTH_NOT_CONFIGURED", "Configure JWT_SECRET com ao menos 32 bytes.");
    }
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Faça login para continuar.");

    let claims;
    try {
        claims = jwt.verify(token, JWT_SECRET);
    } catch {
        throw new HttpError(401, "INVALID_TOKEN", "A sessão é inválida ou expirou.");
    }

    if (
        typeof claims !== "object"
        || typeof claims.sub !== "string"
        || !Number.isInteger(claims.tokenVersion)
    ) {
        throw new HttpError(401, "INVALID_TOKEN", "A sessão é inválida ou expirou.");
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.tokenVersion !== claims.tokenVersion) {
        throw new HttpError(401, "INVALID_TOKEN", "A sessão foi revogada.");
    }
    req.user = user;
    next();
});

export async function optionalAuth(req) {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token || !hasStrongJwtSecret()) return null;

    let claims;
    try {
        claims = jwt.verify(token, JWT_SECRET);
        if (typeof claims !== "object" || typeof claims.sub !== "string") return null;
    } catch {
        return null;
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.tokenVersion !== claims.tokenVersion) return null;
    return user;
}
