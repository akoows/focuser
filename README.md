# Focuser API

Express API backed by Prisma and MongoDB. Responses use `{ success, data }` on success and `{ success: false, error }` on failure.

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a MongoDB replica set and `JWT_SECRET` to a random secret of at least 32 bytes.
2. Configure `RESEND_API_KEY` and `EMAIL_FROM` for registration verification and one-time login codes. Auth routes that need to send a message return `503 EMAIL_NOT_CONFIGURED` when these settings are missing; they never report a code as sent when there is no mail provider. Codes expire after 10 minutes, allow at most five attempts, and are rate-limited to five sends per user and purpose per 10 minutes.
3. Run `npm run db:generate`, then `npx prisma db push` to apply the MongoDB collection changes. `db push` is an explicit deployment step and is not run by the API or test suite.
4. Start the API with `npm start`.

`GOOGLE_BOOKS_API_KEY` enables Google Books results in addition to Open Library's public search. Open Library is used without a key. If every configured book-search provider is unavailable, lookup returns `502 BOOK_LOOKUP_UNAVAILABLE`; partial provider outages are reported in the `sources` object. `GROQ_API_KEY` optionally enables a book-edition recommendation; without it, lookup returns regular search results with no AI recommendation. Set `GROQ_MODEL` to override the default model.

## Web API features

All routes are under `/api`; mutating requests from the web client must send `X-Focuser-Client: web`. Authenticated routes use the `focuser_token` HttpOnly cookie.

- Authentication: `POST /auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/verify-login`, `/auth/logout`; `GET /auth/me`. Registration verifies email and password login then requires a one-time email code before creating a session.
- Profile: `GET /users/me`, `PATCH /users/me` (`name`, `timezone`, and `accentColor`).
- Goals: `GET|POST /goals`, `PATCH|DELETE /goals/:id`, `POST /goals/:id/progress`.
- Focus: `GET /focus-sessions/active`, `GET|POST /focus-sessions`, and `POST /focus-sessions/:id/{pause,resume,complete,cancel}`.
- Reading: `GET /reading/today`, `GET|POST /reading/books`, `PATCH|DELETE /reading/books/:id`, `POST /reading/books/:id/logs`, `POST /reading/isbn-lookup`.
- Habits, check-ins, dashboard, and progress are also available.

## Tests

`npm run test:api` runs the API's Node test suite. The suite does not connect to MongoDB; configure a separate test database before running any future database integration tests.
