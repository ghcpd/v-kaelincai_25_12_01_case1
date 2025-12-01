const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class AppointmentService {
  constructor(logger) {
    this.logger = logger;
    this.store = new Map();
    this.idempotency = new Map();
    this.outbox = []; // simple in-memory outbox
    this.events = new EventEmitter();

    // Periodically flush outbox for demo purposes
    this._outboxInterval = setInterval(() => this.flushOutbox(), 5000);
  }

  stop() {
    if (this._outboxInterval) {
      clearInterval(this._outboxInterval);
      this._outboxInterval = null;
    }
  }

  validatePayload(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('invalid_payload');
    if (!payload.customer || !payload.start || !payload.end) throw new Error('missing_fields');
    // Add additional validation e.g., timezone, duration constraints
  }

  getAppointment(id) {
    return this.store.get(id) || null;
  }

  async createAppointment(payload, options = {}) {
    const idempotencyKey = options.idempotencyKey || null;
    this.validatePayload(payload);

    if (idempotencyKey) {
      const cached = this.idempotency.get(idempotencyKey);
      if (cached) {
        this.logger.info('idempotent request - return cached', { id: cached.idempotencyId });
        return { ...cached.record, id: cached.id }; // return cached result
      }
    }

    // create record
    const id = uuidv4();
    const record = {
      id,
      customer: payload.customer,
      start: payload.start,
      end: payload.end,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    // write to store + outbox (ensures events are emitted as part of the transaction)
    try {
      this.store.set(id, record);
      this.outbox.push({ id, type: 'appointment.created', payload: record, createdAt: new Date().toISOString() });

      if (idempotencyKey) {
        this.idempotency.set(idempotencyKey, { idempotencyId: idempotencyKey, id, record });
      }

      // emit event locally - asynchronous processing
      this.events.emit('appointment.created', record);

      // Immediately attempt to flush the outbox to reduce test race conditions
      setImmediate(() => this.flushOutbox());

      return record;
    } catch (err) {
      // remove on error
      this.store.delete(id);
      throw err;
    }
  }

  async flushOutbox() {
    // In real system, write to transactional outbox DB table then publish
    while (this.outbox.length > 0) {
      const msg = this.outbox.shift();
      this.logger.info('publishing outbox message', { type: msg.type, id: msg.id });
      try {
        // For demo, emit event for local subscribers
        this.events.emit('outbox.publish', msg);
      } catch (err) {
        this.logger.error('failed to publish outbox', { err: err.message });
        this.outbox.unshift(msg); // push back
        break;
      }
    }
  }
}

module.exports = AppointmentService;