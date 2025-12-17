const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Attendee = require('../models/attendee');

// POST /api/attendees/add
// { names: ["Name A", ...], event: "Event Name" }
router.post('/add', async (req, res) => {
  try {
    const { names, event } = req.body;
    if (!Array.isArray(names) || !event) return res.status(400).json({ error: 'Invalid payload' });

    const normalizedEvent = String(event).trim();
    if (!normalizedEvent) return res.status(400).json({ error: 'Invalid payload' });

    const cleanedNames = names
      .map(n => String(n).trim())
      .filter(Boolean);

    const uniqueNames = Array.from(new Set(cleanedNames));
    if (uniqueNames.length === 0) return res.json({ insertedCount: 0, skippedCount: names.length, inserted: [] });

    const now = new Date();
    const ops = uniqueNames.map((name) => {
      const uid = uuidv4();
      return {
        updateOne: {
          filter: { name, event: normalizedEvent },
          update: {
            $setOnInsert: {
              uid,
              name,
              event: normalizedEvent,
              qrGenerated: false,
              status: 'NOT_ENTERED',
              venue: null,
              enteredAt: null,
              createdAt: now
            }
          },
          upsert: true
        }
      };
    });

    const result = await Attendee.bulkWrite(ops, { ordered: false });

    const insertedIds = Object.values(result.upsertedIds || {}).map(v => v._id);
    const insertedDocs = insertedIds.length
      ? await Attendee.find({ _id: { $in: insertedIds } }, { _id: 1, uid: 1, name: 1 }).lean()
      : [];

    const inserted = insertedDocs.map(d => ({ id: d._id, uid: d.uid, name: d.name }));
    const insertedCount = result.upsertedCount || 0;
    const skippedCount = uniqueNames.length - insertedCount;

    return res.json({ insertedCount, skippedCount, inserted });
  } catch (err) {
    // handle duplicate key error gracefully (can happen under concurrency)
    if (err.code === 11000) return res.json({ insertedCount: 0, skippedCount: 0, inserted: [] });
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attendees
// optional query: ?status=ENTERED|NOT_ENTERED&event=Event+Name&limit=100
router.get('/', async (req, res) => {
  try {
    const { status, event, limit = 500 } = req.query;
    const q = {};
    if (status && (status === 'ENTERED' || status === 'NOT_ENTERED')) q.status = status;
    if (event) q.event = String(event);

    const docs = await Attendee.find(q).sort({ createdAt: -1 }).limit(parseInt(limit, 10)).lean();
    return res.json({ count: docs.length, attendees: docs.map(d => ({
      uid: d.uid,
      name: d.name,
      event: d.event,
      qrGenerated: !!d.qrGenerated,
      status: d.status,
      venue: d.venue,
      enteredAt: d.enteredAt,
      createdAt: d.createdAt
    })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

