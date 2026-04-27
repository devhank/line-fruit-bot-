const { messagingApi } = require('@line/bot-sdk');
const { scrapeFruitPrices } = require('./scraper');
const { savePriceSnapshot, getAllUserIds } = require('./firebase');

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

function formatDate() {
  return new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
}

function trendColor(trend) {
  if (trend === '↑') return '#e74c3c';
  if (trend === '↓') return '#27ae60';
  return '#7f8c8d';
}

function buildFlexMessage(prices) {
  const rows = prices.slice(0, 12).map((p) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: p.name,
        size: 'sm',
        color: '#2c3e50',
        flex: 3,
        weight: 'bold',
      },
      {
        type: 'text',
        text: p.unit,
        size: 'sm',
        color: '#7f8c8d',
        flex: 1,
        align: 'center',
      },
      {
        type: 'text',
        text: p.min === p.max ? `${p.min}` : `${p.min}-${p.max}`,
        size: 'sm',
        color: '#e67e22',
        flex: 2,
        align: 'end',
        weight: 'bold',
      },
      {
        type: 'text',
        text: p.trend || '→',
        size: 'sm',
        color: trendColor(p.trend),
        flex: 1,
        align: 'end',
      },
    ],
    paddingTop: '6px',
    paddingBottom: '6px',
  }));

  return {
    type: 'flex',
    altText: `ราคาผลไม้วันนี้ ${formatDate()}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🍑 ราคาผลไม้วันนี้',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
          },
          {
            type: 'text',
            text: formatDate(),
            size: 'sm',
            color: '#ffffffcc',
          },
        ],
        backgroundColor: '#f39c12',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ผลไม้', size: 'xs', color: '#95a5a6', flex: 3, weight: 'bold' },
              { type: 'text', text: 'หน่วย', size: 'xs', color: '#95a5a6', flex: 1, align: 'center', weight: 'bold' },
              { type: 'text', text: 'ราคา (บ.)', size: 'xs', color: '#95a5a6', flex: 2, align: 'end', weight: 'bold' },
              { type: 'text', text: ' ', size: 'xs', flex: 1 },
            ],
            paddingBottom: '8px',
          },
          { type: 'separator' },
          ...rows,
        ],
        paddingAll: '16px',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: prices[0]?._mock ? '* ข้อมูลประมาณการ' : 'ที่มา: ตลาดไท',
            size: 'xs',
            color: '#95a5a6',
            align: 'end',
          },
        ],
        paddingAll: '8px',
      },
    },
  };
}

async function broadcastFruitPrices() {
  const client = getClient();
  const prices = await scrapeFruitPrices();

  await savePriceSnapshot(prices).catch((e) =>
    console.warn('Firebase save skipped:', e.message)
  );

  const message = buildFlexMessage(prices);
  await client.broadcast({ messages: [message] });
  console.log(`Broadcast sent with ${prices.length} fruit prices`);
  return prices;
}

// Multicast to specific users (e.g. newly followed users)
async function multicastFruitPrices(userIds) {
  if (!userIds?.length) return;
  const client = getClient();
  const prices = await scrapeFruitPrices();
  const message = buildFlexMessage(prices);

  // LINE multicast supports max 500 recipients per call
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    await client.multicast({ to: chunk, messages: [message] });
  }
  console.log(`Multicast sent to ${userIds.length} users`);
}

module.exports = { broadcastFruitPrices, multicastFruitPrices, buildFlexMessage };
