const mongoose = require('mongoose');

const AttendeeSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  event: { type: String, required: true },
  qrGenerated: { type: Boolean, default: false },
  status: { type: String, enum: ['NOT_ENTERED', 'ENTERED'], default: 'NOT_ENTERED' },
  venue: { type: String, default: null },
  enteredAt: { type: Date, default: null },
  createdAt: { type: Date, default: () => new Date() }
});

// ensure uid unique
AttendeeSchema.index({ uid: 1 }, { unique: true });
// prevent duplicate name+event uploads at DB level
AttendeeSchema.index({ name: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('Attendee', AttendeeSchema);
