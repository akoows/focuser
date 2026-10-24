export class HttpError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function sendSuccess(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}

export function sendError(res, error) {
    const parserStatus = Number.isInteger(error?.status) ? error.status : undefined;
    const status = error instanceof HttpError ? error.status
        : parserStatus === 413 ? 413
            : parserStatus === 415 ? 415
            : parserStatus === 400 || error?.type === "entity.parse.failed" ? 400
                : 500;
    const code = error instanceof HttpError ? error.code
        : status === 413 ? "PAYLOAD_TOO_LARGE"
            : status === 415 ? "UNSUPPORTED_CONTENT_ENCODING"
            : status === 400 ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR";
    const message = error instanceof HttpError ? error.message
        : status === 413 ? "O corpo da requisição excede o limite permitido."
            : status === 415 ? "Este servidor não aceita requisições comprimidas."
            : status === 400 ? "A requisição enviada é inválida."
                : "Ocorreu um erro interno.";
    const body = { success: false, error: { code, message } };

    if (error instanceof HttpError && error.details !== undefined) {
        body.error.details = error.details;
    }

    if (status >= 500) {
        console.error("[api] Internal request failure.", {
            name: typeof error?.name === "string" ? error.name : "Error",
            code: typeof error?.code === "string" ? error.code : undefined,
        });
    }

    return res.status(status).json(body);
}

export function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
