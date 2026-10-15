import crypto from "node:crypto";
import { HttpError } from "../utils/apiResponse.js";

function configuration(type) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
    const apiKey = process.env.CLOUDINARY_API_KEY || "";
    const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
    const baseFolder = process.env.CLOUDINARY_FOLDER || "focuser/avatars";
    const kind = type === "banner" ? "BANNER" : "AVATAR";

    if (!cloudName || !apiKey || !apiSecret) {
        throw new HttpError(503, `${kind}_UPLOAD_NOT_CONFIGURED`, "O envio de imagens do perfil não está configurado no servidor.");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(cloudName) || !/^[A-Za-z0-9/_-]{1,100}$/.test(baseFolder)) {
        throw new HttpError(500, `${kind}_UPLOAD_MISCONFIGURED`, "A configuração do envio de imagens do perfil está inválida.");
    }
    return { cloudName, apiKey, apiSecret, baseFolder: baseFolder.replace(/\/+$/, "") };
}

function signFolder(folder, type) {
    const { cloudName, apiKey, apiSecret } = configuration(type);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash("sha1")
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest("hex");
    return { cloudName, apiKey, folder, timestamp, signature };
}

export function profileImageUploadSignature(userId, type) {
    const { baseFolder } = configuration(type);
    const folder = `${baseFolder}/${userId}${type === "banner" ? "/banner" : ""}`;
    return signFolder(folder, type);
}

export function registrationUploadSignature(uploadId, type) {
    const { baseFolder } = configuration(type);
    const folder = `${baseFolder}/registration/${uploadId}${type === "banner" ? "/banner" : ""}`;
    return signFolder(folder, type);
}

export function isAssetUrlInFolder(value, folder) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
    if (typeof value !== "string" || !cloudName) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.search || url.hash) return false;
        const prefix = `/${cloudName}/image/upload/`;
        if (!url.pathname.startsWith(prefix)) return false;
        const assetPath = url.pathname.slice(prefix.length).replace(/^v\d+\//, "");
        return assetPath.startsWith(`${folder}/`);
    } catch {
        return false;
    }
}
