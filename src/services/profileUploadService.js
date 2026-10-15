import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { registrationUploadSignature } from "./cloudinaryService.js";

const UPLOAD_TTL_MS = 30 * 60 * 1000;

export async function createRegistrationUploadSignature(type) {
    const uploadId = crypto.randomBytes(12).toString("hex");
    const signature = registrationUploadSignature(uploadId, type);
    const now = new Date();
    await prisma.pendingProfileUpload.deleteMany({ where: { expiresAt: { lte: now } } });
    await prisma.pendingProfileUpload.create({
        data: {
            id: uploadId,
            folder: signature.folder,
            expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
            usedAt: null,
        },
    });
    return { ...signature, uploadId };
}
