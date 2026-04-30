'use strict';
const { messagingApi } = require('@line/bot-sdk');
const { getFruitPrices, getVegPrices, formatPriceMessage, formatVegMessage } = require('./scraper');
const { savePriceSnapshot } = require('./firebase');

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

function buildTextMessage(text) {
  return { type: 'text', text };
}

// ส่งราคาผลไม้ + ผักในครั้งเดียว (2 ข้อความ)
async function broadcastDailyPrices() {
  const client = getClient();

  const [fruitData, vegData] = await Promise.all([
    getFruitPrices(),
    getVegPrices(),
  ]);

  await savePriceSnapshot(fruitData.prices).catch(e =>
    console.warn('Firebase save skipped:', e.message)
  );

  const messages = [
    buildTextMessage(formatPriceMessage(fruitData)),
    buildTextMessage(formatVegMessage(vegData)),
  ];

  await client.broadcast({ messages });
  console.log(`Broadcast sent — ผลไม้ ${fruitData.prices.length} รายการ, ผัก ${vegData.prices.length} รายการ`);
  return { fruitData, vegData };
}

// เหลือไว้สำหรับ backward compat (admin endpoint เดิม)
async function broadcastFruitPrices() {
  return broadcastDailyPrices();
}

async function multicastFruitPrices(userIds) {
  if (!userIds?.length) return;
  const client = getClient();
  const [fruitData, vegData] = await Promise.all([getFruitPrices(), getVegPrices()]);
  const messages = [
    buildTextMessage(formatPriceMessage(fruitData)),
    buildTextMessage(formatVegMessage(vegData)),
  ];
  for (let i = 0; i < userIds.length; i += 500) {
    await client.multicast({ to: userIds.slice(i, i + 500), messages });
  }
  console.log(`Multicast sent to ${userIds.length} users`);
}

module.exports = { broadcastDailyPrices, broadcastFruitPrices, multicastFruitPrices, buildTextMessage };
