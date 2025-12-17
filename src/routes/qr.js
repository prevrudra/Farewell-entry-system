const express = require('express');
const router = express.Router();
const Attendee = require('../models/attendee');
const { generatePdfBuffer } = require('../utils/pdfGenerator');

// GET /api/qr/generate
// Generates QR images only for attendees where qrGenerated == false
router.get('/generate', async (req, res) => {
  try {
    const toGenerate = await Attendee.find({ qrGenerated: false }).sort({ createdAt: 1 }).lean();
    if (!toGenerate || toGenerate.length === 0) return res.status(204).end();

    // generate PDF buffer
    const pdfBuffer = await generatePdfBuffer(toGenerate);

    // mark those records as generated
    const ids = toGenerate.map(d => d._id);
    await Attendee.updateMany({ _id: { $in: ids } }, { $set: { qrGenerated: true } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="qrcodes.pdf"');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error generating PDF' });
  }
});

// POST /api/qr/scan
// { uid: 'UUID_V4', venue: 'Main Gate' }
router.post('/scan', async (req, res) => {
  try {
    const { uid, venue } = req.body;
    if (!uid || !venue) return res.status(400).json({ error: 'Invalid payload' });

    // Atomic update to strictly block reuse under concurrency
    const updated = await Attendee.findOneAndUpdate(
      { uid, status: 'NOT_ENTERED' },
      { $set: { status: 'ENTERED', venue: String(venue), enteredAt: new Date() } },
      { new: true }
    );

    if (updated) {
      return res.json({
        success: true,
        message: '✅ Entry successful',
        attendeeName: updated.name,
        status: updated.status
      });
    }

    const attendee = await Attendee.findOne({ uid }, { name: 1, status: 1 }).lean();
    if (!attendee) {
      return res.status(404).json({
        success: false,
        message: '❌ Invalid QR'
      });
    }

    return res.status(409).json({
      success: false,
      message: '❌ QR code already used',
      attendeeName: attendee.name,
      status: attendee.status
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
