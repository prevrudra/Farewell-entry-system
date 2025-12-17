# QR Entry System

Server + minimal frontend UI that allows incremental attendee uploads, QR generation for new attendees only, and server-side QR scan validation.

Usage

1. Install:

```bash
npm install
```

2. Configure `.env` from `.env.example` and start the server:

```bash
cp .env.example .env
# edit .env if needed
npm start
```

3. Open the UI:

- http://localhost:3000

Defaults

- Set `DEFAULT_EVENT` and `DEFAULT_VENUE` in `.env` to avoid typing them in the UI.

Endpoints

- `POST /api/attendees/add` — Add names: { names: [..], event: "Event" }
- `GET /api/qr/generate` — Generate PDF of QR codes for records with `qrGenerated=false`
- `POST /api/qr/scan` — Validate scan: { uid, venue }

Notes

- New attendees are inserted with `qrGenerated=false`.
- QR generation uses `qrGenerated=false` as the only selection criteria, so old records are never regenerated.
- Scan validation is server-side and atomic: `status` flips from `NOT_ENTERED` to `ENTERED` once.
