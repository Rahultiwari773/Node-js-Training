const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi');
const realtimeActivity = require('./middleware/realtimeActivity');
const employeeRoutes = require('./routes/employeeRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const authRoutes = require('./routes/authRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const letterRoutes = require('./routes/letterRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const policyRoutes = require('./routes/policyRoutes');
const documentRoutes = require('./routes/documentRoutes');
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
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api-docs.json', (req, res) => {
  res.json(openApiSpec);
});

app.use('/api-docs', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
  );
  next();
}, swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  explorer: true,
  customSiteTitle: 'Employee Portal API Documentation',
  swaggerOptions: { persistAuthorization: true }
}));

app.use('/api', apiLimiter);
app.use('/api', realtimeActivity);
app.use('/api/employees', employeeRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/documents', documentRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
