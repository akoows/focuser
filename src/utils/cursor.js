import { HttpError } from "./apiResponse.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function encodeCursor({ createdAt, id }) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(date.getTime()) || !OBJECT_ID_PATTERN.test(id ?? "")) {
        throw new TypeError("Cursor requires a valid timestamp and MongoDB object id.");
    }
    return Buffer.from(JSON.stringify({ v: 1, createdAt: date.toISOString(), id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
    if (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 512
        || !/^[A-Za-z\d_-]+$/.test(cursor)) {
        throw invalidCursor();
    }
    try {
        const decoded = Buffer.from(cursor, "base64url");
        if (decoded.toString("base64url") !== cursor) throw invalidCursor();
        const value = JSON.parse(decoded.toString("utf8"));
        if (!value || Object.keys(value).sort().join(",") !== "createdAt,id,v"
            || value.v !== 1 || typeof value.createdAt !== "string"
            || typeof value.id !== "string" || !OBJECT_ID_PATTERN.test(value.id)) {
            throw invalidCursor();
        }
        const createdAt = new Date(value.createdAt);
        if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== value.createdAt) throw invalidCursor();
        return { createdAt, id: value.id };
    } catch {
        throw invalidCursor();
    }
}

export function cursorAfter(cursor) {
    return {
        OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
    };
}

function invalidCursor() {
    return new HttpError(400, "INVALID_CURSOR", "O cursor da paginação é inválido.");
}
