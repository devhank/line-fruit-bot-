'use strict';
const { messagingApi } = require('@line/bot-sdk');
const { getFruitPrices, formatPriceMessage } = require('./scraper');
const { savePriceSnapshot } = require('./firebase');

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

function buildTextMessage(text) {
  return { type: 'text', text };
}

async function broadcastFruitPrices() {
  const client = getClient();
  const data   = await getFruitPrices();

  await savePriceSnapshot(data.prices).catch(e =>
    console.warn('Firebase save skipped:', e.message)
  );

  const text    = formatPriceMessage(data);
  const message = buildTextMessage(text);
  await client.broadcast({ messages: [message] });
  console.log(`Broadcast sent — ${data.prices.length} รายการ`);
  console.log('\n── ข้อความที่ส่ง ──\n' + text + '\n───────────────────');
  return data;
}

async function multicastFruitPrices(userIds) {
  if (!userIds?.length) return;
  const client = getClient();
  const data   = await getFruitPrices();
  const message = buildTextMessage(formatPriceMessage(data));

  for (let i = 0; i < userIds.length; i += 500) {
    await client.multicast({ to: userIds.slice(i, i + 500), messages: [message] });
  }
  console.log(`Multicast sent to ${userIds.length} users`);
}

module.exports = { broadcastFruitPrices, multicastFruitPrices, buildTextMessage };
