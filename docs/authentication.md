# Authentication Module

## Architecture

- `models/userModel.js`: User schema, password hash, verification/reset hashes, MFA state, and JWT token version.
- `models/authSessionModel.js`: Per-device session metadata, hashed refresh-token IDs, revocation, and expiry.
- `services/authService.js`: Business rules for registration, verification, login, refresh rotation, sessions, MFA, password reset, and logout.
- `controllers/authController.js`: Reads HTTP input and sends HTTP responses.
- `routes/authRoutes.js`: Maps URLs to controller functions.
- `middleware/authMiddleware.js`: Reads the short-lived Bearer access JWT, validates the user and active session, and provides role authorization.
- `config/env.js`: Loads and validates environment configuration.
- `utils/token.js`: Creates one-time tokens and purpose-scoped access/refresh JWTs.
- `utils/totp.js`: Encrypts authenticator secrets at rest with AES-256-GCM.
- `utils/mailer.js`: Sends SMTP email or logs development links when SMTP is not configured.
- `middleware/errorHandler.js`: Converts errors into consistent JSON responses.
- `middleware/security.js`: Adds Helmet headers, CORS allowlisting, rate limits, request sanitization, and HTTP parameter-pollution protection.

## Environment

Copy `.env.example` values into `.env` and replace placeholders. Never commit `.env`.

`ACCESS_TOKEN_MINUTES` defaults to `15`; `REFRESH_TOKEN_DAYS` defaults to `30`. `JWT_SECRET` is also used to derive the TOTP-secret encryption key. Rotating it invalidates sessions and requires users with MFA enabled to enroll again.

Without SMTP settings, registration and forgot-password links appear in the server console for local testing. In production, configure SMTP values and do not log tokens.

## API security

- Helmet sends common HTTP security headers and `X-Powered-By` is disabled.
- CORS allows only `CORS_ORIGINS`; requests without an `Origin` header remain available for server-to-server and Postman testing.
- API requests are limited to 300 per 15 minutes per client. Authentication routes are limited to 20 per 15 minutes, and file uploads to 30 per 15 minutes.
- JSON and URL-encoded request bodies are limited to 100 KB. File uploads have their separate 5 MB Multer limit.
- MongoDB operator keys and HTTP parameter pollution are sanitized before route handling.
- Passwords are hashed with bcrypt and never returned in public user data.
- Access tokens expire after 15 minutes by default. Refresh tokens are HttpOnly, SameSite=Strict cookies; only their hashed token IDs are stored in MongoDB.
- Refresh tokens rotate atomically. Reuse of a previously rotated token revokes that device session.
- TOTP secrets are encrypted at rest. Recovery codes are stored as hashes and shown only when generated.

Set `CORS_ORIGINS` to the exact frontend origins in production, for example:

```env
CORS_ORIGINS=https://portal.example.com
```

## Authentication flow

1. Register with `name`, `email`, and a password of at least 8 characters.
2. A random email-verification token is emailed; only its SHA-256 hash and expiry are stored. New links place the token in the URL fragment and submit it via POST so it is not sent in the initial HTTP request.
3. Verify with the token before its 30-minute expiry.
4. Login returns a 15-minute `accessToken`; the 30-day refresh token is set only as an HttpOnly cookie. If TOTP is enabled, password login first returns `{ "requiresTwoFactor": true }`; submit the password and authenticator/recovery code to complete sign-in.
5. The frontend keeps the access token in memory, refreshes it on expiry, and retries the failed API request once. Refresh rotation reuses the existing device session and expiry.
6. `/sessions` lists active devices. A device can be revoked individually, or `/logout-all` revokes all sessions and increments `tokenVersion`.
7. Forgot-password creates a separate random 15-minute token. Resetting the password revokes all sessions and increments `tokenVersion`.
8. Users enable TOTP from the Security screen by scanning a QR code and confirming one code. Ten one-time recovery codes are then shown; save them securely.

## Role-based access control

Users have one of these roles: `admin`, `hr`, or `employee`. New public registrations always receive the `employee` role; the registration request cannot grant elevated privileges.

| Role | Employee APIs | Salary APIs | Ownership |
| --- | --- | --- | --- |
| `admin` | Read, create, update, delete | Read, create, update, delete | All records |
| `hr` | Read, create, update, delete | Read, create, update, delete | All records |
| `employee` | Read own profile only | Read own salary only | Record email must match the logged-in user |

Existing users created before RBAC need a role migration. Run this once in MongoDB, then promote selected accounts securely:

```js
db.users.updateMany({ role: { $exists: false } }, { $set: { role: 'employee' } });
db.users.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });
db.users.updateOne({ email: 'hr@example.com' }, { $set: { role: 'hr' } });
```

Authorization failures return `403`. Missing or invalid Bearer tokens return `401`.

## Employee file uploads

Files are private and stored with generated names under `uploads/employee-files`. The original filename is retained only as metadata. Uploads accept JPG, PNG, GIF, WEBP, PDF, DOC, DOCX, and XLSX files up to 5 MB. The server checks the file signature against the declared type, but production deployments should also run an antivirus engine such as ClamAV. Upload and list responses include short-lived (10 minute) `previewUrl` and `downloadUrl` values that can be opened directly in a browser.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/employees/:id/files` | Admin, HR, or owning employee | Upload one file using multipart field `file` |
| GET | `/api/employees/:id/files` | Admin, HR, or owning employee | List file metadata |
| GET | `/api/employees/:id/files/:fileId` | Admin, HR, or owning employee | Download a file |
| GET | `/api/employees/:id/files/:fileId/preview` | Admin, HR, or owning employee | Preview a file inline |
| DELETE | `/api/employees/:id/files/:fileId` | Admin or HR | Delete a file |

Example upload:

```bash
curl -X POST http://localhost:5000/api/employees/EMPLOYEE_ID/files \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@./identity-document.pdf"
```

## Endpoints

Base URL: `http://localhost:5000/api/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | No | Create an account and send verification email |
| GET | `/verify-email?token=...` | No | Verify email |
| POST | `/verify-email` | No | Verify email using a JSON token |
| POST | `/resend-verification` | No | Send a new verification token |
| POST | `/login` | No | Return an access token and set refresh cookie; may return an MFA challenge |
| POST | `/refresh` | Refresh cookie | Rotate refresh cookie and return a new access token |
| GET | `/profile` | Bearer JWT | Return current user |
| GET | `/users/accounts` | HR or Admin Bearer JWT | List accounts visible to the current manager role, with safe registration and login metadata |
| GET | `/users/employees` | HR or Admin Bearer JWT | List employee-role accounts only |
| GET | `/sessions` | Bearer JWT | List active devices, marking the current session |
| DELETE | `/sessions/:id` | Bearer JWT | Revoke one device session |
| POST | `/logout-all` | Bearer JWT | Revoke every device session |
| POST | `/2fa/setup` | Bearer JWT | Create a short-lived TOTP enrollment QR code |
| POST | `/2fa/enable` | Bearer JWT | Confirm TOTP and enable MFA; returns recovery codes once |
| POST | `/2fa/disable` | Bearer JWT | Disable MFA after password and second-factor verification |
| POST | `/2fa/recovery-codes` | Bearer JWT | Replace recovery codes after second-factor verification |
| POST | `/forgot-password` | No | Send password reset token |
| POST | `/reset-password` | No | Set a new password |
| POST | `/logout` | Bearer JWT | Revoke the current device session |
| POST | `/users/role` | HR or Admin Bearer JWT | HR can assign `employee`, `manager`, or `hr`; admins can also assign `hr_manager` and `admin`; only super admins can assign `super_admin` |

## Postman test cases

Set Postman variables `authUrl` to `http://localhost:5000/api/auth`, `employeeUrl` to `http://localhost:5000/api/employees`, and `salaryUrl` to `http://localhost:5000/api/salaries`. Create and verify one account for each role, promote the HR and admin accounts as described above, then log in again to receive tokens containing the updated roles.

### Positive cases

1. `POST {{authUrl}}/register`

```json
{
  "name": "Alice Example",
  "email": "alice@example.com",
  "password": "Password123"
}
```

Copy the verification token from the development server console, then call `GET {{authUrl}}/verify-email?token=TOKEN`.

2. `POST {{authUrl}}/login`

```json
{
  "email": "alice@example.com",
  "password": "Password123"
}
```

Save each role's `data.accessToken` as `employeeToken`, `hrToken`, or `adminToken` and use it as a Bearer token. Keep the Postman cookie jar enabled so it retains `employeePortalRefresh` for `/refresh`.

3. `GET {{authUrl}}/profile` with `Authorization: Bearer TOKEN`.

4. `POST {{authUrl}}/forgot-password`

```json
{ "email": "alice@example.com" }
```

Copy the reset token from the server console, then call `POST {{authUrl}}/reset-password`:

```json
{
  "token": "RESET_TOKEN",
  "password": "NewPassword123"
}
```

5. `POST {{authUrl}}/resend-verification` before verification:

```json
{ "email": "alice@example.com" }
```

6. `POST {{authUrl}}/logout` with the Bearer token. A later profile call with that token should fail.

7. Assign a role from an admin account:

```http
POST {{authUrl}}/users/role
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json
```

```json
{
  "email": "person@example.com",
  "role": "hr"
}
```

The same request with `"role": "employee"` changes the user back to an employee. A non-admin receives `403`; an unknown email receives `404`; and any role other than `employee` or `hr` receives `400`.

### RBAC matrix

Use a real employee record whose `email` matches the employee account. For an employee account, use its employee ID and salary ID for the own-record checks.

| Request | Admin | HR | Employee |
| --- | --- | --- | --- |
| `GET {{employeeUrl}}` | `200` | `200` | `200`, own record only |
| `GET {{employeeUrl}}/:id` for another employee | `200` | `200` | `404` |
| `POST {{employeeUrl}}` | `201` | `201` | `403` |
| `PUT/DELETE {{employeeUrl}}/:id` | `200` | `200` | `403` |
| `GET {{salaryUrl}}` | `200` | `200` | `200`, own salary only |
| `GET {{salaryUrl}}/:id` for another employee | `200` | `200` | `404` |
| `POST {{salaryUrl}}` | `201` | `201` | `403` |
| `PUT/DELETE {{salaryUrl}}/:id` | `200` | `200` | `403` |

### Negative cases and expected status

- Register without a valid email or with a password shorter than 8 characters: `400`.
- Register with an existing email: `409`.
- Login before email verification: `403`.
- Login with the wrong password: `401`.
- Verify with a bad or expired token: `400`.
- Profile without a token, with a malformed token, or after logout: `401`.
- Reset with a bad or expired token: `400`.
- Reset with a password shorter than 8 characters: `400`.
- Unknown route: `404`.

Successful responses have this shape:

```json
{
  "success": true,
  "data": {}
}
```

Errors have this shape:

```json
{
  "success": false,
  "message": "Readable error message"
}
```
