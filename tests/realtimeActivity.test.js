jest.mock('../realtime/socketServer', () => ({
  emitHrmsActivity: jest.fn()
}));

const { emitHrmsActivity } = require('../realtime/socketServer');
const realtimeActivity = require('../middleware/realtimeActivity');

const runMiddleware = (request, statusCode) => {
  const response = {
    statusCode,
    once: jest.fn()
  };
  const next = jest.fn();

  realtimeActivity(request, response, next);
  response.once.mock.calls[0][1]();

  return next;
};

describe('realtime HRMS activity middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('emits a sanitized activity after a successful module mutation', () => {
    const request = {
      originalUrl: '/api/leaves/507f1f77bcf86cd799439011/approve',
      method: 'PATCH',
      user: { name: 'HR Reviewer', role: 'hr', email: 'private@example.com' }
    };

    expect(runMiddleware(request, 200)).toHaveBeenCalled();
    expect(emitHrmsActivity).toHaveBeenCalledWith('leaves', 'approved', request.user);
  });

  test('does not emit failed requests', () => {
    const request = {
      originalUrl: '/api/employees',
      method: 'POST',
      user: { name: 'HR Reviewer', role: 'hr' }
    };

    runMiddleware(request, 400);

    expect(emitHrmsActivity).not.toHaveBeenCalled();
  });

  test('records a completed login but ignores an MFA challenge', () => {
    const actor = { name: 'Employee User', role: 'employee' };
    const loginRequest = {
      originalUrl: '/api/auth/login',
      method: 'POST',
      realtimeActor: actor
    };
    const challengeRequest = {
      originalUrl: '/api/auth/login',
      method: 'POST'
    };

    runMiddleware(loginRequest, 200);
    expect(emitHrmsActivity).toHaveBeenCalledWith('accounts', 'login', actor);

    emitHrmsActivity.mockClear();
    runMiddleware(challengeRequest, 200);
    expect(emitHrmsActivity).not.toHaveBeenCalled();
  });
});
