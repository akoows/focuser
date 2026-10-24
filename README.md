# Focuser API

Express API backed by Prisma and MongoDB. Responses use `{ success, data }` on success and `{ success: false, error }` on failure.

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a MongoDB replica set and `JWT_SECRET` to a random secret of at least 32 bytes.
2. Run `npm run prisma:generate`, then `npm run db:push` to apply the MongoDB collection changes. `db:push` is an explicit deployment step and is not run by the API or test suite.
3. Start the API with `npm start`.

The API validates critical configuration before listening. `DATABASE_URL` must be a MongoDB URL with a database name; `JWT_SECRET` must contain at least 32 bytes. Optional provider credentials are only required when their associated feature is used.

### Environment settings

| Variable | Purpose | Requirement, default and invalid/missing behavior |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | Optional; `development`; accepts `development`, `test` or `production` |
| `PORT` | HTTP listen port | Optional; `3000`; integer 1–65535 |
| `DATABASE_URL` | Prisma MongoDB connection | Required, including database name; must use `mongodb:` or `mongodb+srv:`. Replica set required for transactions |
| `JWT_SECRET` | JWT and one-time code signing | Required; at least 32 UTF-8 bytes; value is never written to startup errors |
| `CORS_ORIGINS` | Additional allowed web origins (comma-separated exact origins) | Local origins are built in outside production; required in production, where localhost and non-HTTPS web origins are rejected |
| `TRUST_PROXY` | Trusted reverse-proxy hop count | Optional; `0`; integer 0–10, set to match actual topology |
| `JWT_EXPIRES_IN_DAYS` | JWT and cookie lifetime in days | Optional; `7`; integer 1–365 |
| `JWT_EXPIRES_IN` | Legacy JWT lifetime override | Optional compatibility alias (e.g. `2h`); accepts positive integer seconds/minutes/hours/days, max 365 days; takes precedence over `JWT_EXPIRES_IN_DAYS` |
| `COOKIE_SECURE` | Whether the auth cookie requires HTTPS | Optional; `false` outside production and `true` by default in production; production cannot disable it |
| `COOKIE_SAMESITE` | Auth cookie SameSite policy | Optional; `lax`; `strict`, `lax` or `none`; `none` requires Secure. Legacy `COOKIE_SAME_SITE` is still accepted |
| `BCRYPT_COST` | Password hashing work factor | Optional; `12`; integer 4–15 |
| `RESEND_API_KEY`, `RESEND_FROM` | E-mail verification, login and password-change codes | Optional until an e-mail flow is used; missing credentials return a configuration error |
| `RATE_LIMIT_GLOBAL_MAX` | All API requests per IP per 15 minutes | Optional; `1000`; positive integer |
| `RATE_LIMIT_LOGIN_MAX` | Login requests per IP per 15 minutes | Optional; `10`; positive integer |
| `RATE_LIMIT_REGISTER_MAX` | Registration and registration-image-signature requests per IP per hour | Optional; `10`; positive integer |
| `RATE_LIMIT_AUTH_CODE_MAX` | Authentication-code requests per IP and account per 15 minutes | Optional; `10`; positive integer |
| `RATE_LIMIT_AI_PER_HOUR` | Calls that use Groq per authenticated user per hour | Optional; `5`; positive integer |
| `RATE_LIMIT_ISBN_LOOKUP_PER_HOUR` | ISBN lookups per authenticated user per hour | Optional; `20`; positive integer |
| `RATE_LIMIT_EXERCISE_IMAGES_PER_HOUR` | Exercise image lookups per authenticated user per hour | Optional; `60`; positive integer |
| `GROQ_API_KEY` | Habit classification, analysis, exercise name matching and optional book recommendations | Optional until a Groq-backed feature is used; required by mandatory classification/analysis endpoints |
| `GROQ_MODEL` | Groq model name | Optional; `llama-3.3-70b-versatile` in code; `.env.example` provides an override |
| `GROQ_TIMEOUT_MS` | Groq request timeout | Optional; `15000` ms; integer 500–120000 |
| `GOOGLE_BOOKS_API_KEY` | Adds Google Books to the public Open Library lookup | Optional; lookup can use Open Library without it |
| `GOOGLE_BOOKS_TIMEOUT_MS` | Google Books request timeout | Optional; `8000` ms; integer 500–120000 |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Signed profile-image uploads | Optional until upload/registration is used; required for those features |
| `CLOUDINARY_FOLDER` | Root directory for profile images | Optional; `focuser/avatars` |
| `VITE_API_URL` (web) | Frontend API base URL | Optional; defaults to `http://<page-hostname>:3000/api`; set to the reachable API origin outside local development |

Rate-limit counters use the package's in-memory store, so they are per process and reset on restart. A shared store is needed for consistent limits across multiple API instances; no Redis or other shared store is configured by this project.

For a web frontend and API on different registrable sites, configure `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, HTTPS, and the exact frontend origin in `CORS_ORIGINS`. Same-site deployments can use the default `lax` policy.

`GOOGLE_BOOKS_API_KEY` enables Google Books results in addition to Open Library's public search. Book cover lookup tries an ISBN first when provided, then searches by title, and only then tries title plus author; this avoids overly restrictive title/author queries that can return no matches. When a configured Google Books key is rejected, the lookup also tries the public endpoint without the key. Cover selection accepts Google's thumbnail or small-thumbnail URLs and upgrades them to HTTPS. Open Library is used without a key. If every configured book-search provider is unavailable, lookup returns `502 BOOK_LOOKUP_UNAVAILABLE`; partial provider outages are reported in the `sources` object. `GROQ_API_KEY` optionally enables a book-edition recommendation; without it, lookup returns regular search results with no AI recommendation. Set `GROQ_MODEL` to override the default model.

New account registration and profile-image uploads also require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. `CLOUDINARY_FOLDER` defaults to `focuser/avatars`. Email verification, login confirmation, and password-change codes require `RESEND_API_KEY` and `RESEND_FROM`. Habit categorization and AI habit analysis require `GROQ_API_KEY`; provider failures are returned to the client rather than silently ignored.

## Web API features

All routes are under `/api`; mutating requests from the web client must send `X-Focuser-Client: web`. Authenticated routes use the `focuser_token` HttpOnly cookie.

- Authentication: `POST /auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/verify-login`, and `/auth/logout`; `GET /auth/me`. Accounts verify their email and confirm logins with one-time codes; local `@focuser.dev` accounts bypass email codes in development/test.
- Profile: `GET /users/me`, `PATCH /users/me`, `GET /users/by-username/:username`, `PUT|DELETE /users/me/reading-focus`, signed avatar/banner uploads, and email-confirmed password changes. Public profiles include reading status, selected books, and recent reading history.
- Friends: `GET /friends?limit=20&cursor=<opaque>` (limit 1–50; default 20), `GET /friends/status/:username`, `POST /friends/requests`, `POST /friends/requests/:id/accept`, `DELETE /friends/requests/:id`, and `DELETE /friends/:id`. Friend lists expose only public profile fields. A page retains `friends`, `incomingRequests`, and `outgoingRequests` arrays and adds `pagination: { limit, hasMore, nextCursor }`.
- Goals: `GET|POST /goals`, `PATCH|DELETE /goals/:id`, `POST /goals/:id/progress`.
- Focus: `GET /focus-sessions/active`, `GET|POST /focus-sessions`, and `POST /focus-sessions/:id/{pause,resume,complete,cancel}`.
- Reading: `GET /reading/today`, `GET /reading/feed?limit=20&cursor=<opaque>` (limit 1–50; default 20), `GET|POST /reading/books`, `PATCH|DELETE /reading/books/:id`, `POST /reading/books/:id/logs`, and `POST /reading/isbn-lookup`. The feed contains the authenticated user's activity and activity from accepted friends; its data is `{ items, pagination: { limit, hasMore, nextCursor } }`.
- Academia: `GET|POST /gym/plans`, `PATCH|DELETE /gym/plans/:id`, `POST /gym/sessions`, `GET /gym/sessions/active`, set/exercise registration, and explicit completion or abandonment. `POST /gym/exercise-images` accepts `{ "names": ["Supino reto", "Agachamento"] }` and returns ExerciseDB GIF URLs for matches; `imageUrl` and `matchedName` are `null` when no suitable image exists. If configured, Groq translates/matches Portuguese names before the lookup. Image results are cached in API memory, and requests are limited per user. The web shows initials from up to two words when an image is unavailable. [ExerciseDB](https://oss.exercisedb.dev/) warns that its hosted playground endpoints are for exploration and may have strict rate limits; use a self-hosted or production-approved provider for production traffic. Completed history, exercise statistics (average repetitions, load records, estimated 1RM, and volume by session/week/month), and the 365-day consistency calendar are available under `/gym`. `DELETE /gym/sessions/history` removes only the authenticated user's completed sessions; `DELETE /gym/sessions/:id/exercises/:exerciseId` removes one exercise from one completed session. The web module is available at `/app/academia`; workout plans and session exercise snapshots remain embedded in MongoDB documents, so no schema migration is needed for the web integration or statistics.
- Habits are automatically categorized with Groq. Check-ins, dashboard, progress, AI analysis, and public profiles are also available.

Cursor endpoints accept `limit` (default 20, maximum 50) and an optional opaque `cursor` returned by the previous page. Fetch the next page with the same limit and `cursor=<nextCursor>`; the cursor is scoped by the authenticated account's query and clients should treat it as an uninterpreted token. Both responses include `pagination: { limit, hasMore, nextCursor }`; `nextCursor` is `null` on the last page. Invalid cursors, unknown query parameters, and limits outside 1–50 return HTTP 400.

There is currently no forgotten-password recovery flow. Password changes require the current password and an e-mail confirmation, so this flow cannot recover an account when the user cannot authenticate.

Workout plans and sessions are stored in MongoDB collections scoped to the authenticated user. Exercise and set snapshots are embedded in each plan/session document so editing a plan never rewrites completed history. Starting, completing, and abandoning an active session update the session and the user's active-session pointer transactionally. The configured MongoDB deployment must support transactions (a replica set).

## Tests

`npm run test:api` runs the Node test suite under `src`, including HTTP middleware tests for CORS, CSRF and rate limits. `npm run test:regression` runs behavior-focused regression tests. `npm run test:db:integration` runs database tests against the isolated local MongoDB replica set configured in `.env.test`; never point test commands at a production database. The API CI workflow runs all three suites against a temporary MongoDB replica set. Generate the Prisma client with `npm run prisma:generate` before starting the API.
