const crypto = require('crypto');

function makeToken(password) {
  return crypto.createHash('sha256')
    .update(password + ':unveilart-admin')
    .digest('hex');
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const expected = makeToken(process.env.ADMIN_PASSWORD);
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  next();
}

module.exports = { requireAuth, makeToken };
