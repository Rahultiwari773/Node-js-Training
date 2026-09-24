const mongoose = require('mongoose');
const { mongoUri } = require('./env');

const connectDatabase = async () => {
  await mongoose.connect(mongoUri);
  console.log('Database connected');
};

module.exports = connectDatabase;
