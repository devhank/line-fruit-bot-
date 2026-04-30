'use strict';
require('dotenv').config();

const GROUNDING_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// ─── Lists ────────────────────────────────────────────────────────────────────

const FRUIT_LIST = [
  'ทุเรียนหมอนทอง', 'ทุเรียนชะนี', 'มังคุด', 'เงาะโรงเรียน', 'ลำไย',
  'ลิ้นจี่', 'ลองกอง', 'มะม่วงน้ำดอกไม้', 'สับปะรด', 'กล้วยหอม',
];

const VEG_LIST = [
  'พริกขี้หนู', 'พริกจินดา', 'มะนาว', 'แตงกวา', 'มะเขือ',
  'กะหล่ำปลี', 'ผักบุ้ง', 'คะน้า', 'ต้นหอม', 'ผักชี',
];

const MOCK_FRUIT_PRICES = [
  { name: 'ทุเรียนหมอนทอง', price: '130-150', unit: 'บาท/กก.', trend: '→' },
  { name: 'มังคุด',          price: '80-100',  unit: 'บาท/กก.', trend: '↑' },
  { name: 'เงาะโรงเรียน',   price: '40-60',   unit: 'บาท/กก.', trend: '↓' },
  { name: 'ลำไย',            price: '50-70',   unit: 'บาท/กก.', trend: '→' },
  { name: 'ลิ้นจี่',         price: '70-90',   unit: 'บาท/กก.', trend: '↑' },
  { name: 'มะม่วงน้ำดอกไม้', price: '40-60',  unit: 'บาท/กก.', trend: '→' },
  { name: 'สับปะรด',         price: '15-25',   unit: 'บาท/กก.', trend: '↓' },
  { name: 'กล้วยหอม',        price: '25-35',   unit: 'บาท/หวี', trend: '→' },
];

const MOCK_VEG_PRICES = [
  { name: 'พริกขี้หนู', price: '60-80',  unit: 'บาท/กก.', trend: '→' },
  { name: 'พริกจินดา', price: '40-60',  unit: 'บาท/กก.', trend: '↑' },
  { name: 'มะนาว',     price: '20-30',  unit: 'บาท/กก.', trend: '→' },
  { name: 'แตงกวา',    price: '15-20',  unit: 'บาท/กก.', trend: '↓' },
  { name: 'มะเขือ',    price: '25-35',  unit: 'บาท/กก.', trend: '→' },
  { name: 'กะหล่ำปลี', price: '20-30',  unit: 'บาท/กก.', trend: '↓' },
  { name: 'ผักบุ้ง',   price: '15-25',  unit: 'บาท/กก.', trend: '→' },
  { name: 'คะน้า',     price: '20-30',  unit: 'บาท/กก.', trend: '↑' },
  { name: 'ต้นหอม',    price: '30-50',  unit: 'บาท/กก.', trend: '→' },
  { name: 'ผักชี',     price: '40-60',  unit: 'บาท/กก.', trend: '↑' },
];

// ─── Gemini Grounding ─────────────────────────────────────────────────────────

async function callGeminiGrounded(model, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1 },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 2000));
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        if (res.status === 429) throw Object.assign(new Error(msg), { quota: true });
        if (res.status === 503) { console.warn(`[${model}] overloaded (attempt ${attempt})`); continue; }
        throw new Error(msg);
      }

      const text    = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const sources = data.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(c => c.web?.title || c.web?.uri || '').filter(Boolean) || [];

      return { text, sources };
    } catch (err) {
      if (err.quota) throw err;
      if (attempt === 3) throw err;
      console.warn(`[${model}] attempt ${attempt} fail: ${err.message}`);
    }
  }
  throw new Error(`[${model}] หมด retry`);
}

// ─── Search ONE item ──────────────────────────────────────────────────────────

async function searchSinglePrice(name) {
  const prompt =
    `ค้นหาราคา${name}ในตลาดไทยวันนี้จากข่าวหรือแหล่งข้อมูลล่าสุด\n` +
    `ตอบเฉพาะ JSON object เดียว ไม่มีข้อความอื่น ไม่มี markdown:\n` +
    `{"name":"${name}","price":"ราคา","unit":"หน่วย","trend":"↑หรือ↓หรือ→","source":"แหล่งข่าว"}\n` +
    `ถ้าไม่พบข้อมูลวันนี้ ตอบว่า: null`;

  for (const model of GROUNDING_MODELS) {
    try {
      const { text, sources } = await callGeminiGrounded(model, prompt);
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      if (clean === 'null' || !clean) return null;
      const item = JSON.parse(clean);
      if (!item?.price || String(item.price) === 'null') return null;
      if (!item.source && sources.length) item.source = sources[0];
      // fix unit ที่ไม่มี "บาท" เช่น Gemini ตอบแค่ "กิโลกรัม"
      if (item.unit && !item.unit.includes('บาท')) item.unit = 'บาท/' + item.unit;
      return item;
    } catch (err) {
      if (err.quota) { console.warn(`  [${model}] quota=0`); continue; }
      console.warn(`  [${name}][${model}] ${err.message}`);
    }
  }
  return null;
}

// ─── Build daily prices — searches ALL items one by one ───────────────────────

async function buildDailyPrices() {
  const fruits     = [];
  const vegetables = [];

  console.log('\n🍍 ค้นหาราคาผลไม้ทีละชนิด...');
  for (const name of FRUIT_LIST) {
    process.stdout.write(`  🔍 ${name}... `);
    const item = await searchSinglePrice(name);
    if (item) {
      fruits.push(item);
      console.log(`✅ ${item.price} ${item.unit}${item.source ? ' [' + item.source + ']' : ''}`);
    } else {
      console.log('⚠️ ไม่พบ');
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  console.log('\n🥬 ค้นหาราคาผักทีละชนิด...');
  for (const name of VEG_LIST) {
    process.stdout.write(`  🔍 ${name}... `);
    const item = await searchSinglePrice(name);
    if (item) {
      vegetables.push(item);
      console.log(`✅ ${item.price} ${item.unit}${item.source ? ' [' + item.source + ']' : ''}`);
    } else {
      console.log('⚠️ ไม่พบ');
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  console.log(`\n📊 รวม: ผลไม้ ${fruits.length} รายการ, ผัก ${vegetables.length} รายการ`);
  return { fruits, vegetables, date: thaiDate() };
}

// ─── Public API — cache-first ─────────────────────────────────────────────────

async function getFruitPrices() {
  const date = thaiDate();
  try {
    const { getDailyCache } = require('./firebase');
    const cached = await getDailyCache('fruits');
    if (cached?.length) {
      console.log(`📦 ใช้ราคาผลไม้จาก cache วันนี้ (${cached.length} รายการ)`);
      return { prices: cached, date, sources: [], model: 'cache' };
    }
  } catch (e) {
    console.warn('Cache read failed:', e.message);
  }
  console.warn('⚠️ ไม่มี cache — ใช้ mock data');
  return { prices: MOCK_FRUIT_PRICES, date, sources: [], model: 'mock' };
}

async function getVegPrices() {
  const date = thaiDate();
  try {
    const { getDailyCache } = require('./firebase');
    const cached = await getDailyCache('vegetables');
    if (cached?.length) {
      console.log(`📦 ใช้ราคาผักจาก cache วันนี้ (${cached.length} รายการ)`);
      return { prices: cached, date, sources: [], model: 'cache' };
    }
  } catch (e) {
    console.warn('Cache read failed:', e.message);
  }
  console.warn('⚠️ ไม่มี cache — ใช้ mock data');
  return { prices: MOCK_VEG_PRICES, date, sources: [], model: 'mock' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thaiDate() {
  return new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', timeZone: 'Asia/Bangkok',
  });
}

// ─── Format ───────────────────────────────────────────────────────────────────

const FRUIT_EMOJI_MAP = {
  ทุเรียน: '🍈', มังคุด: '🟣', เงาะ: '🔴', ลำไย: '🟡',
  ลิ้นจี่: '🍒', ลองกอง: '🟤', มะม่วง: '🥭',
  สับปะรด: '🍍', กล้วย: '🍌', มะละกอ: '🧡',
};

const VEG_EMOJI_MAP = {
  พริก: '🌶️', มะนาว: '🍋', แตงกวา: '🥒', มะเขือ: '🍆',
  กะหล่ำ: '🥬', ผักบุ้ง: '🌿', คะน้า: '🥦', ต้นหอม: '🧅',
  ผักชี: '🌿',
};

function getEmoji(name, map) {
  for (const [key, emoji] of Object.entries(map)) {
    if (name.includes(key)) return emoji;
  }
  return '🌱';
}

function formatPriceMessage({ prices, date }) {
  const sep   = '─'.repeat(25);
  const lines = prices
    .map(p => `${getEmoji(p.name, FRUIT_EMOJI_MAP)} ${p.name}: ${p.price} ${p.unit} ${p.trend}`)
    .join('\n');
  return [
    `🌿 ราคาผลไม้วันนี้`,
    `📅 ${date}`,
    sep,
    lines,
    sep,
    `📰 ข้อมูลจากข่าวเกษตรไทย`,
    ``,
    `💊 ดูแลสวนให้ดี กดดูโปรโมชั่นปุ๋ยด้านล่าง ↓`,
  ].join('\n');
}

function formatVegMessage({ prices, date }) {
  const sep   = '─'.repeat(25);
  const lines = prices
    .map(p => `${getEmoji(p.name, VEG_EMOJI_MAP)} ${p.name}: ${p.price} ${p.unit} ${p.trend}`)
    .join('\n');
  return [
    `🥬 ราคาผักวันนี้`,
    `📅 ${date}`,
    sep,
    lines,
    sep,
    `📰 ข้อมูลจากข่าวเกษตรไทย`,
    ``,
    `💊 ดูแลสวนให้ดี กดดูโปรโมชั่นปุ๋ยด้านล่าง ↓`,
  ].join('\n');
}

module.exports = {
  buildDailyPrices,
  getFruitPrices,
  getVegPrices,
  formatPriceMessage,
  formatVegMessage,
  FRUIT_LIST,
  VEG_LIST,
};

// ─── CLI test ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  buildDailyPrices()
    .then(({ fruits, vegetables, date }) => {
      console.log('\n' + '='.repeat(40));
      console.log('ผลไม้:', fruits.map(p => `${p.name} ${p.price} ${p.unit}`).join(', '));
      console.log('ผัก:',   vegetables.map(p => `${p.name} ${p.price} ${p.unit}`).join(', '));
    })
    .catch(err => console.error('Fatal:', err.message));
}
