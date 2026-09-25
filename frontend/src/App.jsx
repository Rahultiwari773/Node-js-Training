import { useEffect, useState } from 'react';

const tokenKey = 'employeePortalToken';

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(value || 0);

const formatBytes = (value) => `${(value / 1024).toFixed(1)} KB`;

const apiRequest = async (path, token, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed');
    error.payload = payload;
    throw error;
  }

  return payload.data === undefined ? payload : payload.data;
};

function AuthScreen({ onLogin, response, error, initialMode = 'login', onModeChange }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', token: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    if (token) setForm((current) => ({ ...current, token }));
  }, []);

  const changeMode = (nextMode) => {
    setMode(nextMode);
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
        await onLogin({ email: form.email, password: form.password });
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
        const result = await apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(form.token)}`);
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
        <button className="primary-button" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset email' : mode === 'reset' ? 'Reset password' : 'Verify email'} <span>↗</span></button>
        {message && <p className="form-message">{message}</p>}
        {notice && <p className="form-message success-message">{notice}</p>}
        <div className="auth-links">
          {mode === 'login' && <><button type="button" onClick={() => changeMode('register')}>Create account</button><button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button><button type="button" onClick={() => changeMode('verify')}>Verify email</button></>}
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

function ResponseBlock({ payload }) {
  return <pre className="response-output">{payload ? JSON.stringify(payload, null, 2) : 'No request yet.'}</pre>;
}

function Dashboard({ user, token, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [letters, setLetters] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [response, setResponse] = useState(null);
  const [screen, setScreen] = useState('overview');

  const request = async (path, options = {}) => {
    try {
      const result = await apiRequest(path, token, options);
      setResponse(result);
      setError('');
      return result;
    } catch (requestError) {
      setResponse(requestError.payload || { message: requestError.message });
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

  const refresh = async () => {
    setBusy(true);
    try {
      const results = await Promise.all([
        request('/api/employees'),
        request('/api/salaries')
      ]);

      const [employeeResult, salaryResult] = results;
      setEmployees(employeeResult || []);
      setSalaries(salaryResult || []);

      const nextEmployee = selectedEmployee || employeeResult?.[0]?._id || '';
      setSelectedEmployee(nextEmployee);
      if (nextEmployee) await loadFiles(nextEmployee);

      await Promise.all([
        loadLeaves(),
        loadLetters(),
        loadAnnouncements(),
        loadPolicies()
      ]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh().catch(() => {}); }, [token]);

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
    ['employees', 'Employees'],
    ['salaries', 'Salaries'],
    ['files', 'File center'],
    ['leaves', 'Leaves'],
    ['letters', 'Letters'],
    ['announcements', 'Announcements'],
    ['policies', 'Policies'],
    ...(user.role === 'admin' || user.role === 'super_admin' ? [['access', 'Access control']] : [])
  ];

  return (
    <section className="workspace">
      <div className="workspace-head"><div><p className="eyebrow">Live API workspace</p><h1>Good morning, {user.name ? user.name.split(' ')[0] : 'User'}</h1>{announcements[0] && <button type="button" className="quiet-button header-announcement" style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 620, marginTop: 18, padding: '10px 12px', textAlign: 'left' }} onClick={() => setScreen('announcements')}><span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, flex: '0 0 24px', background: 'var(--lime)', color: 'var(--green)', fontWeight: 700 }}>!</span><span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{announcements[0].title}</strong><small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 11 }}>{announcements[0].description}</small></span><b style={{ marginLeft: 'auto', color: 'var(--green)', font: '10px var(--mono)', textTransform: 'uppercase' }}>View</b></button>}</div><button className="quiet-button" onClick={onLogout}>Sign out</button></div>
      <div className="app-layout">
        <nav className="sidebar panel">{navigation.map(([key, label]) => <button key={key} className={`nav-item ${screen === key ? 'active' : ''}`} onClick={() => setScreen(key)}><span>{label}</span><small>{key === 'overview' ? '01' : key === 'employees' ? '02' : key === 'salaries' ? '03' : key === 'files' ? '04' : key === 'leaves' ? '05' : key === 'letters' ? '06' : key === 'announcements' ? '07' : key === 'policies' ? '08' : '09'}</small></button>)}<div className="sidebar-footer"><span className="status-dot live" />{user.role} access</div></nav>
        <div className="screen-area">
          <div className="summary-grid"><article className="summary-card accent-lime"><span>Signed-in role</span><strong>{user.role}</strong><small>{user.email}</small></article><article className="summary-card"><span>Employees visible</span><strong>{employees.length}</strong><small>GET /api/employees</small></article><article className="summary-card"><span>HR modules</span><strong>{leaves.length + letters.length + announcements.length + policies.length}</strong><small>RBAC actions</small></article></div>
          {screen === 'overview' && <Overview employees={employees} salaries={salaries} onRefresh={refresh} busy={busy} />}
          {screen === 'employees' && <EmployeeScreen employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'salaries' && <SalaryScreen salaries={salaries} employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'files' && <FileScreen employees={employees} selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} files={files} file={file} setFile={setFile} upload={upload} loadFiles={loadFiles} busy={busy} message={message} error={error} />}
          {screen === 'leaves' && <LeaveScreen leaves={leaves} userRole={user.role} request={request} refresh={loadLeaves} />}
          {screen === 'letters' && <LetterScreen letters={letters} userRole={user.role} employees={employees} request={request} refresh={loadLetters} />}
          {screen === 'announcements' && <AnnouncementScreen announcements={announcements} userRole={user.role} request={request} refresh={loadAnnouncements} />}
          {screen === 'policies' && <PolicyScreen policies={policies} userRole={user.role} request={request} refresh={loadPolicies} />}
          {screen === 'access' && <AccessScreen request={request} />}
          <section className="panel response-panel"><div className="panel-heading"><div><div className="panel-kicker">Last response</div><h2>API output</h2></div><button className="icon-button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(response, null, 2))}>□</button></div><ResponseBlock payload={response} /></section>
        </div>
      </div>
    </section>
  );
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

function Overview({ employees, salaries, onRefresh, busy }) {
  return <section className="overview-grid"><div className="panel welcome-panel"><div className="panel-kicker">Operations snapshot</div><h2>Your API workspace is ready.</h2><p className="muted">Use the navigation to exercise the same role permissions your production clients will use. Every request is shown in the response inspector below.</p><button className="quiet-button" onClick={onRefresh} disabled={busy}>Refresh data ↻</button></div><div className="panel activity-panel"><div className="panel-kicker">At a glance</div><div className="metric-line"><span>Employee records</span><strong>{employees.length}</strong></div><div className="metric-line"><span>Salary records</span><strong>{salaries.length}</strong></div><div className="metric-line"><span>API status</span><strong className="healthy">Online</strong></div></div></section>;
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

function AccessScreen({ request }) {
  const [form, setForm] = useState({ email: '', role: 'employee' });
  const [notice, setNotice] = useState('');
  const assign = async (event) => { event.preventDefault(); try { await request('/api/auth/users/role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); setNotice(`Role assigned: ${form.role}`); } catch (error) { setNotice(error.message); } };
  return <section className="panel form-panel access-panel"><div className="panel-kicker">Admin / super-admin · POST /api/auth/users/role</div><h2>Access control</h2><p className="muted">Assign a registered user to one of the five HRMS roles. Role changes take effect on the user’s next authenticated request.</p><form onSubmit={assign}><Field label="User email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="employee">Employee</option><option value="manager">Manager</option><option value="hr_manager">HR manager</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></label><button className="primary-button">Update role <span>↗</span></button><p className="form-message success-message">{notice}</p></form></section>;
}

function Field({ label, value, onChange, type = 'text' }) { return <label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required /></label>; }

function EmployeeList({ employees }) {
  return <div className="resource-view">{employees.length ? employees.map((employee) => <div className="record" key={employee._id}><div><strong>{employee.name}</strong><br /><span>{employee.email} · {employee.department}</span></div><span className="record-badge">{employee.role}</span><small>{employee._id}</small></div>) : <p className="empty-state">No employees are visible for this role.</p>}</div>;
}

function SalaryList({ salaries }) {
  return <div className="resource-view">{salaries.length ? salaries.map((salary) => <div className="record" key={salary._id}><div><strong>{formatMoney(salary.amount)}</strong><br /><span>{salary.employeeId?.name || salary.employeeId || 'Employee'} · {salary.payPeriod}</span></div><span className="record-badge">{salary.paymentStatus}</span><small>{salary._id}</small></div>) : <p className="empty-state">No salaries are visible for this role.</p>}</div>;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '');
  const [user, setUser] = useState(null);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [authMode, setAuthMode] = useState(() => new URLSearchParams(window.location.search).get('mode') || 'login');

  useEffect(() => {
    if (!token) return;
    apiRequest('/api/auth/profile', token)
      .then((result) => setUser(result.user))
      .catch(() => { localStorage.removeItem(tokenKey); setToken(''); });
  }, []);

  const login = async (credentials) => {
    try {
      const result = await apiRequest('/api/auth/login', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      localStorage.setItem(tokenKey, result.token);
      setToken(result.token);
      setUser(result.user);
      setResponse(result);
      setError(null);
    } catch (loginError) {
      setResponse(loginError.payload || null);
      setError(loginError);
    }
  };

  const logout = () => {
    localStorage.removeItem(tokenKey);
    setToken('');
    setUser(null);
  };

  return <><header className="topbar"><a className="brand" href="/"><span className="brand-mark">EP</span><span>Employee Portal <small>React API console</small></span></a><div className="session-state"><span className={`status-dot ${user ? 'live' : ''}`} />{user ? 'Session active' : 'Signed out'}</div></header><main>{user ? <Dashboard user={user} token={token} onLogout={logout} /> : <AuthScreen initialMode={authMode} onModeChange={setAuthMode} onLogin={login} response={response} error={error} />}</main></>;
}