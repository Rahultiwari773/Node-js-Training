# Authentication Module

## Architecture

- `models/userModel.js`: User schema, password hash, verification/reset hashes, expiry dates, and JWT token version.
- `services/authService.js`: Business rules for registration, verification, login, profile, password reset, and logout.
- `controllers/authController.js`: Reads HTTP input and sends HTTP responses.
- `routes/authRoutes.js`: Maps URLs to controller functions.
- `middleware/authMiddleware.js`: Reads the Bearer JWT, validates it, checks the user, attaches `req.user`, and provides role authorization.
- `config/env.js`: Loads and validates environment configuration.
- `utils/token.js`: Creates one-time tokens and JWT access tokens.
- `utils/mailer.js`: Sends SMTP email or logs development links when SMTP is not configured.
- `middleware/errorHandler.js`: Converts errors into consistent JSON responses.
- `middleware/security.js`: Adds Helmet headers, CORS allowlisting, rate limits, request sanitization, and HTTP parameter-pollution protection.

## Environment

Copy `.env.example` values into `.env` and replace placeholders. Never commit `.env`.

Without SMTP settings, registration and forgot-password links appear in the server console for local testing. In production, configure SMTP values and do not log tokens.

## API security

- Helmet sends common HTTP security headers and `X-Powered-By` is disabled.
- CORS allows only `CORS_ORIGINS`; requests without an `Origin` header remain available for server-to-server and Postman testing.
- API requests are limited to 300 per 15 minutes per client. Authentication routes are limited to 20 per 15 minutes, and file uploads to 30 per 15 minutes.
- JSON and URL-encoded request bodies are limited to 100 KB. File uploads have their separate 5 MB Multer limit.
- MongoDB operator keys and HTTP parameter pollution are sanitized before route handling.
- Passwords are hashed with bcrypt and never returned in public user data.

Set `CORS_ORIGINS` to the exact frontend origins in production, for example:

```env
CORS_ORIGINS=https://portal.example.com
```

## Authentication flow

1. Register with `name`, `email`, and a password of at least 8 characters.
2. The password is hashed with bcrypt. A random verification token is emailed; only its SHA-256 hash and expiry are stored.
3. Verify with the token before its 30-minute expiry.
4. Login returns a JWT only after email verification.
5. Send the JWT as `Authorization: Bearer <token>` to access profile and logout.
6. Forgot-password creates a separate random 15-minute token. Resetting the password clears the token and increments `tokenVersion`, invalidating old JWTs.
7. Logout increments `tokenVersion`, so the current JWT immediately stops working.

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
| POST | `/resend-verification` | No | Send a new verification token |
| POST | `/login` | No | Return a JWT |
| GET | `/profile` | Bearer JWT | Return current user |
| POST | `/forgot-password` | No | Send password reset token |
| POST | `/reset-password` | No | Set a new password |
| POST | `/logout` | Bearer JWT | Invalidate the current token version |
| POST | `/users/role` | Admin Bearer JWT | Assign `employee` or `hr` to a registered user |

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

Save each role's `data.token` as `employeeToken`, `hrToken`, or `adminToken` and use it as a Bearer token.

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
