import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
    isAssetUrlInFolder,
    profileImageUploadSignature,
    registrationUploadSignature,
} from "./cloudinaryService.js";

const envKeys = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "CLOUDINARY_FOLDER",
];

function setCloudinaryEnv(t) {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.CLOUDINARY_FOLDER = "focuser/avatars";
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
}

test("signs avatar and banner uploads into separate user folders", (t) => {
    setCloudinaryEnv(t);
    const avatar = profileImageUploadSignature("user-id", "avatar");
    const banner = profileImageUploadSignature("user-id", "banner");

    assert.equal(avatar.folder, "focuser/avatars/user-id");
    assert.equal(banner.folder, "focuser/avatars/user-id/banner");
    assert.equal(avatar.signature, crypto.createHash("sha1")
        .update(`folder=${avatar.folder}&timestamp=${avatar.timestamp}test-secret`)
        .digest("hex"));
});

test("registration uploads are temporary and asset URLs must match the expected folder", (t) => {
    setCloudinaryEnv(t);
    const signature = registrationUploadSignature("0123456789abcdef01234567", "avatar");
    assert.equal(signature.folder, "focuser/avatars/registration/0123456789abcdef01234567");
    assert.equal(isAssetUrlInFolder(
        "https://res.cloudinary.com/test-cloud/image/upload/v123/focuser/avatars/user-id/avatar.webp",
        "focuser/avatars/user-id",
    ), true);
    assert.equal(isAssetUrlInFolder(
        "https://res.cloudinary.com/test-cloud/image/upload/v123/focuser/avatars/another-user/avatar.webp",
        "focuser/avatars/user-id",
    ), false);
});

test("profile upload signing fails explicitly when Cloudinary is not configured", (t) => {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    for (const key of envKeys) delete process.env[key];
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });

    assert.throws(() => profileImageUploadSignature("user-id", "avatar"), {
        code: "AVATAR_UPLOAD_NOT_CONFIGURED",
    });
});
