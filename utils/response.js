const sendSuccess = (res, data, statusCode = 200) => {
  res.status(statusCode).json({ success: true, data });
};

const sendMessage = (res, message, statusCode = 200) => {
  res.status(statusCode).json({ success: true, message });
};

module.exports = { sendSuccess, sendMessage };
