process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.CORS_ORIGINS = 'http://localhost:5173';

jest.mock('../services/authService', () => ({
  register: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  login: jest.fn(),
  refreshSession: jest.fn(),
  forgotPassword: jest.fn(),
  resetPasswordPage: jest.fn(),
  resetPassword: jest.fn(),
  getProfile: jest.fn(),
  listManagedAccounts: jest.fn(),
  listEmployeeAccounts: jest.fn(),
  assignRole: jest.fn(),
  logout: jest.fn()
}));

jest.mock('../models/userModel', () => ({ findById: jest.fn() }));
jest.mock('../models/authSessionModel', () => ({ findOne: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const authService = require('../services/authService');
const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const authRoutes = require('../routes/authRoutes');
const leaveRoutes = require('../routes/leaveRoutes');
const letterRoutes = require('../routes/letterRoutes');

describe('API security and validation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the React application from the root route', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<!doctype html>');
  });

  test('serves the OpenAPI specification as JSON', async () => {
    const response = await request(app).get('/api-docs.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(response.body.paths['/auth/users/employees'].get).toBeDefined();
    expect(response.body.paths['/auth/users/accounts'].get).toBeDefined();
    expect(response.body.paths['/employees'].post.requestBody).toBeDefined();
    expect(response.body.components.schemas.EmployeeInput).toBeDefined();
    expect(response.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  test('serves interactive Swagger UI', async () => {
    const response = await request(app).get('/api-docs/');
    const initializer = await request(app).get('/api-docs/swagger-ui-init.js');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui-bundle.js');
    expect(response.text).toContain('swagger-ui-init.js');
    expect(response.headers['content-security-policy']).toContain("'unsafe-inline'");
    expect(initializer.status).toBe(200);
    expect(initializer.headers['content-type']).toContain('javascript');
  });

  test('adds HTTP security headers', async () => {
    const response = await request(app).get('/');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  test('allows configured frontend origins', async () => {
    const response = await request(app)
      .get('/')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);

     'post /2fa/recovery-codes'
      , 'get /users/employees'
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('rejects unknown CORS origins', async () => {
    const response = await request(app)
      .get('/')
      .set('Origin', 'https://malicious.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, message: 'Origin is not allowed' });
  });

  test('rejects invalid login payloads before calling the service', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'email', location: 'body' }),
      expect.objectContaining({ field: 'password', location: 'body' })
    ]));
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('accepts a valid login and returns the service response', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'test-access-token',
      expiresIn: 900,
      refreshToken: 'test-refresh-token',
      refreshExpiresAt: new Date(Date.now() + 60_000),
      sessionId: 'session-id',
      user: { id: 'user-id', email: 'user@example.com', role: 'employee' }
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        accessToken: 'test-access-token',
        expiresIn: 900,
        sessionId: 'session-id',
        user: { id: 'user-id', email: 'user@example.com', role: 'employee' }
      }
    });
    expect(response.headers['set-cookie'][0]).toContain('employeePortalRefresh=test-refresh-token');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(authService.login).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        password: 'Password123'
      },
      expect.objectContaining({ ipAddress: expect.any(String) })
    );
  });

  test('rotates the refresh cookie without returning it in JSON', async () => {
    authService.refreshSession.mockResolvedValue({
      accessToken: 'new-access-token',
      expiresIn: 900,
      refreshToken: 'new-refresh-token',
      refreshExpiresAt: new Date(Date.now() + 60_000),
      sessionId: 'session-id'
    });

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'employeePortalRefresh=old-refresh-token');

    expect(response.status).toBe(200);
    expect(authService.refreshSession).toHaveBeenCalledWith('old-refresh-token');
    expect(response.body.data).toEqual({ accessToken: 'new-access-token', expiresIn: 900, sessionId: 'session-id' });
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toContain('employeePortalRefresh=new-refresh-token');
  });

  test('returns a second-factor challenge without creating a session cookie', async () => {
    authService.login.mockResolvedValue({ requiresTwoFactor: true });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ requiresTwoFactor: true });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('registers refresh, session, global logout, and two-factor endpoints', () => {
    const routes = authRoutes.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method} ${layer.route.path}`));

    expect(routes).toEqual(expect.arrayContaining([
      'post /refresh',
      'get /sessions',
      'delete /sessions/:id',
      'post /logout-all',
      'post /2fa/setup',
      'post /2fa/enable',
      'post /2fa/disable',
      'post /2fa/recovery-codes',
      'get /users/accounts',
      'get /users/employees',
      'post /users/role'
    ]));
  });

  test('requires authentication for employee resources', async () => {
    const response = await request(app).get('/api/employees');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authorization token is required'
    });
  });

  test('requires authentication for the HR employee account directory', async () => {
    const response = await request(app).get('/api/auth/users/employees');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Authorization token is required');
  });

  test('requires authentication for the role-managed account directory', async () => {
    const response = await request(app).get('/api/auth/users/accounts');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Authorization token is required');
  });

  test('allows HR to load the accounts they can manage', async () => {
    const hrUser = {
      _id: 'hr-user-id',
      email: 'hr@example.com',
      role: 'hr',
      tokenVersion: 0
    };
    const accounts = [{ _id: 'employee-id', email: 'employee@example.com', role: 'employee' }];
    User.findById.mockResolvedValue(hrUser);
    AuthSession.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'hr-session-id' })
    });
    authService.listManagedAccounts.mockResolvedValue(accounts);
    const token = jwt.sign({
      sub: hrUser._id,
      tokenVersion: hrUser.tokenVersion,
      purpose: 'access',
      sid: 'hr-session-id'
    }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const response = await request(app)
      .get('/api/auth/users/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(accounts);
    expect(authService.listManagedAccounts).toHaveBeenCalledWith(hrUser);
  });

  test('requires authentication for role assignment', async () => {
    const response = await request(app)
      .post('/api/auth/users/role')
      .send({ email: 'employee@example.com', role: 'manager' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Authorization token is required');
  });

  test('allows an HR account to assign a permitted role', async () => {
    const hrUser = {
      _id: 'hr-user-id',
      email: 'hr@example.com',
      role: 'hr',
      tokenVersion: 0
    };
    User.findById.mockResolvedValue(hrUser);
    AuthSession.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'hr-session-id' })
    });
    authService.assignRole.mockResolvedValue({
      user: { email: 'employee@example.com', role: 'employee' },
      message: 'User role updated to employee'
    });
    const token = jwt.sign({
      sub: hrUser._id,
      tokenVersion: hrUser.tokenVersion,
      purpose: 'access',
      sid: 'hr-session-id'
    }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const response = await request(app)
      .post('/api/auth/users/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'employee@example.com', role: 'employee' });

    expect(response.status).toBe(200);
    expect(authService.assignRole).toHaveBeenCalledWith(
      hrUser,
      { email: 'employee@example.com', role: 'employee' }
    );
  });

  test('requires authentication for document resources', async () => {
    const response = await request(app).get('/api/documents');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authorization token is required'
    });
  });

  test('exposes update routes for leave and letter RBAC flows', () => {
    const leaveMethods = leaveRoutes.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods));

    const letterMethods = letterRoutes.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods));

    expect(leaveMethods).toContain('put');
    expect(letterMethods).toContain('put');
  });

  test('returns a standard not-found response', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Route not found: GET /api/does-not-exist');
  });
});