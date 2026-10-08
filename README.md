# Node-js-Training

Employee management API with role-based access control, salary records, secure file uploads, request validation, and a React API console.

## Run the backend

```bash
npm install
npm run dev
```

The backend runs at `http://localhost:5000`.

Interactive API reference: `http://localhost:5000/api-docs/`. The raw OpenAPI 3 specification is available at `http://localhost:5000/api-docs.json`.

## Run the React frontend

In a second terminal:

```bash
npm run frontend:dev
```

Open `http://localhost:5173`.

For a production frontend build:

```bash
npm run frontend:build
npm start
```

## Environment

Copy `.env.example` to `.env` and configure `MONGO_URI`, `JWT_SECRET`, and `CORS_ORIGINS`. Start Redis locally or set `REDIS_URL` to your Redis server. Never commit `.env`.

## Redis employee cache

`GET /api/employees` uses the cache-aside pattern. The service checks Redis first; a hit returns the cached list, while a miss queries MongoDB and stores the result in Redis for 60 seconds. Cache keys separate users with restricted employee visibility from roles that can see every employee. Creating, updating, or deleting an employee clears employee-list cache keys. The server logs cache hits and misses and continues to serve requests from MongoDB if Redis is unavailable.

Authentication sessions are still stored in MongoDB (`auth_sessions`) so refresh-token rotation, revocation, and expiry remain durable. Redis is used for employee response caching, not as the authentication session store.

## Employee account visibility

HR, HR managers, admins, and super admins can open **Employee accounts** in the dashboard. The protected `GET /api/auth/users/accounts` endpoint lists accounts the current role may manage, with registration date, email verification, two-factor status, and last successful login. HR can change roles directly in each row; assigned HR and manager accounts remain in the list. Passwords, tokens, and authentication secrets are never returned. Accounts created before last-login tracking was added show `Never` until their next successful sign-in.

## Real-time updates

The backend uses Socket.IO with the same access-token, token-version, and active-session checks as the REST API. Connected clients receive a distinct online-account count and live updates when a published announcement is created, edited, unpublished, or deleted. Draft announcement content is not broadcast. HR, HR managers, admins, and super admins also have a **Live monitor** screen that receives successful employee, salary, leave, letter, policy, document, account, and announcement activity and refreshes the affected dashboard data. Activity messages contain a summary, actor name/role, and timestamp only; the feed lives in browser memory and is not an audit log.

To try it locally, run both `npm run dev` and `npm run frontend:dev`, sign in from two browser windows, and publish an announcement from one window. The other window updates immediately and displays a notification. The dashboard also shows the realtime connection state and current online count. If the backend uses a port other than 5000, set `API_TARGET` to its URL before starting Vite (for example, `http://localhost:5001`).

## Main features

- JWT authentication and bcrypt password hashing
- Admin, HR, and employee RBAC
- Employee and salary APIs
- Private employee file uploads with a 5 MB limit
- PDF, image, Word, and XLSX validation
- Authenticated file preview and download links
- Helmet, CORS, rate limiting, request sanitization, and validation
- React dashboard for testing the API by role

## Resumable chunked document uploads

`POST /api/documents/uploads` starts an authenticated upload. Send JSON containing `employeeId`, `documentType`, `originalFileName`, `mimeType`, and `fileSize` (1 byte to 5 MB). The response includes a UUID `uploadId`, a 1 MiB `chunkSize`, and `totalChunks`. Supported files are PDF, JPG/JPEG, and PNG.

Send each chunk as a raw `application/octet-stream` request body, using zero-based chunk indexes:

```text
PUT /api/documents/uploads/{uploadId}/chunks/{chunkIndex}
POST /api/documents/uploads/{uploadId}/complete
DELETE /api/documents/uploads/{uploadId}
```

For example, in a browser client, slice the `File` into chunks using the returned chunk size and `PUT` each `file.slice(index * chunkSize, (index + 1) * chunkSize)` to its chunk URL. Call `complete` after all chunks are accepted. The server streams each chunk to disk, assembles the file as a stream, and then applies the same file-signature checks, employee access rules, and OCR processing as the existing single-request upload. Sessions are private to the authenticated user, expire after 24 hours, and can be cancelled with `DELETE`. `POST /api/documents/upload` remains available for regular multipart uploads.

The React **Documents → Upload document** form uses this chunked flow automatically: it starts a session, uploads chunks sequentially, displays byte progress, and finalizes the document. Use **Cancel upload** to abort and discard the current session.
