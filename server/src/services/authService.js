const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalise timing for unknown emails
const sign = (config, u) => jwt.sign({ sub: String(u._id), name: u.name }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });
const pub = (u) => ({ id: String(u._id), name: u.name, email: u.email });

function createAuthService(config) {
  return {
    async register({ name, email, password }) {
      if (!config.allowRegistration) throw new ApiError(403, 'registration_disabled', 'Registration is disabled');
      const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
      return { token: sign(config, user), user: pub(user) };
    },
    async login({ email, password }) {
      const user = await User.findOne({ email }).select('+passwordHash');
      const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
      if (!user || !ok) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password');
      return { token: sign(config, user), user: pub(user) };
    },
    async me(id) {
      const user = await User.findById(id);
      if (!user) throw new ApiError(401, 'unauthorized', 'User no longer exists');
      return pub(user);
    },
  };
}
module.exports = { createAuthService };
