const express = require('express');
const router = express.Router();
const { makeToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

// POST /api/auth/login
router.post('/login', authLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = makeToken(password);
  res.json({ token });
});

module.exports = router;
