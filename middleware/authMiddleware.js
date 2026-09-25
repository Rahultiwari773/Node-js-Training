const authenticate = require('./authenticate');
const { authorize } = require('./authorize');

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authorize = authorize;
