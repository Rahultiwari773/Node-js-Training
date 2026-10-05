import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

let activeAccessToken = '';
let refreshInFlight = null;

const refreshAccessToken = () => {
  if (!refreshInFlight) {
    const performRefresh = async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });
      const payload = await response.json();
      if (!response.ok || !payload.data?.accessToken) {
        throw new Error(payload.message || 'Your session has expired. Please sign in again.');
      }
      activeAccessToken = payload.data.accessToken;
      return activeAccessToken;
    };
    const refreshRequest = typeof navigator !== 'undefined' && navigator.locks?.request
      ? navigator.locks.request('employeePortalRefresh', performRefresh)
      : performRefresh();
    refreshInFlight = refreshRequest.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(value || 0);

const formatBytes = (value) => `${(value / 1024).toFixed(1)} KB`;

const apiRequest = async (path, token, options = {}, retryAfterRefresh = true) => {
  const { responseType, ...fetchOptions } = options;
  const headers = { ...(options.headers || {}) };
  const requestToken = activeAccessToken || token;
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
  const response = await fetch(path, { ...fetchOptions, headers, credentials: 'include' });
  if (response.status === 401 && requestToken && retryAfterRefresh && path !== '/api/auth/refresh') {
    try {
      const freshToken = await refreshAccessToken();
      return await apiRequest(path, freshToken, options, false);
    } catch (refreshError) {
      activeAccessToken = '';
      window.dispatchEvent(new Event('auth:expired'));
      throw refreshError;
    }
  }
  if (response.ok && responseType === 'blob') return response.blob();
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed');
    error.payload = payload;
    error.status = response.status;
    throw error;
  }

  return payload.data === undefined ? payload : payload.data;
};

function AuthScreen({ onLogin, response, error, initialMode = 'login', onModeChange }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', token: '', twoFactorCode: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = hashParams.get('token') || params.get('token') || '';
    if (token) setForm((current) => ({ ...current, token }));
    if (hashParams.has('token') || params.has('token')) {
      params.delete('token');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
  }, []);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setTwoFactorRequired(false);
    setNotice('');
    setLocalError('');
    onModeChange(nextMode);
  };

  const request = async (path, body) => {
    const result = await apiRequest(path, '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return result;
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setLocalError('');

    try {
      if (mode === 'login') {
        const result = await onLogin({
          email: form.email,
          password: form.password,
          ...(twoFactorRequired ? { twoFactorCode: form.twoFactorCode } : {})
        });
        if (result?.requiresTwoFactor) {
          setTwoFactorRequired(true);
          setNotice('Enter your authenticator code or a recovery code to continue.');
        } else {
          setTwoFactorRequired(false);
        }
      } else if (mode === 'register') {
        const result = await request('/api/auth/register', { name: form.name, email: form.email, password: form.password });
        setNotice(result.message || 'Registration successful. Check your email to verify your account.');
        setMode('login');
        onModeChange('login');
      } else if (mode === 'forgot') {
        const result = await request('/api/auth/forgot-password', { email: form.email });
        setNotice(result.message || 'If the account exists, a password reset email was sent.');
      } else if (mode === 'reset') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        const result = await request('/api/auth/reset-password', { token: form.token, password: form.password });
        setNotice(result.message || 'Password reset successfully. Please log in again.');
        setMode('login');
        onModeChange('login');
      } else if (mode === 'verify') {
        const result = await request('/api/auth/verify-email', { token: form.token });
        setNotice(result.message || 'Email verified successfully. You can now log in.');
        setMode('login');
        onModeChange('login');
      }
    } catch (requestError) {
      setLocalError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setBusy(true);
    setNotice('');
    setLocalError('');
    try {
      const result = await request('/api/auth/resend-verification', { email: form.email });
      setNotice(result.message || 'Verification email requested.');
    } catch (requestError) {
      setLocalError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const title = { login: 'Open a session', register: 'Create your account', forgot: 'Recover your password', reset: 'Set a new password', verify: 'Verify your email' }[mode];
  const message = localError || error?.message;

  return (
    <section className="login-layout">
      <div className="intro">
        <p className="eyebrow">A practical window into your API</p>
        <h1>Check every role.<br /><em>See what it can access.</em></h1>
        <p className="intro-copy">Create an account, verify your email, and sign in to exercise the live HRMS role permissions.</p>
        <div className="endpoint-note"><span>BASE URL</span><code>/api</code></div>
      </div>
      <form className="panel login-card" onSubmit={submit}>
        <div className="panel-kicker">Authentication</div>
        <h2>{title}</h2>
        {mode === 'login' && <AuthTabs active={mode} onChange={changeMode} />}
        {mode === 'register' && <Field label="Full name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />}
        {mode !== 'reset' && <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required /></label>}
        {mode === 'reset' && <label>Reset token<input value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} placeholder="Paste the token from your email" required /></label>}
        {mode === 'verify' && <label>Verification token<input value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} placeholder="Paste the token from your email" required /></label>}
        {['login', 'register', 'reset'].includes(mode) && <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" minLength="8" required /></label>}
        {mode === 'reset' && <label>Confirm password<input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Repeat your new password" minLength="8" required /></label>}
        {twoFactorRequired && <label>Authenticator or recovery code<input type="text" inputMode="numeric" autoComplete="one-time-code" value={form.twoFactorCode} onChange={(event) => setForm({ ...form, twoFactorCode: event.target.value })} required /></label>}
        <button className="primary-button" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? twoFactorRequired ? 'Verify and sign in' : 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset email' : mode === 'reset' ? 'Reset password' : 'Verify email'} <span>↗</span></button>
        {message && <p className="form-message">{message}</p>}
        {notice && <p className="form-message success-message">{notice}</p>}
        <div className="auth-links">
          {mode === 'login' && <>{twoFactorRequired && <button type="button" onClick={() => { setTwoFactorRequired(false); setForm({ ...form, twoFactorCode: '' }); }}>Back to password</button>}<button type="button" onClick={() => changeMode('register')}>Create account</button><button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button><button type="button" onClick={() => changeMode('verify')}>Verify email</button></>}
          {mode === 'register' && <><button type="button" onClick={() => changeMode('login')}>Back to sign in</button><button type="button" onClick={resendVerification} disabled={busy}>Resend verification</button></>}
          {mode === 'forgot' && <button type="button" onClick={() => changeMode('login')}>Back to sign in</button>}
          {mode === 'reset' && <button type="button" onClick={() => changeMode('login')}>Back to sign in</button>}
          {mode === 'verify' && <><button type="button" onClick={resendVerification} disabled={busy}>Resend verification</button><button type="button" onClick={() => changeMode('login')}>Back to sign in</button></>}
        </div>
        <ResponseBlock payload={response} />
      </form>
    </section>
  );
}

function AuthTabs({ active, onChange }) {
  return <div className="auth-tabs"><button type="button" className={active === 'login' ? 'active' : ''} onClick={() => onChange('login')}>Sign in</button><button type="button" className={active === 'register' ? 'active' : ''} onClick={() => onChange('register')}>Register</button></div>;
}

function ResponseBlock({ payload, requestInfo }) {
  return <><div className="response-meta">{requestInfo ? `${requestInfo.method} ${requestInfo.path} · ${requestInfo.status}` : 'No request yet'}</div><pre className="response-output">{payload ? JSON.stringify(payload, null, 2) : 'No request yet.'}</pre></>;
}

function Dashboard({ user, token, onLogout, onUserUpdated, initialResponse }) {
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [letters, setLetters] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [employeeAccounts, setEmployeeAccounts] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [response, setResponse] = useState(initialResponse || null);
  const [responseInfo, setResponseInfo] = useState(null);
  const [screen, setScreen] = useState('overview');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [onlineCount, setOnlineCount] = useState(0);
  const [realtimeNotice, setRealtimeNotice] = useState('');
  const [activities, setActivities] = useState([]);

  const request = async (path, options = {}) => {
    const requestInfo = {
      method: (options.method || 'GET').toUpperCase(),
      path,
      status: 'pending'
    };
    setResponseInfo(requestInfo);

    try {
      const result = await apiRequest(path, token, options);
      if (options.responseType !== 'blob') setResponse(result);
      setResponseInfo({ ...requestInfo, status: 'success' });
      setError('');
      return result;
    } catch (requestError) {
      setResponse(requestError.payload || { message: requestError.message });
      setResponseInfo({ ...requestInfo, status: requestError.status || 'network error' });
      setError(requestError.message);
      throw requestError;
    }
  };

  const loadFiles = async (employeeId) => {
    if (!employeeId) return;
    const result = await request(`/api/employees/${employeeId}/files`);
    setFiles(result);
  };

  const loadLeaves = async () => {
    const result = await request('/api/leaves');
    setLeaves(Array.isArray(result) ? result : []);
  };

  const loadLetters = async () => {
    const result = await request('/api/letters');
    setLetters(Array.isArray(result) ? result : []);
  };

  const loadAnnouncements = async () => {
    const result = await request('/api/announcements');
    setAnnouncements(Array.isArray(result) ? result : []);
  };

  const loadPolicies = async () => {
    const result = await request('/api/policies');
    setPolicies(Array.isArray(result) ? result : []);
  };

  const loadDocuments = async () => {
    const result = await request('/api/documents?page=1&limit=50');
    setDocuments(Array.isArray(result) ? result : []);
  };

  const loadEmployeeAccounts = async () => {
    const result = await request('/api/auth/users/accounts');
    setEmployeeAccounts(Array.isArray(result) ? result : []);
  };

  const loadEmployees = async () => {
    const result = await request('/api/employees');
    setEmployees(Array.isArray(result) ? result : []);
  };

  const loadSalaries = async () => {
    const result = await request('/api/salaries');
    setSalaries(Array.isArray(result) ? result : []);
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const [employeeResult] = await Promise.all([loadEmployees(), loadSalaries()]);

      const nextEmployee = selectedEmployee || employeeResult?.[0]?._id || '';
      setSelectedEmployee(nextEmployee);
      if (nextEmployee) await loadFiles(nextEmployee);

      await Promise.all([
        loadLeaves(),
        loadLetters(),
        loadAnnouncements(),
        loadPolicies(),
        loadDocuments(),
        ...(['admin', 'hr', 'hr_manager', 'super_admin'].includes(user.role)
          ? [loadEmployeeAccounts()]
          : [])
      ]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh().catch(() => {}); }, [token]);

  useEffect(() => {
    const socket = io('/', { auth: { token: activeAccessToken || token } });
    setRealtimeStatus('connecting');

    socket.on('connect', () => setRealtimeStatus('online'));
    const renewSocketSession = async () => {
      try {
        const freshToken = await refreshAccessToken();
        socket.auth = { token: freshToken };
        socket.connect();
      } catch {
        window.dispatchEvent(new Event('auth:expired'));
      }
    };

    socket.on('disconnect', (reason) => {
      setRealtimeStatus('offline');
      if (reason === 'io server disconnect') renewSocketSession();
    });
    socket.on('connect_error', (connectionError) => {
      setRealtimeStatus('offline');
      if (connectionError.message.includes('authorization token')
        || connectionError.message.includes('Session is invalid')) {
        renewSocketSession();
      }
    });
    socket.on('presence:count', ({ count }) => setOnlineCount(count));
    socket.on('announcement:upsert', ({ announcement }) => {
      if (!announcement) return;
      setAnnouncements((current) => [
        announcement,
        ...current.filter((item) => String(item._id) !== String(announcement._id))
      ]);
      setRealtimeNotice(`Announcement published: ${announcement.title}`);
    });
    socket.on('announcement:remove', ({ id, title }) => {
      setAnnouncements((current) => current.filter((item) => String(item._id) !== String(id)));
      setRealtimeNotice(`Announcement removed: ${title}`);
    });
    socket.on('hrms:activity', (activity) => {
      setActivities((current) => [activity, ...current].slice(0, 40));
      setRealtimeNotice(`${activity.summary} by ${activity.performedBy}`);

      const refreshers = {
        employees: loadEmployees,
        salaries: loadSalaries,
        leaves: loadLeaves,
        letters: loadLetters,
        announcements: loadAnnouncements,
        policies: loadPolicies,
        documents: loadDocuments,
        accounts: loadEmployeeAccounts
      };
      refreshers[activity.module]?.().catch(() => {});
    });

    return () => socket.disconnect();
  }, [token]);

  const upload = async (event) => {
    event.preventDefault();
    if (!selectedEmployee || !file) return;
    setBusy(true);
    setMessage('Uploading...');
    const body = new FormData();
    body.append('file', file);
    try {
      await request(`/api/employees/${selectedEmployee}/files`, { method: 'POST', body });
      setMessage('File uploaded successfully.');
      setFile(null);
      event.target.reset();
      await loadFiles(selectedEmployee);
    } catch (uploadError) {
      setMessage(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const canWrite = ['admin', 'hr', 'hr_manager', 'super_admin'].includes(user.role);
  const canManageHR = ['admin', 'hr', 'hr_manager', 'super_admin'].includes(user.role);
  const navigation = [
    ['overview', 'Overview'],
    ...(canManageHR ? [['monitor', 'Live monitor']] : []),
    ['security', 'Security'],
    ['employees', 'Employees'],
    ...(canManageHR ? [['employee-accounts', 'Employee accounts']] : []),
    ['salaries', 'Salaries'],
    ['files', 'File center'],
    ['documents', 'Documents'],
    ['leaves', 'Leaves'],
    ['letters', 'Letters'],
    ['announcements', 'Announcements'],
    ['policies', 'Policies'],
    ...(canManageHR ? [['access', 'Access control']] : [])
  ];

  return (
    <section className="workspace">
      <div className="workspace-head"><div><p className="eyebrow">Live API workspace</p><h1>Good morning, {user.name ? user.name.split(' ')[0] : 'User'}</h1>{announcements[0] && <button type="button" className="quiet-button header-announcement" style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 620, marginTop: 18, padding: '10px 12px', textAlign: 'left' }} onClick={() => setScreen('announcements')}><span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, flex: '0 0 24px', background: 'var(--lime)', color: 'var(--green)', fontWeight: 700 }}>!</span><span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{announcements[0].title}</strong><small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 11 }}>{announcements[0].description}</small></span><b style={{ marginLeft: 'auto', color: 'var(--green)', font: '10px var(--mono)', textTransform: 'uppercase' }}>View</b></button>}</div><div className="workspace-actions"><span className="realtime-indicator"><span className={`status-dot ${realtimeStatus === 'online' ? 'live' : ''}`} />Realtime {realtimeStatus} · {onlineCount} online</span><button className="quiet-button" onClick={onLogout}>Sign out</button></div></div>
      {realtimeNotice && <div className="realtime-notice" role="status"><span className="panel-kicker">Live notification</span><strong>{realtimeNotice}</strong><button type="button" className="quiet-button" onClick={() => { setScreen('announcements'); setRealtimeNotice(''); }}>Open announcements</button><button type="button" className="notice-dismiss" aria-label="Dismiss notification" onClick={() => setRealtimeNotice('')}>×</button></div>}
      <div className="app-layout">
        <nav className="sidebar panel">{navigation.map(([key, label]) => <button key={key} className={`nav-item ${screen === key ? 'active' : ''}`} onClick={() => setScreen(key)}><span>{label}</span><small>{key === 'overview' ? '01' : key === 'employees' ? '02' : key === 'salaries' ? '03' : key === 'files' ? '04' : key === 'leaves' ? '05' : key === 'letters' ? '06' : key === 'announcements' ? '07' : key === 'policies' ? '08' : '09'}</small></button>)}<div className="sidebar-footer"><span className="status-dot live" />{user.role} access</div></nav>
        <div className="screen-area">
          <div className="summary-grid"><article className="summary-card accent-lime"><span>Signed-in role</span><strong>{user.role}</strong><small>{user.email}</small></article><article className="summary-card"><span>Employees visible</span><strong>{employees.length}</strong><small>GET /api/employees</small></article><article className="summary-card"><span>HR modules</span><strong>{leaves.length + letters.length + announcements.length + policies.length}</strong><small>RBAC actions</small></article></div>
          {screen === 'overview' && <Overview employees={employees} salaries={salaries} onRefresh={refresh} busy={busy} activities={activities} realtimeStatus={realtimeStatus} onlineCount={onlineCount} />}
          {screen === 'monitor' && canManageHR && <LiveMonitor activities={activities} realtimeStatus={realtimeStatus} onlineCount={onlineCount} />}
          {screen === 'security' && <SecurityScreen user={user} request={request} onUserUpdated={onUserUpdated} />}
          {screen === 'employees' && <EmployeeScreen employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'employee-accounts' && canManageHR && <EmployeeAccountsScreen accounts={employeeAccounts} request={request} actorRole={user.role} actorEmail={user.email} onAccountsUpdated={setEmployeeAccounts} />}
          {screen === 'salaries' && <SalaryScreen salaries={salaries} employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'files' && <FileScreen employees={employees} selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} files={files} file={file} setFile={setFile} upload={upload} loadFiles={loadFiles} busy={busy} message={message} error={error} />}
          {screen === 'documents' && <><DocumentScreen documents={documents} setDocuments={setDocuments} employees={employees} user={user} request={request} refresh={loadDocuments} /><DocumentOcrPanel documents={documents} request={request} refresh={loadDocuments} /></>}
          {screen === 'leaves' && <LeaveScreen leaves={leaves} userRole={user.role} request={request} refresh={loadLeaves} />}
          {screen === 'letters' && <LetterScreen letters={letters} userRole={user.role} employees={employees} request={request} refresh={loadLetters} />}
          {screen === 'announcements' && <AnnouncementScreen announcements={announcements} userRole={user.role} request={request} refresh={loadAnnouncements} />}
          {screen === 'policies' && <PolicyScreen policies={policies} userRole={user.role} request={request} refresh={loadPolicies} />}
          {screen === 'access' && canManageHR && <AccessScreen request={request} actorRole={user.role} />}
          <section className="panel response-panel"><div className="panel-heading"><div><div className="panel-kicker">Last response</div><h2>API output</h2></div><button className="icon-button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(response, null, 2))}>□</button></div><ResponseBlock payload={response} requestInfo={responseInfo} /></section>
        </div>
      </div>
    </section>
  );
}

function SecurityScreen({ user, request, onUserUpdated }) {
  const [sessions, setSessions] = useState([]);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled);

  const loadSessions = async () => {
    const result = await request('/api/auth/sessions');
    setSessions(result.sessions || []);
  };

  useEffect(() => {
    loadSessions().catch((requestError) => setError(requestError.message));
  }, []);

  const runAction = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const beginSetup = () => runAction(async () => {
    setSetup(await request('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }));
  });

  const enableTwoFactor = () => runAction(async () => {
    const result = await request('/api/auth/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    setRecoveryCodes(result.recoveryCodes || []);
    setSetup(null);
    setCode('');
    setNotice(result.message);
    setTwoFactorEnabled(true);
    onUserUpdated({ ...user, twoFactorEnabled: true });
  });

  const disableTwoFactor = () => runAction(async () => {
    const result = await request('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password })
    });
    setNotice(result.message);
    setTwoFactorEnabled(false);
    window.dispatchEvent(new Event('auth:expired'));
  });

  const renewRecoveryCodes = () => runAction(async () => {
    const result = await request('/api/auth/2fa/recovery-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    setRecoveryCodes(result.recoveryCodes || []);
    setCode('');
    setNotice('New recovery codes generated. Previous codes are no longer valid.');
  });

  const revokeSession = (session) => runAction(async () => {
    await request(`/api/auth/sessions/${session.id}`, { method: 'DELETE' });
    if (session.current) {
      window.dispatchEvent(new Event('auth:expired'));
      return;
    }
    setNotice('Device session revoked.');
    await loadSessions();
  });

  const revokeAll = () => runAction(async () => {
    await request('/api/auth/logout-all', { method: 'POST' });
    window.dispatchEvent(new Event('auth:expired'));
  });

  return <div className="security-layout">
    <section className="panel form-panel security-panel">
      <div className="panel-kicker">Sign-in protection</div>
      <h2>Authenticator app</h2>
      <p className="muted">{twoFactorEnabled ? 'Two-factor authentication is enabled for this account.' : 'Add a time-based authenticator code to your password sign-in.'}</p>
      {!twoFactorEnabled && <label>Current password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>}
      {!twoFactorEnabled && !setup && <button type="button" className="small-button" onClick={beginSetup} disabled={busy || !password}>Set up authenticator</button>}
      {setup && <div className="totp-enrollment">
        <img src={setup.qrCode} alt="Authenticator setup QR code" />
        <p>Scan this QR code in your authenticator app, or enter this secret manually:</p>
        <code>{setup.secret}</code>
        <label>Authenticator code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" /></label>
        <button type="button" className="small-button" onClick={enableTwoFactor} disabled={busy || code.length < 6}>Confirm and enable</button>
      </div>}
      {twoFactorEnabled && <>
        <label>Authenticator or recovery code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" /></label>
        <label>Current password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        <div className="inline-actions">
          <button type="button" className="small-button" onClick={renewRecoveryCodes} disabled={busy || code.length < 6}>Regenerate recovery codes</button>
          <button type="button" className="small-button danger" onClick={disableTwoFactor} disabled={busy || !password || code.length < 6}>Disable 2FA</button>
        </div>
      </>}
      {recoveryCodes.length > 0 && <div className="recovery-codes"><strong>Save these recovery codes now</strong><pre>{recoveryCodes.join('\n')}</pre><small>Each code works once. They will not be shown again.</small></div>}
      {notice && <p className="form-message success-message">{notice}</p>}
      {error && <p className="form-message">{error}</p>}
    </section>
    <section className="panel data-panel security-panel">
      <div className="panel-heading"><div><div className="panel-kicker">Active devices</div><h2>Sessions</h2></div><button type="button" className="small-button danger" onClick={revokeAll} disabled={busy}>Sign out all devices</button></div>
      <div className="resource-view module-list">
        {sessions.length ? sessions.map((session) => <div className="record" key={session.id}>
          <div><strong>{session.deviceName}</strong><br /><span>{session.ipAddress || 'IP unavailable'} · Last active {new Date(session.lastUsedAt).toLocaleString()}</span></div>
          <span className="record-badge">{session.current ? 'Current device' : 'Active'}</span>
          <small>Expires {new Date(session.expiresAt).toLocaleString()}</small>
          <div className="inline-actions"><button type="button" className="small-button danger" onClick={() => revokeSession(session)} disabled={busy}>Revoke device</button></div>
        </div>) : <p className="empty-state">No active sessions found.</p>}
      </div>
    </section>
  </div>;
}

function DocumentOcrPanel({ documents, request, refresh }) {
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const selected = documents.find((document) => (document._id || document.id) === selectedId) || documents[0];
  const fieldEntries = Object.entries(selected?.ocrFields || {})
    .filter(([key]) => key !== 'needsReview')
    .flatMap(([key, value]) => key === 'additionalDetails' && Array.isArray(value)
      ? value.map((detail, index) => [`additional-${index}`, detail.label, detail.value])
      : [[key, key.replace(/([A-Z])/g, ' $1'), value]]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const openPreview = async () => {
    if (!selected) return;
    setBusy(true);
    setPreviewError('');
    try {
      const blob = await request(`/api/documents/${selected._id || selected.id}/preview`, { responseType: 'blob' });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const closePreview = () => setPreviewUrl('');

  const runOcr = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await request(`/api/documents/${selected._id || selected.id}/ocr`, { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <>
    <section className="panel ocr-panel">
      <div className="panel-heading">
        <div><div className="panel-kicker">OCR extraction</div><h2>Document details</h2></div>
        {selected && <span className="count-label">{selected.ocrStatus || 'pending'}</span>}
      </div>
      {selected ? <>
        <label>Document<select value={selectedId || selected._id} onChange={(event) => setSelectedId(event.target.value)}>{documents.map((document) => <option key={document._id} value={document._id}>{document.documentType} · {document.originalFileName}</option>)}</select></label>
        <div className="ocr-meta">
          <span>Confidence <strong>{selected.ocrConfidence === null || selected.ocrConfidence === undefined ? '—' : `${Number(selected.ocrConfidence).toFixed(1)}%`}</strong></span>
          <span>Processed <strong>{selected.ocrProcessedAt ? new Date(selected.ocrProcessedAt).toLocaleString() : 'Not yet'}</strong></span>
        </div>
        {selected.ocrStatus === 'not_supported' && <p className="form-message">This PDF has no text layer. Image conversion is required for scanned PDF OCR.</p>}
        <div className="ocr-actions">
          <button type="button" className="small-button" onClick={openPreview} disabled={busy}>{busy ? 'Loading...' : 'Preview original'}</button>
          <button type="button" className="small-button" onClick={() => setShowDetails(true)}>View field details</button>
          <button type="button" className="small-button" onClick={runOcr} disabled={busy}>{busy ? 'Extracting...' : 'Run OCR again'}</button>
        </div>
        {previewError && <p className="form-message">{previewError}</p>}
        <pre className="ocr-text">{selected.ocrText || 'No extracted text available yet.'}</pre>
      </> : <p className="empty-state">Upload a document to view OCR details.</p>}
    </section>
    {showDetails && selected && <div className="document-modal-backdrop" role="presentation" onClick={() => setShowDetails(false)}>
      <section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="document-fields-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div><div className="panel-kicker">Verified before use</div><h2 id="document-fields-title">Extracted fields</h2></div>
          <button type="button" className="icon-button" onClick={() => setShowDetails(false)} aria-label="Close details">×</button>
        </div>
        <p className="muted">OCR values should be checked against the original document.</p>
        <div className="field-table">
          {fieldEntries.length ? fieldEntries.map(([key, label, value]) => <div className="field-row" key={key}>
            <span>{label}</span><strong>{value}</strong>
          </div>) : <p className="empty-state">No labeled fields were detected.</p>}
        </div>
        <details className="ocr-raw-details">
          <summary>Full OCR text</summary>
          <pre className="ocr-modal-text">{selected.ocrText || 'No OCR text available.'}</pre>
        </details>
      </section>
    </div>}
    {previewUrl && selected && <div className="document-modal-backdrop" role="presentation" onClick={closePreview}>
      <section className="document-modal document-preview-modal" role="dialog" aria-modal="true" aria-labelledby="document-preview-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div><div className="panel-kicker">Original upload</div><h2 id="document-preview-title">{selected.originalFileName}</h2></div>
          <button type="button" className="icon-button" onClick={closePreview} aria-label="Close preview">×</button>
        </div>
        <div className="document-preview-stage">
          {selected.mimeType === 'application/pdf'
            ? <iframe title={`Preview of ${selected.originalFileName}`} src={previewUrl} />
            : <img src={previewUrl} alt={`Preview of ${selected.originalFileName}`} />}
        </div>
      </section>
    </div>}
  </>;
}

function DocumentScreen({ documents, setDocuments, employees, user, request, refresh }) {
  const [form, setForm] = useState({ employeeId: '', documentType: 'Aadhar' });
  const [file, setFile] = useState(null);
  const [filters, setFilters] = useState({ documentType: '', status: '', search: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canUpload = ['super_admin', 'admin', 'hr_manager', 'hr', 'employee'].includes(user.role);
  const canDelete = canUpload;

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setNotice('Choose a PDF, JPG, JPEG, or PNG file.');
      return;
    }

    const body = new FormData();
    body.append('employeeId', form.employeeId);
    body.append('documentType', form.documentType);
    body.append('file', file);
    setBusy(true);
    try {
      await request('/api/documents/upload', { method: 'POST', body });
      setNotice('Document uploaded successfully.');
      setFile(null);
      event.target.reset();
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const applyFilters = async (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ page: '1', limit: '50' });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    setBusy(true);
    try {
      const result = await request(`/api/documents?${params.toString()}`);
      setDocuments(Array.isArray(result) ? result : []);
      setNotice('Document list refreshed.');
      return result;
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (id, status) => {
    setBusy(true);
    try {
      await request(`/api/documents/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      setNotice(`Document ${status}.`);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this document permanently?')) return;
    setBusy(true);
    try {
      await request(`/api/documents/${id}`, { method: 'DELETE' });
      setNotice('Document deleted successfully.');
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="screen-grid document-screen"><section className="panel data-panel"><div className="panel-heading"><div><div className="panel-kicker">Employee documents</div><h2>Document center</h2></div><span className="count-label">{documents.length} visible</span></div><form className="document-filters" onSubmit={applyFilters}><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search filename" /><select value={filters.documentType} onChange={(event) => setFilters({ ...filters, documentType: event.target.value })}><option value="">All types</option>{['Aadhar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}</select><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All status</option><option value="active">Active</option><option value="archived">Archived</option></select><button type="submit" className="small-button" disabled={busy}>Filter</button></form><div className="resource-view module-list">{documents.length ? documents.map((item) => <div className="record" key={item._id}><div><strong>{item.documentType}</strong><br /><span>{item.originalFileName}</span></div><span className="record-badge">{item.status}</span><small>{item.mimeType} · {(item.fileSize / 1024).toFixed(1)} KB · Employee {item.employeeId}</small><div className="inline-actions">{canDelete && <button type="button" className="small-button" disabled={busy} onClick={() => updateStatus(item._id, item.status === 'active' ? 'archived' : 'active')}>{item.status === 'active' ? 'Archive' : 'Restore'}</button>}{canDelete && <button type="button" className="small-button danger" disabled={busy} onClick={() => remove(item._id)}>Delete</button>}</div></div>) : <p className="empty-state">No documents available for this role or filter.</p>}</div><p className="form-message success-message">{notice}</p></section>{canUpload && <form className="panel form-panel" onSubmit={submit}><div className="panel-kicker">POST /api/documents/upload</div><h2>Upload document</h2><label>Employee<select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required><option value="">Choose employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.email}</option>)}</select></label><label>Document type<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}>{['Aadhar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="file-picker"><span className="upload-icon">↑</span><strong>{file?.name || 'Choose a document'}</strong><small>PDF, JPG, JPEG, PNG · max 5 MB</small><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files[0] || null)} required /></label><button className="primary-button" disabled={busy || !form.employeeId || !file}>{busy ? 'Uploading...' : 'Upload document'} <span>↑</span></button><p className="form-message success-message">{notice}</p></form>}</div>;
}

function LeaveScreen({ leaves, userRole, request, refresh }) {
  const [form, setForm] = useState({ leaveType: 'casual', startDate: '', endDate: '', reason: '' });
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await request('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setNotice('Leave request submitted.');
      setForm({ leaveType: 'casual', startDate: '', endDate: '', reason: '' });
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const handleAction = async (id, action) => {
    try {
      await request(`/api/leaves/${id}/${action}`, { method: 'PATCH' });
      setNotice(`${action} action completed.`);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const canApprove = ['super_admin', 'admin', 'hr_manager', 'manager', 'hr'].includes(userRole);
  const canCreate = ['super_admin', 'admin', 'hr_manager', 'manager', 'employee', 'hr'].includes(userRole);

  return (
    <div className="screen-grid">
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">HRMS</div>
            <h2>Leave requests</h2>
          </div>
          <span className="count-label">{leaves.length} records</span>
        </div>
        <div className="resource-view module-list">
          {leaves.length ? leaves.map((item) => (
            <div className="record" key={item._id || item.id}>
              <div>
                <strong>{item.leaveType}</strong><br />
                <span>{item.reason}</span>
              </div>
              <span className="record-badge">{item.status}</span>
              <small>{item.startDate} → {item.endDate}</small>
              {canApprove && item.status === 'pending' && (
                <div className="inline-actions">
                  <button type="button" className="small-button success" onClick={() => handleAction(item._id || item.id, 'approve')}>Approve</button>
                  <button type="button" className="small-button danger" onClick={() => handleAction(item._id || item.id, 'reject')}>Reject</button>
                </div>
              )}
            </div>
          )) : <p className="empty-state">No leave requests available.</p>}
        </div>
      </section>

      {canCreate && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-kicker">POST /api/leaves</div>
          <h2>Apply for leave</h2>
          <label>Leave type
            <select value={form.leaveType} onChange={(event) => setForm({ ...form, leaveType: event.target.value })}>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="earned">Earned</option>
              <option value="maternity">Maternity</option>
              <option value="paternity">Paternity</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} />
          <Field label="End date" type="date" value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} />
          <label>Reason
            <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Reason for leave" required />
          </label>
          <button className="primary-button">Submit leave request <span>↗</span></button>
          <p className="form-message success-message">{notice}</p>
        </form>
      )}
    </div>
  );
}

function LetterScreen({ letters, userRole, employees, request, refresh }) {
  const [form, setForm] = useState({ employeeId: '', letterType: 'experience', title: '', content: '' });
  const [notice, setNotice] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      const result = await request('/api/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setPreviewHtml(result?.content || '');
      setNotice('Letter created successfully.');
      setForm({ employeeId: '', letterType: 'experience', title: '', content: '' });
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const generate = async (id) => {
    try {
      const result = await request(`/api/letters/${id}/generate`, { method: 'POST' });
      setPreviewHtml(result?.content || '');
      setNotice('Letter generated.');
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const canCreate = ['super_admin', 'admin', 'hr_manager', 'hr'].includes(userRole);

  return (
    <div className="screen-grid">
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">HRMS</div>
            <h2>Letters</h2>
          </div>
          <span className="count-label">{letters.length} records</span>
        </div>
        <div className="resource-view module-list">
          {letters.length ? letters.map((item) => (
            <div className="record" key={item._id || item.id}>
              <div>
                <strong>{item.title}</strong><br />
                <span>{item.letterType}</span>
              </div>
              <span className="record-badge">{item.status}</span>
              <small>{item.employeeId || 'Employee record'}</small>
              {canCreate && (
                <div className="inline-actions">
                  <button type="button" className="small-button" onClick={() => generate(item._id || item.id)}>Generate</button>
                </div>
              )}
            </div>
          )) : <p className="empty-state">No letters available yet.</p>}
        </div>
      </section>

      {canCreate && (
        <div className="side-stack">
          <form className="panel form-panel" onSubmit={submit}>
            <div className="panel-kicker">POST /api/letters</div>
            <h2>Create letter</h2>
            <label>Employee
              <select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required>
                <option value="">Select employee</option>
                {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.email}</option>)}
              </select>
            </label>
            <label>Letter type
              <select value={form.letterType} onChange={(event) => setForm({ ...form, letterType: event.target.value })}>
                <option value="experience">Experience</option>
                <option value="joining">Joining</option>
                <option value="relieving">Relieving</option>
                <option value="salary">Salary</option>
                <option value="promotion">Promotion</option>
                <option value="warning">Warning</option>
                <option value="appraisal">Appraisal</option>
              </select>
            </label>
            <Field label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
            <label>Content
              <textarea rows="5" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Leave blank to generate the employee-specific HTML letter automatically" />
            </label>
            <button className="primary-button">Create letter <span>↗</span></button>
            <p className="form-message success-message">{notice}</p>
          </form>

          {previewHtml && (
            <div className="panel letter-preview-panel">
              <div className="panel-kicker">Generated HTML letter</div>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnnouncementScreen({ announcements, userRole, request, refresh }) {
  const [form, setForm] = useState({ title: '', description: '', status: 'published' });
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await request('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setNotice('Announcement published.');
      setForm({ title: '', description: '', status: 'published' });
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const canManage = ['super_admin', 'admin', 'hr_manager', 'manager', 'hr'].includes(userRole);

  return (
    <div className="screen-grid">
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">HRMS</div>
            <h2>Announcements</h2>
          </div>
          <span className="count-label">{announcements.length} records</span>
        </div>
        <div className="resource-view module-list">
          {announcements.length ? announcements.map((item) => (
            <div className="record" key={item._id || item.id}>
              <div>
                <strong>{item.title}</strong><br />
                <span>{item.description}</span>
              </div>
              <span className="record-badge">{item.status}</span>
              <small>{new Date(item.createdAt).toLocaleDateString()}</small>
            </div>
          )) : <p className="empty-state">No announcements to display.</p>}
        </div>
      </section>

      {canManage && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-kicker">POST /api/announcements</div>
          <h2>Create announcement</h2>
          <Field label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <label>Description
            <textarea rows="5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </label>
          <label>Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <button className="primary-button">Publish announcement <span>↗</span></button>
          <p className="form-message success-message">{notice}</p>
        </form>
      )}
    </div>
  );
}

function PolicyScreen({ policies, userRole, request, refresh }) {
  const [form, setForm] = useState({ title: '', description: '', status: 'published' });
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await request('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setNotice('Policy created.');
      setForm({ title: '', description: '', status: 'published' });
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const canManage = ['super_admin', 'admin', 'hr_manager', 'hr'].includes(userRole);

  return (
    <div className="screen-grid">
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">HRMS</div>
            <h2>Policies</h2>
          </div>
          <span className="count-label">{policies.length} records</span>
        </div>
        <div className="resource-view module-list">
          {policies.length ? policies.map((item) => (
            <div className="record" key={item._id || item.id}>
              <div>
                <strong>{item.title}</strong><br />
                <span>{item.description}</span>
              </div>
              <span className="record-badge">{item.status}</span>
              <small>{new Date(item.createdAt).toLocaleDateString()}</small>
            </div>
          )) : <p className="empty-state">No policies available.</p>}
        </div>
      </section>

      {canManage && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-kicker">POST /api/policies</div>
          <h2>Create policy</h2>
          <Field label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <label>Description
            <textarea rows="5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </label>
          <label>Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <button className="primary-button">Create policy <span>↗</span></button>
          <p className="form-message success-message">{notice}</p>
        </form>
      )}
    </div>
  );
}

function Overview({ employees, salaries, onRefresh, busy, activities, realtimeStatus, onlineCount }) {
  return <section className="overview-grid"><div className="panel welcome-panel"><div className="panel-kicker">Operations snapshot</div><h2>Your API workspace is ready.</h2><p className="muted">Use the navigation to exercise the same role permissions your production clients will use. Every request is shown in the response inspector below.</p><button className="quiet-button" onClick={onRefresh} disabled={busy}>Refresh data ↻</button></div><div className="panel activity-panel"><div className="panel-heading"><div><div className="panel-kicker">Realtime operations</div><h2>Live monitor</h2></div><span className={`realtime-pill ${realtimeStatus}`}>{realtimeStatus}</span></div><div className="metric-line"><span>Employee records</span><strong>{employees.length}</strong></div><div className="metric-line"><span>Salary records</span><strong>{salaries.length}</strong></div><div className="metric-line"><span>Accounts online</span><strong>{onlineCount}</strong></div><ActivityFeed activities={activities.slice(0, 4)} emptyMessage="Waiting for HRMS activity…" /></div></section>;
}

function LiveMonitor({ activities, realtimeStatus, onlineCount }) {
  return <section className="panel data-panel live-monitor-panel">
    <div className="panel-heading">
      <div><div className="panel-kicker">Authenticated Socket.IO stream</div><h2>Live HRMS activity</h2></div>
      <div className="monitor-status"><span className={`status-dot ${realtimeStatus === 'online' ? 'live' : ''}`} />{realtimeStatus} · {onlineCount} online</div>
    </div>
    <p className="muted">Successful account and HR module changes appear here while this session is connected.</p>
    <ActivityFeed activities={activities} emptyMessage="No live activity received yet." />
  </section>;
}

function ActivityFeed({ activities, emptyMessage }) {
  return <div className="live-activity-list">
    {activities.length ? activities.map((activity, index) => (
      <article className="live-activity-row" key={`${activity.occurredAt}-${index}`}>
        <span className={`activity-marker module-${activity.module}`} />
        <div className="live-activity-copy"><strong>{activity.summary}</strong><span>{activity.performedBy} · {activity.actorRole}</span></div>
        <time dateTime={activity.occurredAt}>{new Date(activity.occurredAt).toLocaleTimeString()}</time>
      </article>
    )) : <p className="empty-state">{emptyMessage}</p>}
  </div>;
}

function EmployeeScreen({ employees, canWrite, request, refresh }) {
  const [form, setForm] = useState({ name: '', email: '', department: '', role: '', salary: '' });
  const [notice, setNotice] = useState('');
  const create = async (event) => { event.preventDefault(); try { await request('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, salary: Number(form.salary) }) }); setNotice('Employee created.'); setForm({ name: '', email: '', department: '', role: '', salary: '' }); await refresh(); } catch (error) { setNotice(error.message); } };
  return <div className="screen-grid"><section className="panel data-panel"><div className="panel-heading"><div><div className="panel-kicker">Directory</div><h2>Employee records</h2></div><span className="count-label">{employees.length} visible</span></div><EmployeeList employees={employees} /></section>{canWrite && <form className="panel form-panel" onSubmit={create}><div className="panel-kicker">POST /api/employees</div><h2>Add employee</h2><Field label="Full name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} /><Field label="Job title" value={form.role} onChange={(value) => setForm({ ...form, role: value })} /><Field label="Salary" type="number" value={form.salary} onChange={(value) => setForm({ ...form, salary: value })} /><button className="primary-button">Create employee <span>↗</span></button><p className="form-message">{notice}</p></form>}</div>;
}

function SalaryScreen({ salaries, employees, canWrite, request, refresh }) {
  const [form, setForm] = useState({ employeeId: '', amount: '', basicSalary: '', allowances: '', deductions: '' });
  const [notice, setNotice] = useState('');
  const create = async (event) => { event.preventDefault(); try { await request('/api/salaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), basicSalary: Number(form.basicSalary || 0), allowances: Number(form.allowances || 0), deductions: Number(form.deductions || 0) }) }); setNotice('Salary created.'); await refresh(); } catch (error) { setNotice(error.message); } };
  return <div className="screen-grid"><section className="panel data-panel"><div className="panel-heading"><div><div className="panel-kicker">Payroll</div><h2>Salary records</h2></div><span className="count-label">{salaries.length} visible</span></div><SalaryList salaries={salaries} /></section>{canWrite && <form className="panel form-panel" onSubmit={create}><div className="panel-kicker">POST /api/salaries</div><h2>Add salary</h2><label>Employee<select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required><option value="">Choose employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label><Field label="Total amount" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><Field label="Basic salary" type="number" value={form.basicSalary} onChange={(value) => setForm({ ...form, basicSalary: value })} /><Field label="Allowances" type="number" value={form.allowances} onChange={(value) => setForm({ ...form, allowances: value })} /><Field label="Deductions" type="number" value={form.deductions} onChange={(value) => setForm({ ...form, deductions: value })} /><button className="primary-button">Create salary <span>↗</span></button><p className="form-message">{notice}</p></form>}</div>;
}

function FileScreen({ employees, selectedEmployee, setSelectedEmployee, files, file, setFile, upload, loadFiles, busy, message, error }) {
  const [preview, setPreview] = useState(null);
  const [fileError, setFileError] = useState('');
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx', '.xlsx'];

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    const extension = nextFile.name.slice(nextFile.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setFileError('This file type is not supported.');
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setFileError('File must be smaller than 5 MB.');
      return;
    }
    setFileError('');
    setFile(nextFile);
  };

  return <div className="screen-grid file-screen"><section className="panel upload-panel"><div className="panel-kicker">Private storage</div><h2>Employee files</h2><p className="muted">Upload a document, then preview it here without leaving the workspace.</p><label>Employee<select value={selectedEmployee} onChange={(event) => { setSelectedEmployee(event.target.value); setPreview(null); loadFiles(event.target.value); }}><option value="">Choose an employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.email}</option>)}</select></label><form onSubmit={upload}><label className="file-picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}><span className="upload-icon">↑</span><strong>{file?.name || 'Drop a file here or browse'}</strong><small>PDF, image, Word, or XLSX · max 5 MB</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xlsx" onChange={(event) => chooseFile(event.target.files[0])} required /></label>{fileError && <p className="form-message">{fileError}</p>}<button className="primary-button" disabled={busy || !selectedEmployee || !file}>{busy ? 'Working...' : 'Upload file'} <span>↑</span></button></form>{message && <p className="form-message success-message">{message}</p>}{error && <p className="form-message">{error}</p>}</section><section className="panel data-panel"><div className="panel-heading"><div><div className="panel-kicker">GET /api/employees/:id/files</div><h2>Stored files</h2></div><span className="count-label">{files.length} files</span></div><div className="file-list">{files.length ? files.map((item) => <div className={`file-row ${preview?.id === item.id ? 'selected-file' : ''}`} key={item.id}><div><strong title={item.originalName}>{item.originalName}</strong><small>{formatBytes(item.size)} · {item.mimeType}</small></div><div className="file-actions"><button onClick={() => setPreview(item)}>Preview</button><a href={item.downloadUrl} target="_blank" rel="noreferrer">Get</a></div></div>) : <p className="empty-state">No files uploaded for this employee.</p>}</div>{preview && <FilePreview file={preview} />}</section></div>;
}

function FilePreview({ file }) {
  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  return <div className="preview-box"><div className="preview-head"><div><div className="panel-kicker">Preview</div><strong>{file.originalName}</strong></div><a href={file.downloadUrl} target="_blank" rel="noreferrer">Open full file ↗</a></div>{isImage && <img src={file.previewUrl} alt={file.originalName} />}{isPdf && <iframe title={file.originalName} src={file.previewUrl} />}{!isImage && !isPdf && <p className="muted">This document type cannot be rendered inline. Use “Open full file” to view or download it.</p>}</div>;
}

function EmployeeAccountsScreen({ accounts, request, actorRole, actorEmail, onAccountsUpdated }) {
  const [search, setSearch] = useState('');
  const [roleDrafts, setRoleDrafts] = useState(() => Object.fromEntries(
    accounts.map((account) => [account.email, account.role])
  ));
  const [savingEmail, setSavingEmail] = useState('');
  const [notice, setNotice] = useState('');
  const assignableRoles = actorRole === 'super_admin'
    ? ['employee', 'manager', 'hr', 'hr_manager', 'admin', 'super_admin']
    : actorRole === 'admin'
      ? ['employee', 'manager', 'hr', 'hr_manager', 'admin']
      : ['employee', 'manager', 'hr'];
  const roleLabels = { employee: 'Employee', manager: 'Manager', hr: 'HR', hr_manager: 'HR manager', admin: 'Admin', super_admin: 'Super admin' };
  const normalizedSearch = search.trim().toLowerCase();
  const visibleAccounts = accounts.filter((account) => (
    `${account.name} ${account.email}`.toLowerCase().includes(normalizedSearch)
  ));

  useEffect(() => {
    setRoleDrafts(Object.fromEntries(accounts.map((account) => [account.email, account.role])));
  }, [accounts]);

  const assignRole = async (account) => {
    setSavingEmail(account.email);
    setNotice('');
    try {
      const result = await request('/api/auth/users/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, role: roleDrafts[account.email] || account.role })
      });
      onAccountsUpdated((current) => current.map((item) => (
        item.email === account.email ? { ...item, role: result.user.role } : item
      )));
      setNotice(result.message || `Role updated to ${result.user.role}.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSavingEmail('');
    }
  };

  return (
    <section className="panel data-panel employee-accounts-panel">
      <div className="panel-heading">
        <div>
          <div className="panel-kicker">GET /api/auth/users/accounts</div>
          <h2>Employee accounts</h2>
        </div>
        <span className="count-label">{accounts.length} registered</span>
      </div>
      <label className="account-search">Search accounts
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" />
      </label>
      <div className="employee-account-list">
        {visibleAccounts.length ? visibleAccounts.map((account) => (
          <article className="employee-account-row" key={account._id}>
            <div className="employee-account-identity">
              <strong>{account.name}</strong>
              <span>{account.email}</span>
            </div>
            <span className={`account-badge ${account.isEmailVerified ? 'verified' : 'pending'}`}>
              {account.isEmailVerified ? 'Verified' : 'Unverified'}
            </span>
            <div className="employee-account-meta">
              <span>Role <strong>{roleLabels[account.role] || account.role}</strong></span>
              <span>Registered <strong>{new Date(account.createdAt).toLocaleDateString()}</strong></span>
              <span>Last login <strong>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : 'Never'}</strong></span>
              <span>Two-factor <strong>{account.twoFactorEnabled ? 'Enabled' : 'Disabled'}</strong></span>
            </div>
            <div className="employee-account-controls">
              <label>Assign role
                <select
                  value={roleDrafts[account.email] || account.role}
                  disabled={account.email.toLowerCase() === actorEmail.toLowerCase()}
                  onChange={(event) => setRoleDrafts((current) => ({ ...current, [account.email]: event.target.value }))}
                >
                  {assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="small-button"
                disabled={savingEmail === account.email || account.email.toLowerCase() === actorEmail.toLowerCase()}
                onClick={() => assignRole(account)}
              >
                {savingEmail === account.email ? 'Updating...' : 'Update role'}
              </button>
            </div>
          </article>
        )) : <p className="empty-state">{accounts.length ? 'No accounts match this search.' : 'No user accounts are registered yet.'}</p>}
      </div>
      {notice && <p className="form-message success-message" role="status">{notice}</p>}
    </section>
  );
}

function AccessScreen({ request, actorRole }) {
  const [form, setForm] = useState({ email: '', role: 'employee' });
  const [notice, setNotice] = useState('');
  const assignableRoles = actorRole === 'super_admin'
    ? ['employee', 'manager', 'hr', 'hr_manager', 'admin', 'super_admin']
    : actorRole === 'admin'
      ? ['employee', 'manager', 'hr', 'hr_manager', 'admin']
      : ['employee', 'manager', 'hr'];
  const assign = async (event) => { event.preventDefault(); try { await request('/api/auth/users/role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); setNotice(`Role assigned: ${form.role}`); } catch (error) { setNotice(error.message); } };
  const roleLabels = { employee: 'Employee', manager: 'Manager', hr: 'HR', hr_manager: 'HR manager', admin: 'Admin', super_admin: 'Super admin' };
  return <section className="panel form-panel access-panel"><div className="panel-kicker">{actorRole} · POST /api/auth/users/role</div><h2>Access control</h2><p className="muted">Assign a role to a registered user. HR can assign employee, manager, or HR roles; admin roles are restricted to administrators.</p><form onSubmit={assign}><Field label="User email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label><button className="primary-button">Update role <span>↗</span></button><p className="form-message success-message">{notice}</p></form></section>;
}

function Field({ label, value, onChange, type = 'text' }) { return <label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required /></label>; }

function EmployeeList({ employees }) {
  return <div className="resource-view">{employees.length ? employees.map((employee) => <div className="record" key={employee._id}><div><strong>{employee.name}</strong><br /><span>{employee.email} · {employee.department}</span></div><span className="record-badge">{employee.role}</span><small>{employee._id}</small></div>) : <p className="empty-state">No employees are visible for this role.</p>}</div>;
}

function SalaryList({ salaries }) {
  return <div className="resource-view">{salaries.length ? salaries.map((salary) => <div className="record" key={salary._id}><div><strong>{formatMoney(salary.amount)}</strong><br /><span>{salary.employeeId?.name || salary.employeeId || 'Employee'} · {salary.payPeriod}</span></div><span className="record-badge">{salary.paymentStatus}</span><small>{salary._id}</small></div>) : <p className="empty-state">No salaries are visible for this role.</p>}</div>;
}

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [authMode, setAuthMode] = useState(() => new URLSearchParams(window.location.search).get('mode') || 'login');

  useEffect(() => {
    let cancelled = false;
    localStorage.removeItem('employeePortalToken');
    const restoreSession = async () => {
      try {
        const restoredToken = await refreshAccessToken();
        const result = await apiRequest('/api/auth/profile', restoredToken);
        if (!cancelled) {
          setToken(restoredToken);
          setUser(result.user);
          setResponse({ success: true, data: result });
        }
      } catch {
        activeAccessToken = '';
      }
    };
    const expireSession = () => {
      activeAccessToken = '';
      setToken('');
      setUser(null);
      setError(new Error('Your session expired. Please sign in again.'));
    };
    window.addEventListener('auth:expired', expireSession);
    restoreSession();
    return () => {
      cancelled = true;
      window.removeEventListener('auth:expired', expireSession);
    };
  }, []);

  const login = async (credentials) => {
    try {
      const result = await apiRequest('/api/auth/login', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      if (result.requiresTwoFactor) return result;
      activeAccessToken = result.accessToken;
      setToken(result.accessToken);
      setUser(result.user);
      setResponse({
        success: true,
        data: { user: result.user },
        message: 'Signed in successfully'
      });
      setError(null);
      return result;
    } catch (loginError) {
      setResponse(loginError.payload || null);
      setError(loginError);
      throw loginError;
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', activeAccessToken, { method: 'POST' });
    } catch {
      // Clear local state even when the network is unavailable.
    }
    activeAccessToken = '';
    setToken('');
    setUser(null);
  };

  return <><header className="topbar"><a className="brand" href="/"><span className="brand-mark">EP</span><span>Employee Portal <small>React API console</small></span></a><div className="session-state"><span className={`status-dot ${user ? 'live' : ''}`} />{user ? 'Session active' : 'Signed out'}</div></header><main>{user ? <Dashboard user={user} token={token} onLogout={logout} onUserUpdated={setUser} initialResponse={response} /> : <AuthScreen initialMode={authMode} onModeChange={setAuthMode} onLogin={login} response={response} error={error} />}</main></>;
}