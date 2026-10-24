import test from "node:test";
import assert from "node:assert/strict";
import { lookupGoogleBookCovers, matchesRequestedBook } from "./bookCoverService.js";

function googleResponse(items) {
    return {
        ok: true,
        json: async () => ({ totalItems: items.length, items }),
    };
}

test("retries with a broad title query and accepts Google's small thumbnail", async (t) => {
    const originalFetch = globalThis.fetch;
    const requestedUrls = [];
    globalThis.fetch = async (input) => {
        const url = new URL(input);
        requestedUrls.push(url);
        if (url.searchParams.get("q") === "isbn:9780547928227") {
            return googleResponse([]);
        }
        return googleResponse([{
            volumeInfo: {
                title: "The Hobbit",
                authors: ["J.R.R. Tolkien"],
                industryIdentifiers: [{ type: "ISBN_13", identifier: "9780547928227" }],
                imageLinks: {
                    thumbnail: "https://untrusted.example/cover.jpg",
                    smallThumbnail: "http://books.google.com/books/content?id=abc&zoom=5",
                },
                publishedDate: "2012",
            },
        }]);
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await lookupGoogleBookCovers(
        { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "978-0-547-92822-7" },
        { apiKey: "test-key", timeoutMs: 1_000 },
    );

    assert.deepEqual(requestedUrls.map((url) => url.searchParams.get("q")), [
        "isbn:9780547928227",
        "The Hobbit",
    ]);
    assert.equal(requestedUrls[0].searchParams.get("key"), "test-key");
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, [{
        title: "The Hobbit",
        author: "J.R.R. Tolkien",
        isbn: "9780547928227",
        coverId: null,
        coverUrl: "https://books.google.com/books/content?id=abc&zoom=2",
        year: "2012",
        source: "Google Books",
        recommended: false,
    }]);
});

test("falls back to public Google Books when the configured key is rejected", async (t) => {
    const originalFetch = globalThis.fetch;
    const keyParameters = [];
    globalThis.fetch = async (input) => {
        const url = new URL(input);
        keyParameters.push(url.searchParams.get("key"));
        if (url.searchParams.has("key")) return { ok: false, status: 403 };
        return googleResponse([{
            volumeInfo: {
                title: "The Hobbit",
                imageLinks: {
                    thumbnail: "http://books.google.com/books/content?id=abc",
                },
            },
        }]);
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await lookupGoogleBookCovers(
        { title: "The Hobbit" },
        { apiKey: "rejected-key", timeoutMs: 1_000 },
    );

    assert.deepEqual(keyParameters, ["rejected-key", null]);
    assert.equal(result.ok, true);
    assert.equal(result.items[0].coverUrl, "https://books.google.com/books/content?id=abc&zoom=2");
});

test("returns no Google Books cover for results without a trusted cover URL", async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => googleResponse([{
        volumeInfo: {
            title: "Book without a usable cover",
            imageLinks: { thumbnail: "https://example.com/cover.jpg" },
        },
    }]);
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await lookupGoogleBookCovers({ title: "Book without a usable cover" });
    assert.deepEqual(result, { ok: true, items: [] });
});

test("matches accented titles and transliterated author names", () => {
    assert.equal(matchesRequestedBook(
        { title: "O Duplo", author: "Fyodor Dostoyevsky" },
        { title: "O Duplo", author: "Fiódor Dostoiévski" },
    ), true);
    assert.equal(matchesRequestedBook(
        { title: "O Duplo Grau de Jurisdição", author: "Autor Desconhecido" },
        { title: "O Duplo", author: "Dostoiévski" },
    ), false);
});

test("does not return irrelevant Google Books titles or authors", async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => googleResponse([{
        volumeInfo: {
            title: "O Duplo Grau de Jurisdição",
            authors: ["Autor Desconhecido"],
            imageLinks: { thumbnail: "https://books.google.com/books/content?id=unrelated" },
        },
    }]);
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await lookupGoogleBookCovers({
        title: "O Duplo",
        author: "Dostoiévski",
    });
    assert.deepEqual(result, { ok: true, items: [] });
});
