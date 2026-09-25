process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.CORS_ORIGINS = 'http://localhost:5173';

jest.mock('../services/authService', () => ({
  register: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  login: jest.fn(),
  forgotPassword: jest.fn(),
  resetPasswordPage: jest.fn(),
  resetPassword: jest.fn(),
  getProfile: jest.fn(),
  assignRole: jest.fn(),
  logout: jest.fn()
}));

const request = require('supertest');
const app = require('../app');
const authService = require('../services/authService');
const leaveRoutes = require('../routes/leaveRoutes');
const letterRoutes = require('../routes/letterRoutes');

describe('API security and validation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the React application from the root route', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<!doctype html>');
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
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'email', location: 'body' }),
      expect.objectContaining({ field: 'password', location: 'body' })
    ]));
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('accepts a valid login and returns the service response', async () => {
    authService.login.mockResolvedValue({
      token: 'test-access-token',
      expiresIn: '1d',
      user: { id: 'user-id', email: 'user@example.com', role: 'employee' }
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        token: 'test-access-token',
        expiresIn: '1d',
        user: { id: 'user-id', email: 'user@example.com', role: 'employee' }
      }
    });
    expect(authService.login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Password123'
    });
  });

  test('requires authentication for employee resources', async () => {
    const response = await request(app).get('/api/employees');

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