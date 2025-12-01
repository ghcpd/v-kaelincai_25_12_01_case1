const express = require('express');
const bodyParser = require('express').json;
const AppointmentService = require('./services/appointmentService');
const { getActionLabel } = require('./actionLabel');
const logger = require('./utils/logger');

const app = express();
app.use(bodyParser());

const svc = new AppointmentService(logger);

app.post('/appointments', async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key') || null;
  const event = req.body;

  try {
    const result = await svc.createAppointment(event, { idempotencyKey });
    res.status(201).json(result);
  } catch (err) {
    logger.error('createAppointment failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/appointments/:id', async (req, res) => {
  const result = svc.getAppointment(req.params.id);
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json(result);
});

app.get('/action-label', (req, res) => {
  // This endpoint demonstrates the getActionLabel feature in a request context
  const eventLike = req.body || {};
  try {
    const label = getActionLabel(eventLike, req.query.attribute || 'data-action');
    res.json({ label });
  } catch (err) {
    res.status(400).json({ error: 'invalid_event' });
  }
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Server listening on ${port}`));
}

module.exports = { app, svc };