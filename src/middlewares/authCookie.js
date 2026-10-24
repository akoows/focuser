import { AUTH_COOKIE } from "./auth.js";
import { readCookieSettings, readJwtSettings } from "../config/env.js";

function authCookieOptions(env, includeMaxAge) {
    const { sameSite, secure } = readCookieSettings(env);
    const options = {
        httpOnly: true,
        secure,
        sameSite,
        path: "/",
    };
    if (includeMaxAge) options.maxAge = readJwtSettings(env).maxAgeMs;
    return options;
}

export function setAuthCookie(res, token, env = process.env) {
    res.cookie(AUTH_COOKIE, token, authCookieOptions(env, true));
}

export function clearAuthCookie(res, env = process.env) {
    res.clearCookie(AUTH_COOKIE, authCookieOptions(env, false));
}
