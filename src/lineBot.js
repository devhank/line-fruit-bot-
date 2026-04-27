const { middleware, messagingApi } = require('@line/bot-sdk');
const { scrapeFruitPrices } = require('./scraper');
const { buildFlexMessage } = require('./broadcast');
const { saveUser, getLatestPrices } = require('./firebase');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const webhookMiddleware = middleware({ channelSecret: lineConfig.channelSecret });

function getClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: lineConfig.channelAccessToken,
  });
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleFollow(event) {
  const client = getClient();
  try {
    const profile = await client.getProfile(event.source.userId);
    await saveUser(profile.userId, profile.displayName).catch(() => {});
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `สวัสดีครับ คุณ${profile.displayName} 🍑\nยินดีต้อนรับสู่บอทราคาผลไม้!\nพิมพ์ "ราคา" เพื่อดูราคาผลไม้ล่าสุด`,
        },
      ],
    });
  } catch (err) {
    console.error('handleFollow error:', err.message);
  }
}

async function handleMessage(event) {
  if (event.message.type !== 'text') return;
  const client = getClient();
  const text = event.message.text.trim().toLowerCase();

  const priceKeywords = ['ราคา', 'price', 'fruit', 'ผลไม้', 'วันนี้'];
  const helpKeywords = ['help', 'ช่วยเหลือ', 'วิธีใช้', 'menu', 'เมนู'];

  try {
    if (priceKeywords.some((k) => text.includes(k))) {
      const prices = (await getLatestPrices().catch(() => null)) || (await scrapeFruitPrices());
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildFlexMessage(prices)],
      });
    } else if (helpKeywords.some((k) => text.includes(k))) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: '📋 วิธีใช้งาน\n\n• พิมพ์ "ราคา" → ดูราคาผลไม้วันนี้\n• บอทจะส่งราคาให้อัตโนมัติทุกเช้า 07:00 น.\n\nข้อมูลจาก: ตลาดไท',
          },
        ],
      });
    } else {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'พิมพ์ "ราคา" เพื่อดูราคาผลไม้ล่าสุด 🍑',
          },
        ],
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
    if (data === 'action=price') {
      const prices = (await getLatestPrices().catch(() => null)) || (await scrapeFruitPrices());
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildFlexMessage(prices)],
      });
    } else if (data === 'action=promotion') {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: '🎉 โปรโมชั่นพิเศษวันนี้\n\n🍑 ซื้อมังคุด 1 กก. แถมเงาะ 500 กรัม\n🍈 ทุเรียนหมอนทอง ราคาพิเศษ 180 บ./กก.\n🍇 องุ่นเขียวนำเข้า ลดราคา 20%\n\n📞 สั่งซื้อ: โทร 02-XXX-XXXX',
          },
        ],
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
    events.map((event) => {
      switch (event.type) {
        case 'follow':
          return handleFollow(event);
        case 'message':
          return handleMessage(event);
        case 'postback':
          return handlePostback(event);
        default:
          return Promise.resolve();
      }
    })
  );
}

// ─── Rich menu ────────────────────────────────────────────────────────────────

async function setupRichMenu() {
  const client = getClient();

  const richMenu = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Fruit Bot Menu',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: { type: 'postback', label: 'ราคาวันนี้', data: 'action=price' },
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: { type: 'message', label: 'ช่วยเหลือ', text: 'help' },
      },
    ],
  };

  try {
    const { richMenuId } = await client.createRichMenu({ richMenu });
    await client.setDefaultRichMenu(richMenuId);
    console.log('Rich menu created:', richMenuId);
    return richMenuId;
  } catch (err) {
    console.warn('Rich menu setup skipped:', err.message);
    return null;
  }
}

module.exports = { webhookMiddleware, handleWebhook, setupRichMenu };
