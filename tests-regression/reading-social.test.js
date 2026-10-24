// Independent regression scenarios; external providers are mocked.
import test from "node:test";
import assert from "node:assert/strict";

{ // services/bookCoverService
const { lookupGoogleBookCovers, matchesRequestedBook } = await import("../src/services/bookCoverService.js");

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

}

{ // services/readingCommunityService
const { createReadingCommunityService } = await import("../src/services/readingCommunityService.js");

const userId = "000000000000000000000001";
const friendId = "000000000000000000000002";
const strangerId = "000000000000000000000003";

test("reading feed includes only self and accepted friends and returns UI fields", async () => {
    let query;
    const service = createReadingCommunityService({
        friendship: {
            findMany: async () => [{ requesterId: userId, addresseeId: friendId }],
        },
        readingLog: {
            findMany: async (args) => {
                query = args;
                return [
                    { id: "log-1", userId, bookId: "book-1", pagesRead: 12, minutesRead: 20, createdAt: new Date("2025-01-01T10:00:00Z") },
                    { id: "log-2", userId: friendId, bookId: "book-2", pagesRead: 4, minutesRead: 10, createdAt: new Date("2025-01-01T09:00:00Z") },
                    { id: "log-3", userId: strangerId, bookId: "book-3", pagesRead: 3, minutesRead: 5, createdAt: new Date("2025-01-01T08:00:00Z") },
                ];
            },
        },
        user: {
            findMany: async () => [
                { id: userId, name: "Reader", username: "~unset:reader", avatarUrl: null },
                { id: friendId, name: "Friend", username: "friend", avatarUrl: "https://example.com/avatar.jpg" },
            ],
        },
        readingBook: {
            findMany: async () => [
                { id: "book-1", title: "Book", author: "Author", coverId: null, coverUrl: null },
                { id: "book-2", title: "Friend's book", author: null, coverId: 23, coverUrl: null },
            ],
        },
    });

    const feed = (await service.recentFeed(userId)).items;
    assert.deepEqual(query.where.userId.in, [userId, friendId]);
    assert.deepEqual(feed, [{
        id: "log-1",
        pagesRead: 12,
        minutesRead: 20,
        loggedAt: new Date("2025-01-01T10:00:00Z"),
        book: { id: "book-1", title: "Book", author: "Author", coverId: null, coverUrl: null },
        user: { id: userId, name: "Reader", username: null, avatarUrl: null },
    }, {
        id: "log-2",
        pagesRead: 4,
        minutesRead: 10,
        loggedAt: new Date("2025-01-01T09:00:00Z"),
        book: { id: "book-2", title: "Friend's book", author: null, coverId: 23, coverUrl: null },
        user: { id: friendId, name: "Friend", username: "friend", avatarUrl: "https://example.com/avatar.jpg" },
    }]);
});

}

{ // services/emailService
const { assertEmailConfigured, sendAuthCode } = await import("../src/services/emailService.js");

const envKeys = ["RESEND_API_KEY", "RESEND_FROM"];

function setEmailEnv(t) {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Focuser <noreply@example.com>";
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
}

test("email authentication codes are sent through Resend", async (t) => {
    setEmailEnv(t);
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200 };
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    await sendAuthCode({ to: "user@example.com", code: "012345", purpose: "login" });
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, "Bearer test-resend-key");
    assert.deepEqual(JSON.parse(request.options.body).to, ["user@example.com"]);
    assert.match(JSON.parse(request.options.body).text, /012345/);
});

test("email delivery configuration and provider failures are reported", async (t) => {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
    assert.throws(assertEmailConfigured, { status: 503, code: "EMAIL_NOT_CONFIGURED" });

    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Focuser <noreply@example.com>";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    t.after(() => { globalThis.fetch = originalFetch; });
    await assert.rejects(sendAuthCode({
        to: "user@example.com",
        code: "012345",
        purpose: "email-verification",
    }), { status: 503, code: "EMAIL_DELIVERY_FAILED" });
});

}

{
const {lookupGoogleBookCovers}=await import('../src/services/bookCoverService.js');
const {sendAuthCode}=await import('../src/services/emailService.js');
const {createReadingCommunityService}=await import('../src/services/readingCommunityService.js');
test('ISBN match stops fallback requests and deduplicates editions',async t=>{
    let calls=0;t.mock.method(globalThis,'fetch',async url=>{calls++;assert.equal(new URL(url).searchParams.get('q'),'isbn:9780547928227');const item={volumeInfo:{title:'The Hobbit',authors:['Tolkien'],industryIdentifiers:[{type:'ISBN_13',identifier:'9780547928227'}],imageLinks:{thumbnail:'https://books.google.com/cover'}}};return {ok:true,json:async()=>({items:[item,item]})};});
    const result=await lookupGoogleBookCovers({title:'The Hobbit',author:'Tolkien',isbn:'978-0-547-92822-7'});assert.equal(calls,1);assert.equal(result.items.length,1);
});
test('cover lookup exhausts title and author fallback and tolerates network failures',async t=>{
    const queries=[];t.mock.method(globalThis,'fetch',async url=>{queries.push(new URL(url).searchParams.get('q'));throw new TypeError('private network');});
    assert.deepEqual(await lookupGoogleBookCovers({title:'Book',author:'Author'}),{ok:false,items:[]});assert.deepEqual(queries,['Book','Book Author']);
});
for(const cover of ['javascript:alert(1)','https://books.google.com.evil.example/cover','file:///private/cover'])test(`book cover rejects unsafe URL ${cover}`,async t=>{
    t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({items:[{volumeInfo:{title:'Safe Book',imageLinks:{thumbnail:cover}}}]})}));
    assert.deepEqual(await lookupGoogleBookCovers({title:'Safe Book'}),{ok:true,items:[]});
});
test('feed queries only ACCEPTED friendships in both directions and bounds results',async()=>{
    const service=createReadingCommunityService({friendship:{findMany:async({where})=>{assert.deepEqual(where,{status:'ACCEPTED',OR:[{requesterId:'self'},{addresseeId:'self'}]});return [{requesterId:'friend',addresseeId:'self'}];}},readingLog:{findMany:async args=>{assert.deepEqual(args.where.userId.in,['self','friend']);assert.equal(args.take,21);assert.deepEqual(args.orderBy,[{createdAt:'desc'},{id:'desc'}]);return [];}}});
    assert.deepEqual(await service.recentFeed('self'),{items:[],pagination:{limit:20,hasMore:false,nextCursor:null}});
});
for(const purpose of ['login','password-change','email-verification'])test(`email ${purpose} has a matching subject and includes the code`,async t=>{
    const keys=['RESEND_API_KEY','RESEND_FROM'];const old=keys.map(k=>process.env[k]);process.env.RESEND_API_KEY='fake';process.env.RESEND_FROM='noreply@example.com';t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
    t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);assert.match(body.html,/001234/);assert.match(body.text,/001234/);assert.ok(body.subject.length>10);assert.ok(options.signal instanceof AbortSignal);return {ok:true};});await sendAuthCode({to:'reader@example.com',code:'001234',purpose});
});
test('email network failure returns no provider details',async t=>{
    const old=[process.env.RESEND_API_KEY,process.env.RESEND_FROM];process.env.RESEND_API_KEY='fake';process.env.RESEND_FROM='noreply@example.com';t.after(()=>['RESEND_API_KEY','RESEND_FROM'].forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];}));
    t.mock.method(globalThis,'fetch',async()=>{throw new Error('private-provider-detail');});await assert.rejects(sendAuthCode({to:'a@example.com',code:'123456',purpose:'login'}),error=>{assert.equal(error.code,'EMAIL_DELIVERY_FAILED');assert.doesNotMatch(error.message,/private-provider-detail/);return true;});
});
}
