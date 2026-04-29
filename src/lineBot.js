const { middleware, messagingApi } = require('@line/bot-sdk');
const { getFruitPrices, getVegPrices, formatPriceMessage, formatVegMessage } = require('./scraper');
const { buildTextMessage } = require('./broadcast');
const { saveUser, getLatestPrices } = require('./firebase');

function getMiddleware() {
  return middleware({ channelSecret: process.env.LINE_CHANNEL_SECRET });
}

function webhookMiddleware(req, res, next) {
  return getMiddleware()(req, res, next);
}

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

const PROMOTION_TEXT =
  `🌿 โปรโมชั่นพิเศษเดือนนี้\n` +
  `🧪 VAMAX + CABMAX ชุดคู่ราคาพิเศษ\n` +
  `ธาตุอาหารรวม 7 ชนิด + แคลเซียม-โบรอน\n` +
  `✅ ผลใหญ่ ผิวสวย ไม่แตก ไม่ร่วง\n` +
  `💰 ราคาพิเศษสำหรับสมาชิก LINE นี้\n` +
  `📦 ส่ง COD ทั่วประเทศ\n` +
  `📲 สั่งซื้อ: m.me/cabmax999`;

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleFollow(event) {
  const client = getClient();
  try {
    const profile = await client.getProfile(event.source.userId);
    await saveUser(profile.userId, profile.displayName).catch(() => {});
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: `สวัสดีครับ คุณ${profile.displayName} 🍑\nยินดีต้อนรับสู่บอทราคาผลไม้!\nพิมพ์ "ราคา" เพื่อดูราคาผลไม้ล่าสุด`,
      }],
    });
  } catch (err) {
    console.error('handleFollow error:', err.message);
  }
}

async function handleMessage(event) {
  if (event.message.type !== 'text') return;
  const client = getClient();
  const text = event.message.text.trim().toLowerCase();

  const fruitKeywords = ['ราคา', 'price', 'fruit', 'ผลไม้', 'วันนี้'];
  const vegKeywords   = ['ผัก', 'veg', 'vegetable'];
  const helpKeywords  = ['help', 'ช่วยเหลือ', 'วิธีใช้', 'menu', 'เมนู'];

  try {
    if (vegKeywords.some(k => text.includes(k))) {
      const data = await getVegPrices();
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildTextMessage(formatVegMessage(data))],
      });
    } else if (fruitKeywords.some(k => text.includes(k))) {
      const cachedPrices = await getLatestPrices().catch(() => null);
      const data = cachedPrices
        ? { prices: cachedPrices, date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Bangkok' }) }
        : await getFruitPrices();
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildTextMessage(formatPriceMessage(data))],
      });
    } else if (helpKeywords.some(k => text.includes(k))) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '📋 วิธีใช้งาน\n\n• พิมพ์ "ราคา" → ดูราคาผลไม้วันนี้\n• พิมพ์ "ผัก" → ดูราคาผักวันนี้\n• บอทจะส่งราคาให้อัตโนมัติทุกเช้า 07:00 น.',
        }],
      });
    } else {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'พิมพ์ "ราคา" เพื่อดูราคาผลไม้ หรือ "ผัก" เพื่อดูราคาผัก 🍑' }],
      });
    }
  } catch (err) {
    console.error('handleMessage error:', err.message);
  }
}

async function handlePostback(event) {
  const client = getClient();
  const { data } = event.postback;

  try {
    if (data === 'action=fruit_prices' || data === 'action=price') {
      const cachedPrices = await getLatestPrices().catch(() => null);
      const priceData = cachedPrices
        ? { prices: cachedPrices, date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Bangkok' }) }
        : await getFruitPrices();
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildTextMessage(formatPriceMessage(priceData))],
      });

    } else if (data === 'action=veg_prices') {
      const vegData = await getVegPrices();
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildTextMessage(formatVegMessage(vegData))],
      });

    } else if (data === 'action=promotion') {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: PROMOTION_TEXT }],
      });
    }
  } catch (err) {
    console.error('handlePostback error:', err.message);
  }
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  res.sendStatus(200);
  const events = req.body.events || [];
  await Promise.all(
    events.map(event => {
      switch (event.type) {
        case 'follow':   return handleFollow(event);
        case 'message':  return handleMessage(event);
        case 'postback': return handlePostback(event);
        default:         return Promise.resolve();
      }
    })
  );
}

module.exports = { webhookMiddleware, handleWebhook };
