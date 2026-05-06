require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Webhook route needs raw body BEFORE json middleware
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(cors({
  origin: [
    'https://www.unveilart.com.au',
    'https://unveilart.com.au',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));

app.use(express.json());
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/venues/:id/artworks', require('./routes/artworks'));
app.use('/api/venues', require('./routes/venues'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/webhooks', require('./routes/webhooks'));

// Serve admin static files
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date() }));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UnveilArt API running on port ${PORT}`));

module.exports = app;
