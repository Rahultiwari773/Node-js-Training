const http = require('http');
const app = require('./app');
const connectDatabase = require('./config/database');
const { port } = require('./config/env');
const { seedDefaultEmployees } = require('./services/employeeService');
const { connectRedis } = require('./utils/redisClient');
const { attachRealtimeServer } = require('./realtime/socketServer');

const server = http.createServer(app);
attachRealtimeServer(server);

const startServer = async () => {
  try {
    await connectDatabase();
    await seedDefaultEmployees();
    connectRedis();
    console.log('Default employees are ready');
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Application startup failed:', error.message);
    process.exit(1);
  }
};

startServer();