require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const attendeesRouter = require('./routes/attendees');
const qrRouter = require('./routes/qr');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve minimal frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve local vendor assets (for environments where CDNs are blocked)
app.use(
  '/vendor/html5-qrcode',
  express.static(path.join(__dirname, '..', 'node_modules', 'html5-qrcode'))
);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qr-entry';
const DEFAULT_EVENT = process.env.DEFAULT_EVENT || 'Aloysius After Party';
const DEFAULT_VENUE = process.env.DEFAULT_VENUE || 'Vijan Mahal';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

app.use('/api/attendees', attendeesRouter);
app.use('/api/qr', qrRouter);

app.get('/api/config', (req, res) => {
  res.json({ defaultEvent: DEFAULT_EVENT, defaultVenue: DEFAULT_VENUE });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
