'use strict';
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { messagingApi } = require('@line/bot-sdk');

const W   = 2500;
const H   = 1686;
const COL = W / 2;   // 1250
const ROW = H / 2;   // 843

// Read font once at module load — embed as base64 in every SVG
const FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'Sarabun-Bold.ttf');
const FONT_B64  = fs.readFileSync(FONT_PATH).toString('base64');

const CELLS = [
  { x: 0,   y: 0,   color: '#FF8C00', emoji: '🍈', label: 'ราคาผลไม้' },
  { x: COL, y: 0,   color: '#228B22', emoji: '🥬', label: 'ราคาผัก' },
  { x: 0,   y: ROW, color: '#1E90FF', emoji: '🌿', label: 'โปรโมชั่นปุ๋ย' },
  { x: COL, y: ROW, color: '#006400', emoji: '🌱', label: 'บำรุงสวนของคุณ' },
];

function buildSvg() {
  const rects = CELLS.map(c =>
    `<rect x="${c.x}" y="${c.y}" width="${COL}" height="${ROW}" fill="${c.color}"/>`
  ).join('\n  ');

  const texts = CELLS.map(c => {
    const cx = c.x + COL / 2;
    const ey = c.y + ROW / 2 - 70;   // emoji
    const ly = c.y + ROW / 2 + 130;  // label
    return (
      `<text x="${cx}" y="${ey}" font-size="190" text-anchor="middle" dominant-baseline="middle">${c.emoji}</text>\n  ` +
      `<text x="${cx}" y="${ly}" font-size="115" font-weight="bold" fill="white" ` +
      `text-anchor="middle" dominant-baseline="middle" font-family="Sarabun, sans-serif">${c.label}</text>`
    );
  }).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>
      @font-face {
        font-family: 'Sarabun';
        src: url('data:font/truetype;base64,${FONT_B64}');
        font-weight: bold;
      }
    </style>
  </defs>
  ${rects}
  <line x1="${COL}" y1="0" x2="${COL}" y2="${H}" stroke="white" stroke-width="6"/>
  <line x1="0" y1="${ROW}" x2="${W}" y2="${ROW}" stroke="white" stroke-width="6"/>
  ${texts}
</svg>`;
}

async function createRichMenuPNG() {
  const svg = buildSvg();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

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

  const { richMenuId } = await client.createRichMenu({
    size: { width: W, height: H },
    selected: true,
    name: 'Fruit Bot Main Menu',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: 0,   y: 0,   width: COL, height: ROW },
        action: { type: 'postback', label: '🍈 ราคาผลไม้',      data: 'action=fruit_prices', displayText: 'ดูราคาผลไม้วันนี้' },
      },
      {
        bounds: { x: COL, y: 0,   width: COL, height: ROW },
        action: { type: 'postback', label: '🥬 ราคาผัก',        data: 'action=veg_prices',   displayText: 'ดูราคาผักวันนี้' },
      },
      {
        bounds: { x: 0,   y: ROW, width: COL, height: ROW },
        action: { type: 'postback', label: '🌿 โปรโมชั่นปุ๋ย', data: 'action=promotion',    displayText: 'ดูโปรโมชั่นปุ๋ย' },
      },
      {
        bounds: { x: COL, y: ROW, width: COL, height: ROW },
        action: { type: 'uri', label: '🌱 บำรุงสวนของคุณ', uri: 'https://line-fruit-bot.onrender.com/landing' },
      },
    ],
  });
  console.log('Rich menu created:', richMenuId);

  const imageBuffer = await createRichMenuPNG();
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

  await client.setDefaultRichMenu(richMenuId);
  console.log('Rich menu set as default');

  return richMenuId;
}

module.exports = { createAndSetRichMenu, createRichMenuPNG };
