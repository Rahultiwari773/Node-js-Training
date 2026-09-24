# Node-js-Training

Employee management API with role-based access control, salary records, secure file uploads, request validation, and a React API console.

## Run the backend

```bash
npm install
npm run dev
```

The backend runs at `http://localhost:5000`.

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

Copy `.env.example` to `.env` and configure `MONGO_URI`, `JWT_SECRET`, and `CORS_ORIGINS`. Never commit `.env`.

## Main features

- JWT authentication and bcrypt password hashing
- Admin, HR, and employee RBAC
- Employee and salary APIs
- Private employee file uploads with a 5 MB limit
- PDF, image, Word, and XLSX validation
- Authenticated file preview and download links
- Helmet, CORS, rate limiting, request sanitization, and validation
- React dashboard for testing the API by role