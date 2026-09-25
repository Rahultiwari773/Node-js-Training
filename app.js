const express = require('express');
const path = require('path');
const employeeRoutes = require('./routes/employeeRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const authRoutes = require('./routes/authRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const letterRoutes = require('./routes/letterRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const policyRoutes = require('./routes/policyRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const {
  securityHeaders,
  corsProtection,
  mongoSanitizeProtection,
  hppProtection,
  apiLimiter
} = require('./middleware/security');

const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(corsProtection);
app.use(mongoSanitizeProtection);
app.use(hppProtection);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/api', apiLimiter);
app.use('/api/employees', employeeRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/policies', policyRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
