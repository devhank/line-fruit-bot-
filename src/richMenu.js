const axios = require('axios');
const { createCanvas } = require('@napi-rs/canvas');
const { messagingApi } = require('@line/bot-sdk');

function createRichMenuPNG(width = 2500, height = 843) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const mid = width / 2;

  // Left side — orange
  ctx.fillStyle = '#f39c12';
  ctx.fillRect(0, 0, mid, height);

  // Right side — purple
  ctx.fillStyle = '#8e44ad';
  ctx.fillRect(mid, 0, mid, height);

  // White divider
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mid - 3, 0, 6, height);

  // Semi-transparent overlay for depth
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, height - 80, mid - 3, 80);
  ctx.fillRect(mid + 3, height - 80, mid, 80);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Left icon: simple fruit circle
  const lx = mid / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(lx, height / 2 - 120, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 8;
  ctx.stroke();
  // leaf
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(lx + 30, height / 2 - 258, 40, 18, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  // price tag lines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = height / 2 - 145 + i * 38;
    const w = [80, 120, 60][i];
    ctx.beginPath();
    ctx.moveTo(lx - w / 2, y);
    ctx.lineTo(lx + w / 2, y);
    ctx.stroke();
  }

  // Left label
  ctx.font = 'bold 110px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ราคาวันนี้', lx, height / 2 + 120);

  // Right icon: star burst (promotion)
  const rx = mid + mid / 2;
  const starPoints = 8;
  const outerR = 130;
  const innerR = 65;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  for (let i = 0; i < starPoints * 2; i++) {
    const angle = (i * Math.PI) / starPoints - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(rx + r * Math.cos(angle), height / 2 - 120 + r * Math.sin(angle));
    else ctx.lineTo(rx + r * Math.cos(angle), height / 2 - 120 + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 8;
  ctx.stroke();
  // percent symbol
  ctx.font = 'bold 100px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('%', rx, height / 2 - 120);

  // Right label
  ctx.font = 'bold 110px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('โปรโมชั่น', rx, height / 2 + 120);

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
