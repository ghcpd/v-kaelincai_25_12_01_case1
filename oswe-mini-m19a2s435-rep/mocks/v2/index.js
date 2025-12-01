const express = require('express');
const bodyParser = require('express').json;
const app = express();
app.use(bodyParser());

// Simulate immediate success
app.post('/v2/appointments', (req, res) => {
  res.json({ status: 'ok', id: 'mock-' + Date.now() });
});

// Simulate delayed response for testing retry/timeouts
app.post('/v2/delayed', (req, res) => {
  const delay = Number(req.query.delay || 2000);
  setTimeout(() => res.json({ status: 'ok', id: 'delayed-' + Date.now(), delay }), delay);
});

module.exports = app;