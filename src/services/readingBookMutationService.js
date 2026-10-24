import { HttpError } from "../utils/apiResponse.js";

export function buildReadingBookPatchMutation(book, userId, input) {
    const totalPages = input.totalPages ?? book.totalPages;
    const currentPage = input.currentPage ?? book.currentPage;
    if (currentPage < 0 || currentPage > totalPages) {
        throw new HttpError(400, "VALIDATION_ERROR", "A página atual deve estar entre zero e o total de páginas.");
    }

    return {
        where: {
            id: book.id,
            userId,
            currentPage: book.currentPage,
            totalPages: book.totalPages,
            isActive: book.isActive,
        },
        data: {
            ...input,
            ...(input.isbn !== undefined ? { isbn: input.isbn || null } : {}),
        },
    };
}

export async function compareAndSetReadingBookPatch({ book, userId, input, updateMany, findUpdated }) {
    if (typeof updateMany !== "function" || typeof findUpdated !== "function") {
        throw new TypeError("updateMany and findUpdated must be functions.");
    }
    const mutation = buildReadingBookPatchMutation(book, userId, input);
    const result = await updateMany(mutation);
    if (result.count !== 1) {
        throw new HttpError(409, "BOOK_CHANGED", "O livro mudou. Atualize os dados e tente novamente.");
    }
    const updated = await findUpdated();
    if (!updated) throw new HttpError(409, "BOOK_CHANGED", "O livro mudou. Atualize os dados e tente novamente.");
    return updated;
}

export function buildReadingLogBookMutation(book, userId, pagesRead) {
    return {
        where: {
            id: book.id,
            userId,
            isActive: true,
            totalPages: book.totalPages,
            currentPage: { lte: book.totalPages - pagesRead },
        },
        data: { currentPage: { increment: pagesRead } },
    };
}

export async function recordReadingLogForBook({ book, userId, pagesRead, updateMany, findCurrent, createLog }) {
    if (typeof updateMany !== "function" || typeof findCurrent !== "function" || typeof createLog !== "function") {
        throw new TypeError("updateMany, findCurrent and createLog must be functions.");
    }
    const result = await updateMany(buildReadingLogBookMutation(book, userId, pagesRead));
    if (result.count !== 1) {
        const current = await findCurrent();
        if (!current || !current.isActive || current.totalPages !== book.totalPages) {
            throw new HttpError(409, "BOOK_CHANGED", "O livro mudou. Atualize os dados e tente novamente.");
        }
        throw new HttpError(422, "PAGE_LIMIT_EXCEEDED", "A leitura excede o total de páginas do livro.");
    }
    return createLog();
}

export function mapReadingBookTransactionError(error) {
    if (error?.code === "P2034") {
        return new HttpError(409, "BOOK_CHANGED", "O livro mudou. Atualize os dados e tente novamente.");
    }
    return error;
}
