const zlib = require('zlib');
const axios = require('axios');
const { messagingApi } = require('@line/bot-sdk');

// ── Minimal PNG generator (no deps) ──────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

// Creates a 2500×843 PNG: left = orange, divider = white, right = purple
function createRichMenuPNG(width = 2500, height = 843) {
  const mid = Math.floor(width / 2);
  const divW = 6; // divider width px

  const row = Buffer.allocUnsafe(1 + width * 3);
  row[0] = 0; // filter: None
  for (let x = 0; x < width; x++) {
    const o = 1 + x * 3;
    if (x >= mid - divW && x < mid + divW) {
      row[o] = 255; row[o + 1] = 255; row[o + 2] = 255;        // white divider
    } else if (x < mid) {
      row[o] = 243; row[o + 1] = 156; row[o + 2] = 18;         // orange #f39c12
    } else {
      row[o] = 142; row[o + 1] = 68;  row[o + 2] = 173;        // purple #8e44ad
    }
  }

  const rawData = Buffer.concat(Array(height).fill(row));
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const IHDR = Buffer.allocUnsafe(13);
  IHDR.writeUInt32BE(width, 0);
  IHDR.writeUInt32BE(height, 4);
  IHDR[8] = 8; IHDR[9] = 2; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', IHDR),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rich Menu ─────────────────────────────────────────────────────────────────

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

async function deleteExistingDefault(client) {
  try {
    const { richMenuId } = await client.getDefaultRichMenuId();
    if (richMenuId) {
      await client.cancelDefaultRichMenu();
      await client.deleteRichMenu(richMenuId);
      console.log('Deleted old rich menu:', richMenuId);
    }
  } catch (_) { /* no existing menu */ }
}

async function createAndSetRichMenu() {
  const client = getClient();
  await deleteExistingDefault(client);

  // 1. Create rich menu structure
  const { richMenuId } = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Fruit Bot Main Menu',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: 'postback',
          label: 'ราคาวันนี้',
          data: 'action=price',
          displayText: 'ดูราคาผลไม้วันนี้',
        },
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: 'postback',
          label: 'โปรโมชั่น',
          data: 'action=promotion',
          displayText: 'ดูโปรโมชั่น',
        },
      },
    ],
  });
  console.log('Rich menu created:', richMenuId);

  // 2. Generate and upload image (pure Node.js PNG, no lib needed)
  const imageBuffer = createRichMenuPNG();
  console.log(`PNG generated: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  await axios.post(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    imageBuffer,
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'image/png',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );
  console.log('Image uploaded');

  // 3. Set as default for all users
  await client.setDefaultRichMenu(richMenuId);
  console.log('Rich menu set as default');

  return richMenuId;
}

module.exports = { createAndSetRichMenu, createRichMenuPNG };
