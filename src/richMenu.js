const axios = require('axios');
const { createCanvas } = require('@napi-rs/canvas');
const { messagingApi } = require('@line/bot-sdk');

const W = 2500;
const H = 1686;
const COL = W / 2;   // 1250
const ROW = H / 2;   // 843

const CELLS = [
  { x: 0,   y: 0,   color: '#FF8C00', emoji: '🍈', label: 'ราคาผลไม้' },
  { x: COL, y: 0,   color: '#228B22', emoji: '🥬', label: 'ราคาผัก' },
  { x: 0,   y: ROW, color: '#1E90FF', emoji: '🌿', label: 'โปรโมชั่นปุ๋ย' },
  { x: COL, y: ROW, color: '#006400', emoji: '🌱', label: 'บำรุงสวนของคุณ' },
];

function createRichMenuPNG() {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  for (const cell of CELLS) {
    // Background
    ctx.fillStyle = cell.color;
    ctx.fillRect(cell.x, cell.y, COL, ROW);

    // Subtle dark overlay at bottom of each cell for depth
    const grad = ctx.createLinearGradient(cell.x, cell.y, cell.x, cell.y + ROW);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(cell.x, cell.y, COL, ROW);

    // Large emoji circle background
    const cx = cell.x + COL / 2;
    const cy = cell.y + ROW / 2 - 80;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, 180, 0, Math.PI * 2);
    ctx.fill();

    // Emoji
    ctx.font = '220px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.emoji, cx, cy);

    // Label
    ctx.font = 'bold 115px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(cell.label, cx, cell.y + ROW - 130);
    ctx.shadowBlur = 0;
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 6;
  // vertical centre
  ctx.beginPath(); ctx.moveTo(COL, 0); ctx.lineTo(COL, H); ctx.stroke();
  // horizontal centre
  ctx.beginPath(); ctx.moveTo(0, ROW); ctx.lineTo(W, ROW); ctx.stroke();

  return canvas.toBuffer('image/png');
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

  await client.setDefaultRichMenu(richMenuId);
  console.log('Rich menu set as default');

  return richMenuId;
}

module.exports = { createAndSetRichMenu, createRichMenuPNG };
