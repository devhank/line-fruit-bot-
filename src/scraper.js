'use strict';
require('dotenv').config();

// Models ordered by preference — gemini-2.0-flash first, fallback to 2.5-x
const GROUNDING_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// ─── Fruit data ───────────────────────────────────────────────────────────────

const FRUIT_LIST = [
  'ทุเรียนหมอนทอง', 'ทุเรียนชะนี', 'มังคุด', 'เงาะโรงเรียน', 'ลำไย',
  'ลิ้นจี่', 'ลองกอง', 'มะม่วงน้ำดอกไม้', 'สับปะรด', 'กล้วยหอม',
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

// ─── Veg data ─────────────────────────────────────────────────────────────────

const VEG_LIST = [
  'พริกขี้หนู', 'พริกจินดา', 'มะนาว', 'แตงกวา', 'มะเขือ',
  'กะหล่ำปลี', 'ผักบุ้ง', 'คะน้า', 'ต้นหอม', 'ผักชี',
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

// ─── Gemini v1beta + Google Search Grounding ─────────────────────────────────

function buildPrompt(list, type) {
  return (
    `คุณเป็นผู้เชี่ยวชาญด้านราคา${type}ไทย ค้นหาราคาจากแหล่งข่าวล่าสุด\n\n` +
    `กฎสำคัญ:\n` +
    `1. ตอบเฉพาะ JSON array เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown\n` +
    `2. ถ้าหาราคาไม่เจอให้ข้ามรายการนั้น\n` +
    `3. ราคาใส่เป็น string เช่น "130-150" หรือ "150"\n` +
    `4. trend: "↑" ราคาขึ้น, "↓" ราคาลง, "→" ทรงตัว\n` +
    `5. unit ใส่หน่วยจริง เช่น "บาท/กก." หรือ "บาท/มัด"\n` +
    `6. source ใส่ชื่อแหล่งข่าว เช่น "ตลาดไท" หรือ "กรมการค้าภายใน"\n\n` +
    `รายการที่ต้องการ: ${list.join(', ')}\n\n` +
    `ตัวอย่าง output:\n` +
    `[{"name":"ทุเรียนหมอนทอง","price":"130-150","unit":"บาท/กก.","trend":"↓","source":"ตลาดไท"}]\n\n` +
    `ราคา${type}ไทยในตลาดวันนี้คือเท่าไหร่`
  );
}

async function callGeminiGrounded(model, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_api_key_here') throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า');

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

      const text         = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const hasGrounding = !!data.candidates?.[0]?.groundingMetadata;
      const sources      = data.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(c => c.web?.title || c.web?.uri || '')
        .filter(Boolean) || [];

      console.log(`✅ Gemini (${model}) ตอบแล้ว — grounding=${hasGrounding}, sources=${sources.length}`);
      return { text, sources };
    } catch (err) {
      if (err.quota) throw err;
      if (attempt === 3) throw err;
      console.warn(`[${model}] attempt ${attempt} fail: ${err.message}`);
    }
  }
  throw new Error(`[${model}] หมด retry`);
}

function parseJson(text) {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const prices = JSON.parse(clean);
  if (!Array.isArray(prices) || prices.length === 0) throw new Error('empty array');
  return prices;
}

async function fetchWithGrounding(list, type) {
  const prompt = buildPrompt(list, type);
  for (const model of GROUNDING_MODELS) {
    try {
      console.log(`🔍 กำลังค้นหาราคา${type}ด้วย Gemini (${model}) + Google Search...`);
      const { text, sources } = await callGeminiGrounded(model, prompt);
      const prices = parseJson(text);
      console.log(`✅ ได้ราคา ${prices.length} รายการ จาก ${model}`);
      return { prices, sources, model };
    } catch (err) {
      if (err.quota) { console.warn(`[${model}] quota=0 — ข้ามไปยัง model ถัดไป`); continue; }
      console.warn(`[${model}] ล้มเหลว: ${err.message}`);
    }
  }
  return null;
}

function thaiDate() {
  return new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', timeZone: 'Asia/Bangkok',
  });
}

// ─── getFruitPrices ───────────────────────────────────────────────────────────

async function getFruitPrices() {
  console.log('🍍 เริ่มดึงราคาผลไม้ด้วย Google Search Grounding...');
  const result = await fetchWithGrounding(FRUIT_LIST, 'ผลไม้');
  const date   = thaiDate();
  if (result) return { prices: result.prices, date, sources: result.sources, model: result.model };
  console.warn('⚠️ Grounding ล้มเหลวทุก model — ใช้ mock data');
  return { prices: MOCK_FRUIT_PRICES, date, sources: [], model: 'mock' };
}

// ─── getVegPrices ─────────────────────────────────────────────────────────────

async function getVegPrices() {
  console.log('🥬 เริ่มดึงราคาผักด้วย Google Search Grounding...');
  const result = await fetchWithGrounding(VEG_LIST, 'ผัก');
  const date   = thaiDate();
  if (result) return { prices: result.prices, date, sources: result.sources, model: result.model };
  console.warn('⚠️ Grounding ล้มเหลวทุก model — ใช้ mock data');
  return { prices: MOCK_VEG_PRICES, date, sources: [], model: 'mock' };
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

module.exports = { getFruitPrices, getVegPrices, formatPriceMessage, formatVegMessage };

// ─── CLI test ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  const type = process.argv[2] === 'veg' ? 'veg' : 'fruit';
  const fn   = type === 'veg' ? getVegPrices : getFruitPrices;
  const fmt  = type === 'veg' ? formatVegMessage : formatPriceMessage;
  fn()
    .then(data => {
      console.log('\n' + '='.repeat(40));
      console.log(fmt(data));
      console.log('='.repeat(40));
      console.log('\nraw prices:');
      data.prices.forEach(p =>
        console.log(`  ${p.name}: ${p.price} ${p.unit} ${p.trend}${p.source ? ' [' + p.source + ']' : ''}`)
      );
      console.log('model used:', data.model);
    })
    .catch(err => console.error('Fatal:', err.message));
}
