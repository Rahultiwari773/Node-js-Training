const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/userModel');
const AuthSession = require('../models/authSessionModel');
const { jwtSecret, allowedOrigins } = require('../config/env');

let realtimeServer;
const onlineUsers = new Map();
const monitorRoles = new Set(['super_admin', 'admin', 'hr_manager', 'hr']);
const activitySummaries = {
  employees: { created: 'Employee record created', updated: 'Employee record updated', deleted: 'Employee record deleted', fileUploaded: 'Employee file uploaded', fileDeleted: 'Employee file deleted' },
  salaries: { created: 'Salary record created', updated: 'Salary record updated', deleted: 'Salary record deleted' },
  leaves: { created: 'Leave request submitted', updated: 'Leave request updated', approved: 'Leave request approved', rejected: 'Leave request rejected', deleted: 'Leave request deleted' },
  letters: { created: 'Employee letter created', updated: 'Employee letter updated', generated: 'Employee letter generated', deleted: 'Employee letter deleted' },
  announcements: { created: 'Announcement created', updated: 'Announcement updated', deleted: 'Announcement deleted' },
  policies: { created: 'Policy created', updated: 'Policy updated', deleted: 'Policy deleted' },
  documents: { created: 'Document uploaded', updated: 'Document updated', ocr: 'Document text processed', deleted: 'Document deleted' },
  accounts: { registered: 'Employee account registered', login: 'Employee account signed in', roleChanged: 'User role updated' }
};

const emitPresenceCount = () => {
  if (realtimeServer) {
    realtimeServer.emit('presence:count', { count: onlineUsers.size });
  }
};

const attachRealtimeServer = (httpServer) => {
  realtimeServer = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  realtimeServer.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const payload = jwt.verify(token, jwtSecret);
      if (payload.purpose !== 'access' || !payload.sid) {
        return next(new Error('Invalid or expired authorization token'));
      }

      const user = await User.findById(payload.sub);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        return next(new Error('Invalid or expired authorization token'));
      }

      const session = await AuthSession.findOne({
        _id: payload.sid,
        userId: user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
      }).select('_id');
      if (!session) return next(new Error('Session is invalid or expired'));

      socket.data.userId = user._id.toString();
      socket.data.role = user.role;
      socket.data.tokenExpiresAt = payload.exp * 1000;
      next();
    } catch (error) {
      next(new Error('Invalid or expired authorization token'));
    }
  });

  realtimeServer.on('connection', (socket) => {
    const userId = socket.data.userId;
    const userSockets = onlineUsers.get(userId) || new Set();
    const tokenExpiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.tokenExpiresAt - Date.now())
    );
    userSockets.add(socket.id);
    onlineUsers.set(userId, userSockets);
    if (monitorRoles.has(socket.data.role)) socket.join('hrms:monitor');
    emitPresenceCount();

    socket.on('disconnect', () => {
      clearTimeout(tokenExpiryTimer);
      const activeSockets = onlineUsers.get(userId);
      if (!activeSockets) return;

      activeSockets.delete(socket.id);
      if (activeSockets.size === 0) onlineUsers.delete(userId);
      emitPresenceCount();
    });
  });

  return realtimeServer;
};

const emitAnnouncementEvent = (eventName, payload) => {
  if (realtimeServer) realtimeServer.emit(eventName, payload);
};

const emitHrmsActivity = (moduleName, action, actor) => {
  const summary = activitySummaries[moduleName]?.[action];
  if (!summary || !realtimeServer) return;

  realtimeServer.to('hrms:monitor').emit('hrms:activity', {
    module: moduleName,
    action,
    summary,
    performedBy: String(actor?.name || 'System').slice(0, 80),
    actorRole: String(actor?.role || 'system').slice(0, 24),
    occurredAt: new Date().toISOString()
  });
};

module.exports = { attachRealtimeServer, emitAnnouncementEvent, emitHrmsActivity };