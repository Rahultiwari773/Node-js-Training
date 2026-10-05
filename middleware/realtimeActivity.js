const { emitHrmsActivity } = require('../realtime/socketServer');

const getActivity = (req) => {
  const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
  const segments = pathname.split('/').filter(Boolean).slice(1);
  const [root, , third, fourth] = segments;
  const method = req.method.toUpperCase();

  if (root === 'auth') {
    if (segments[1] === 'register' && method === 'POST') return ['accounts', 'registered'];
    if (segments[1] === 'login' && method === 'POST' && req.realtimeActor) return ['accounts', 'login'];
    if (segments[1] === 'users' && segments[2] === 'role' && method === 'POST') return ['accounts', 'roleChanged'];
    return null;
  }

  const modules = {
    employees: 'employees',
    salaries: 'salaries',
    leaves: 'leaves',
    letters: 'letters',
    announcements: 'announcements',
    policies: 'policies',
    documents: 'documents'
  };
  const moduleName = modules[root];
  if (!moduleName) return null;

  if (moduleName === 'employees' && third === 'files') {
    if (method === 'POST') return [moduleName, 'fileUploaded'];
    if (method === 'DELETE') return [moduleName, 'fileDeleted'];
  }
  if (moduleName === 'leaves' && third === 'approve' && method === 'PATCH') return [moduleName, 'approved'];
  if (moduleName === 'leaves' && third === 'reject' && method === 'PATCH') return [moduleName, 'rejected'];
  if (moduleName === 'documents' && third === 'ocr' && method === 'POST') return [moduleName, 'ocr'];
  if (method === 'POST') return [moduleName, 'created'];
  if (method === 'PUT' || method === 'PATCH') return [moduleName, 'updated'];
  if (method === 'DELETE') return [moduleName, 'deleted'];
  return null;
};

const realtimeActivity = (req, res, next) => {
  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const activity = getActivity(req);
    if (!activity) return;

    const actor = req.user || req.realtimeActor;
    emitHrmsActivity(activity[0], activity[1], actor);
  });

  next();
};

module.exports = realtimeActivity;