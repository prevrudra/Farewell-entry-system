const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

async function generatePdfBuffer(attendees) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 36;
      const cols = 4;
      const rows = 6;
      const cellW = (pageWidth - margin * 2) / cols;
      const cellH = (pageHeight - margin * 2) / rows;

      const qrMaxSize = Math.min(cellW * 0.7, cellH * 0.6);
      const fontSize = 10;

      let itemIndex = 0;
      for (let i = 0; i < attendees.length; i++) {
        if (itemIndex % (cols * rows) === 0 && itemIndex !== 0) doc.addPage();

        const pageItemIndex = itemIndex % (cols * rows);
        const col = pageItemIndex % cols;
        const row = Math.floor(pageItemIndex / cols);

        const x = margin + col * cellW;
        const y = margin + row * cellH;

        const attendee = attendees[i];
        const payload = JSON.stringify({ uid: attendee.uid, event: attendee.event });
        // generate qr png buffer
        const qrBuffer = await QRCode.toBuffer(payload, { type: 'png', margin: 1, width: Math.round(qrMaxSize) });

        // center qr horizontally and vertically in cell, leave room for name below
        const imgX = x + (cellW - qrMaxSize) / 2;
        const imgY = y + 8;
        doc.image(qrBuffer, imgX, imgY, { width: qrMaxSize, height: qrMaxSize });

        // name below
        const nameY = imgY + qrMaxSize + 6;
        doc.fontSize(fontSize).text(attendee.name, x + 4, nameY, { width: cellW - 8, align: 'center' });

        itemIndex++;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePdfBuffer };
