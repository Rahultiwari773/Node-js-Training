process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/employee_crud_test';
process.env.JWT_SECRET = 'socket-test-secret-that-is-long-enough';

jest.mock('../models/userModel', () => ({ findById: jest.fn() }));
jest.mock('../models/authSessionModel', () => ({ findOne: jest.fn() }));

const http = require('http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const {
  attachRealtimeServer,
  emitAnnouncementEvent,
  emitHrmsActivity
} = require('../realtime/socketServer');

const connectedSockets = [];
let server;
let realtimeServer;
let serverUrl;

const createAccessToken = (userId = 'user-1') => jwt.sign({
  sub: userId,
  tokenVersion: 1,
  purpose: 'access',
  sid: 'session-1'
}, process.env.JWT_SECRET, { expiresIn: '5m' });

const createSocket = (token) => {
  const socket = createClient(serverUrl, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false
  });
  connectedSockets.push(socket);
  return socket;
};

const waitForEvent = (socket, eventName, predicate = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`Timed out waiting for ${eventName}`));
  }, 5000);
  const cleanup = () => {
    clearTimeout(timeout);
    socket.off(eventName, handleEvent);
    socket.off('connect_error', handleError);
  };
  const handleEvent = (payload) => {
    if (!predicate(payload)) return;
    cleanup();
    resolve(payload);
  };
  const handleError = (error) => {
    cleanup();
    reject(error);
  };

  socket.on(eventName, handleEvent);
  socket.once('connect_error', handleError);
});

beforeAll(async () => {
  server = http.createServer();
  realtimeServer = attachRealtimeServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  User.findById.mockImplementation(async (id) => ({
    _id: { toString: () => id },
    role: id === 'hr-user' ? 'hr' : 'employee',
    tokenVersion: 1
  }));
  AuthSession.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: 'session-1' })
  });
});

afterEach(() => {
  connectedSockets.splice(0).forEach((socket) => socket.disconnect());
});

afterAll(async () => {
  await new Promise((resolve) => realtimeServer.close(resolve));
});

describe('authenticated realtime server', () => {
  test('tracks distinct online accounts and broadcasts announcement updates', async () => {
    const token = createAccessToken();
    const firstSocket = createSocket(token);
    const firstConnected = waitForEvent(firstSocket, 'connect');
    const firstCount = waitForEvent(firstSocket, 'presence:count', ({ count }) => count === 1);

    await firstConnected;
    await firstCount;

    const secondSocket = createSocket(token);
    const secondConnected = waitForEvent(secondSocket, 'connect');
    const secondCount = waitForEvent(secondSocket, 'presence:count', ({ count }) => count === 1);

    await secondConnected;
    await secondCount;

    const announcementEvent = waitForEvent(firstSocket, 'announcement:upsert');
    const announcement = { _id: 'announcement-1', title: 'Live update' };
    emitAnnouncementEvent('announcement:upsert', { announcement });

    await expect(announcementEvent).resolves.toEqual({ announcement });
  });

  test('rejects sockets without a valid access token', async () => {
    const socket = createSocket('invalid-token');

    await expect(waitForEvent(socket, 'connect')).rejects.toThrow('Invalid or expired authorization token');
  });

  test('delivers HR activity only to monitor-role sockets', async () => {
    const hrSocket = createSocket(createAccessToken('hr-user'));
    const employeeSocket = createSocket(createAccessToken('employee-user'));
    const hrConnected = waitForEvent(hrSocket, 'connect');
    const employeeConnected = waitForEvent(employeeSocket, 'connect');

    await Promise.all([hrConnected, employeeConnected]);

    const activity = waitForEvent(hrSocket, 'hrms:activity');
    let employeeReceivedActivity = false;
    employeeSocket.once('hrms:activity', () => { employeeReceivedActivity = true; });
    emitHrmsActivity('employees', 'created');

    await expect(activity).resolves.toMatchObject({
      module: 'employees',
      action: 'created',
      summary: 'Employee record created'
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(employeeReceivedActivity).toBe(false);
  });
});
