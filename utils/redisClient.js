const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (error) => {
  console.error('Redis client error:', error.message);
});

let connectionPromise;

const connectRedis = () => {
  if (redisClient.isReady) return Promise.resolve();
  if (!connectionPromise) {
    connectionPromise = redisClient.connect()
      .catch((error) => {
        console.error('Redis connection failed:', error.message);
      })
      .finally(() => {
        connectionPromise = null;
      });
  }

  return connectionPromise;
};

module.exports = { redisClient, connectRedis };