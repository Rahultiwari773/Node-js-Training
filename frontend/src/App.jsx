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

function Login({ onLogin, response, error }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    await onLogin(form).finally(() => setBusy(false));
  };

  return (
    <section className="login-layout">
      <div className="intro">
        <p className="eyebrow">A practical window into your API</p>
        <h1>Check every role.<br /><em>See what it can access.</em></h1>
        <p className="intro-copy">Sign in once, then exercise the live employee, salary, and file endpoints from the same origin as your server.</p>
        <div className="endpoint-note"><span>BASE URL</span><code>/api</code></div>
      </div>
      <form className="panel login-card" onSubmit={submit}>
        <div className="panel-kicker">Authentication</div>
        <h2>Open a session</h2>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Your password" required /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'} <span>↗</span></button>
        {error && <p className="form-message">{error.message}</p>}
        <ResponseBlock payload={response} />
      </form>
    </section>
  );
}

function ResponseBlock({ payload }) {
  return <pre className="response-output">{payload ? JSON.stringify(payload, null, 2) : 'No request yet.'}</pre>;
}

function Dashboard({ user, token, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [files, setFiles] = useState([]);
  const [tab, setTab] = useState('employees');
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

  const refresh = async () => {
    setBusy(true);
    try {
      const [employeeResult, salaryResult] = await Promise.all([
        request('/api/employees'),
        request('/api/salaries')
      ]);
      setEmployees(employeeResult);
      setSalaries(salaryResult);
      const nextEmployee = selectedEmployee || employeeResult[0]?._id || '';
      setSelectedEmployee(nextEmployee);
      if (nextEmployee) await loadFiles(nextEmployee);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh().catch(() => {}); }, []);

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

  const canWrite = ['admin', 'hr'].includes(user.role);
  const navigation = [
    ['overview', 'Overview'],
    ['employees', 'Employees'],
    ['salaries', 'Salaries'],
    ['files', 'File center'],
    ...(user.role === 'admin' ? [['access', 'Access control']] : [])
  ];

  return (
    <section className="workspace">
      <div className="workspace-head"><div><p className="eyebrow">Live API workspace</p><h1>Good morning, {user.name.split(' ')[0]}</h1></div><button className="quiet-button" onClick={onLogout}>Sign out</button></div>
      <div className="app-layout">
        <nav className="sidebar panel">{navigation.map(([key, label]) => <button key={key} className={`nav-item ${screen === key ? 'active' : ''}`} onClick={() => setScreen(key)}><span>{label}</span><small>{key === 'overview' ? '01' : key === 'employees' ? '02' : key === 'salaries' ? '03' : key === 'files' ? '04' : '05'}</small></button>)}<div className="sidebar-footer"><span className="status-dot live" />{user.role} access</div></nav>
        <div className="screen-area">
          <div className="summary-grid"><article className="summary-card accent-lime"><span>Signed-in role</span><strong>{user.role}</strong><small>{user.email}</small></article><article className="summary-card"><span>Employees visible</span><strong>{employees.length}</strong><small>GET /api/employees</small></article><article className="summary-card"><span>Salaries visible</span><strong>{salaries.length}</strong><small>GET /api/salaries</small></article></div>
          {screen === 'overview' && <Overview employees={employees} salaries={salaries} onRefresh={refresh} busy={busy} />}
          {screen === 'employees' && <EmployeeScreen employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'salaries' && <SalaryScreen salaries={salaries} employees={employees} canWrite={canWrite} request={request} refresh={refresh} />}
          {screen === 'files' && <FileScreen employees={employees} selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} files={files} file={file} setFile={setFile} upload={upload} loadFiles={loadFiles} busy={busy} message={message} error={error} />}
          {screen === 'access' && <AccessScreen request={request} />}
          <section className="panel response-panel"><div className="panel-heading"><div><div className="panel-kicker">Last response</div><h2>API output</h2></div><button className="icon-button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(response, null, 2))}>□</button></div><ResponseBlock payload={response} /></section>
        </div>
      </div>
    </section>
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
  return <section className="panel form-panel access-panel"><div className="panel-kicker">Admin only · POST /api/auth/users/role</div><h2>Access control</h2><p className="muted">Assign a registered user to the HR or employee role. Admin accounts cannot be created from this screen.</p><form onSubmit={assign}><Field label="User email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="employee">Employee</option><option value="hr">HR</option></select></label><button className="primary-button">Update role <span>↗</span></button><p className="form-message success-message">{notice}</p></form></section>;
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

  return <><header className="topbar"><a className="brand" href="/"><span className="brand-mark">EP</span><span>Employee Portal <small>React API console</small></span></a><div className="session-state"><span className={`status-dot ${user ? 'live' : ''}`} />{user ? 'Session active' : 'Signed out'}</div></header><main>{user ? <Dashboard user={user} token={token} onLogout={logout} /> : <Login onLogin={login} response={response} error={error} />}</main></>;
}