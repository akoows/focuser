const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";
const TITLE_STOP_WORDS = new Set([
    "a", "an", "and", "as", "at", "da", "das", "de", "del", "do", "dos", "e", "el", "en", "for",
    "il", "la", "las", "le", "les", "los", "of", "o", "os", "the", "to", "um", "uma", "uns", "with",
]);

function normalizeIsbn(value) {
    return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normalizedWords(value) {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function significantWords(value) {
    const words = normalizedWords(value);
    const significant = words.filter((word) => !TITLE_STOP_WORDS.has(word));
    return significant.length ? significant : words;
}

function authorTokenMatches(queryToken, candidateToken) {
    if (queryToken === candidateToken) return true;
    if (queryToken.length < 7 || candidateToken.length < 7) return false;

    let sharedPrefix = 0;
    while (sharedPrefix < queryToken.length
        && sharedPrefix < candidateToken.length
        && queryToken[sharedPrefix] === candidateToken[sharedPrefix]) {
        sharedPrefix += 1;
    }
    return sharedPrefix >= 5;
}

export function matchesRequestedBook(candidate, { title, author }) {
    const titleWords = significantWords(title);
    const candidateTitleWords = new Set(normalizedWords(candidate.title || ""));
    if (!titleWords.length || !titleWords.every((word) => candidateTitleWords.has(word))) return false;

    if (!author?.trim()) return true;
    const authorWords = significantWords(author);
    const longestAuthorWords = authorWords.filter((word) => (
        word.length === Math.max(...authorWords.map((candidateWord) => candidateWord.length))
    ));
    const candidateAuthorWords = normalizedWords(candidate.author || "");
    return longestAuthorWords.some((word) => (
        candidateAuthorWords.some((candidateWord) => authorTokenMatches(word, candidateWord))
    ));
}

function googleBooksCoverUrl(volumeInfo) {
    const candidates = [
        volumeInfo.imageLinks?.thumbnail,
        volumeInfo.imageLinks?.smallThumbnail,
        volumeInfo.imageLinks?.large,
        volumeInfo.imageLinks?.medium,
        volumeInfo.imageLinks?.small,
        volumeInfo.imageLinks?.extraLarge,
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            const url = new URL(candidate);
            if (!["http:", "https:"].includes(url.protocol)
                || !["books.google.com", "books.googleusercontent.com"].includes(url.hostname)) {
                continue;
            }
            url.protocol = "https:";
            url.searchParams.set("zoom", "2");
            return url.toString();
        } catch {
            continue;
        }
    }
    return null;
}

function mapGoogleBooksItems(payload) {
    return (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
        const info = item.volumeInfo || {};
        const coverUrl = googleBooksCoverUrl(info);
        if (!info.title || !coverUrl) return [];

        return [{
            title: info.title,
            author: info.authors?.[0] || null,
            isbn: info.industryIdentifiers?.find((identifier) => identifier.type === "ISBN_13")?.identifier
                || info.industryIdentifiers?.find((identifier) => identifier.type === "ISBN_10")?.identifier
                || null,
            coverId: null,
            coverUrl,
            year: info.publishedDate?.slice(0, 4) || null,
            source: "Google Books",
            recommended: false,
        }];
    });
}

function addUniqueItems(itemsByKey, items) {
    for (const item of items) {
        const key = item.isbn || `${item.title.toLocaleLowerCase()}|${item.author?.toLocaleLowerCase() || ""}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, item);
    }
}

function googleBooksQueries({ title, author, isbn }) {
    const queries = [];
    const normalizedIsbn = isbn ? normalizeIsbn(isbn) : "";
    if (normalizedIsbn.length === 10 || normalizedIsbn.length === 13) {
        queries.push(`isbn:${normalizedIsbn}`);
    }
    queries.push(title);
    if (author) queries.push(`${title} ${author}`);
    return [...new Set(queries)];
}

async function requestGoogleBooks(query, { apiKey, timeoutMs }) {
    const url = new URL(GOOGLE_BOOKS_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("printType", "books");
    if (apiKey) url.searchParams.set("key", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Google Books returned HTTP ${response.status}.`);
    return response.json();
}

export async function lookupGoogleBookCovers({ title, author, isbn }, { apiKey, timeoutMs = 8_000 } = {}) {
    let providerAvailable = false;
    let lastErrorName = "Error";
    const itemsByKey = new Map();

    for (const query of googleBooksQueries({ title, author, isbn })) {
        try {
            const payload = await requestGoogleBooks(query, { apiKey, timeoutMs });
            providerAvailable = true;
            const matches = mapGoogleBooksItems(payload)
                .filter((item) => matchesRequestedBook(item, { title, author }));
            addUniqueItems(itemsByKey, matches);
            if (matches.length) break;
        } catch (error) {
            lastErrorName = typeof error?.name === "string" ? error.name : "Error";
            if (apiKey) {
                try {
                    const payload = await requestGoogleBooks(query, { timeoutMs });
                    providerAvailable = true;
                    const matches = mapGoogleBooksItems(payload)
                        .filter((item) => matchesRequestedBook(item, { title, author }));
                    addUniqueItems(itemsByKey, matches);
                    if (matches.length) break;
                    continue;
                } catch (fallbackError) {
                    lastErrorName = typeof fallbackError?.name === "string" ? fallbackError.name : "Error";
                }
            }
        }
    }

    if (!providerAvailable) {
        console.warn("[reading] All Google Books lookup attempts failed.", { name: lastErrorName });
    }
    return { ok: providerAvailable, items: [...itemsByKey.values()].slice(0, 20) };
}
