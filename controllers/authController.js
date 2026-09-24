const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body || {});
  sendSuccess(res, result, 201);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.query.token);
  sendSuccess(res, result);
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification((req.body || {}).email);
  sendSuccess(res, result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body || {});
  sendSuccess(res, result);
});

const getProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: authService.getProfile(req.user) });
});

const assignRole = asyncHandler(async (req, res) => {
  const result = await authService.assignRole(req.user, req.body || {});
  sendSuccess(res, result);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword((req.body || {}).email);
  sendSuccess(res, result);
});

const resetPasswordPage = (req, res) => {
  const token = String(req.query.token || '').replace(/[^a-f0-9]/gi, '');

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset password</title>
  <style>
    body { margin: 0; background: #f4f7fb; color: #172033; font-family: Arial, sans-serif; }
    main { max-width: 420px; margin: 10vh auto; padding: 32px; background: #fff; border: 1px solid #e3e8f0; border-radius: 12px; box-shadow: 0 12px 30px rgba(23, 32, 51, .08); }
    h1 { margin-top: 0; }
    label { display: block; margin: 18px 0 6px; font-weight: 700; }
    input, button { box-sizing: border-box; width: 100%; padding: 12px; border-radius: 7px; font-size: 16px; }
    input { border: 1px solid #cbd3df; }
    button { margin-top: 22px; border: 0; background: #e56b35; color: #fff; font-weight: 700; cursor: pointer; }
    #message { margin-top: 18px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Reset your password</h1>
    <p>Choose a new password for your Employee Portal account.</p>
    <form id="reset-form">
      <label for="password">New password</label>
      <input id="password" type="password" minlength="8" required autocomplete="new-password">
      <button type="submit">Reset password</button>
    </form>
    <div id="message" role="status"></div>
  </main>
  <script>
    const form = document.getElementById('reset-form');
    const message = document.getElementById('message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = 'Resetting password...';
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '${token}', password: document.getElementById('password').value })
      });
      const result = await response.json();
      message.textContent = result.message || (result.data && result.data.message) || 'Request failed';
      if (response.ok) form.remove();
    });
  </script>
</body>
</html>`);
};

const resetPassword = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await authService.resetPassword(
    body.token || req.query.token,
    body.password
  );
  sendSuccess(res, result);
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user);
  sendSuccess(res, result);
});

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  getProfile,
  assignRole,
  forgotPassword,
  resetPasswordPage,
  resetPassword,
  logout
};
