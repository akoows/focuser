# Focuser API

Express API backed by Prisma and MongoDB. Responses use `{ success, data }` on success and `{ success: false, error }` on failure.

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a MongoDB replica set and `JWT_SECRET` to a random secret of at least 32 bytes.
2. Run `npm run db:generate`, then `npx prisma db push` to apply the MongoDB collection changes. `db push` is an explicit deployment step and is not run by the API or test suite.
3. Start the API with `npm start`.

`GOOGLE_BOOKS_API_KEY` enables Google Books results in addition to Open Library's public search. Open Library is used without a key. If every configured book-search provider is unavailable, lookup returns `502 BOOK_LOOKUP_UNAVAILABLE`; partial provider outages are reported in the `sources` object. `GROQ_API_KEY` optionally enables a book-edition recommendation; without it, lookup returns regular search results with no AI recommendation. Set `GROQ_MODEL` to override the default model.

New account registration and profile-image uploads also require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. `CLOUDINARY_FOLDER` defaults to `focuser/avatars`. Email verification, login confirmation, and password-change codes require `RESEND_API_KEY` and `RESEND_FROM`. Habit categorization and AI habit analysis require `GROQ_API_KEY`; provider failures are returned to the client rather than silently ignored.

## Web API features

All routes are under `/api`; mutating requests from the web client must send `X-Focuser-Client: web`. Authenticated routes use the `focuser_token` HttpOnly cookie.

- Authentication: `POST /auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/verify-login`, and `/auth/logout`; `GET /auth/me`. Accounts verify their email and confirm logins with one-time codes; local `@focuser.dev` accounts bypass email codes in development/test.
- Profile: `GET /users/me`, `PATCH /users/me`, `GET /users/by-username/:username`, signed avatar/banner uploads, and email-confirmed password changes.
- Goals: `GET|POST /goals`, `PATCH|DELETE /goals/:id`, `POST /goals/:id/progress`.
- Focus: `GET /focus-sessions/active`, `GET|POST /focus-sessions`, and `POST /focus-sessions/:id/{pause,resume,complete,cancel}`.
- Reading: `GET /reading/today`, `GET|POST /reading/books`, `PATCH|DELETE /reading/books/:id`, `POST /reading/books/:id/logs`, `POST /reading/isbn-lookup`.
- Academia: `GET|POST /gym/plans`, `PATCH|DELETE /gym/plans/:id`, `POST /gym/sessions`, `GET /gym/sessions/active`, set/exercise registration, and explicit completion or abandonment. Completed history, exercise statistics (including average repetitions), and the 365-day consistency calendar are available under `/gym`. `DELETE /gym/sessions/history` removes only the authenticated user's completed sessions; `DELETE /gym/sessions/:id/exercises/:exerciseId` removes one exercise from one completed session.
- Habits are automatically categorized with Groq. Check-ins, dashboard, progress, AI analysis, and public profiles are also available.

Workout plans and sessions are stored in MongoDB collections scoped to the authenticated user. Exercise and set snapshots are embedded in each plan/session document so editing a plan never rewrites completed history. Starting, completing, and abandoning an active session update the session and the user's active-session pointer transactionally. The configured MongoDB deployment must support transactions (a replica set).

## Tests

`npm run test:api` runs the API's Node test suite. The suite does not connect to MongoDB; configure a separate test database before running any future database integration tests.
