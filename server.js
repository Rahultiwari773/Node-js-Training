const app = require('./app');
const connectDatabase = require('./config/database');
const { port } = require('./config/env');
const { seedDefaultEmployees } = require('./services/employeeService');

const startServer = async () => {
  try {
    await connectDatabase();
    await seedDefaultEmployees();
    console.log('Default employees are ready');
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Application startup failed:', error.message);
    process.exit(1);
  }
};

startServer();