'use strict';
require('dotenv').config();

// Models ordered by preference — gemini-2.0-flash first (user request), fallback to 2.5-x
const GROUNDING_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const FRUIT_LIST = [
  'ทุเรียนหมอนทอง',
  'ทุเรียนชะนี',
  'มังคุด',
  'เงาะโรงเรียน',
  'ลำไย',
  'ลิ้นจี่',
  'ลองกอง',
  'มะม่วงน้ำดอกไม้',
  'สับปะรด',
  'กล้วยหอม',
];

const MOCK_PRICES = [
  { name: 'ทุเรียนหมอนทอง', price: '130-150', unit: 'บาท/กก.', trend: '→' },
  { name: 'มังคุด',          price: '80-100',  unit: 'บาท/กก.', trend: '↑' },
  { name: 'เงาะโรงเรียน',   price: '40-60',   unit: 'บาท/กก.', trend: '↓' },
  { name: 'ลำไย',            price: '50-70',   unit: 'บาท/กก.', trend: '→' },
  { name: 'ลิ้นจี่',         price: '70-90',   unit: 'บาท/กก.', trend: '↑' },
  { name: 'มะม่วงน้ำดอกไม้', price: '40-60',  unit: 'บาท/กก.', trend: '→' },
  { name: 'สับปะรด',         price: '15-25',   unit: 'บาท/กก.', trend: '↓' },
  { name: 'กล้วยหอม',        price: '25-35',   unit: 'บาท/หวี', trend: '→' },
];

// ─── Gemini v1beta + Google Search Grounding ─────────────────────────────────

function buildPricePrompt() {
  return (
    `คุณเป็นผู้เชี่ยวชาญด้านราคาผลไม้ไทย ค้นหาราคาผลไม้จากแหล่งข่าวล่าสุด\n\n` +
    `กฎสำคัญ:\n` +
    `1. ตอบเฉพาะ JSON array เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown\n` +
    `2. ถ้าหาราคาไม่เจอให้ข้ามผลไม้นั้น\n` +
    `3. ราคาใส่เป็น string เช่น "130-150" หรือ "150"\n` +
    `4. trend: "↑" ราคาขึ้น, "↓" ราคาลง, "→" ทรงตัว\n` +
    `5. unit ใส่หน่วยจริง เช่น "บาท/กก." หรือ "บาท/ลูก"\n` +
    `6. source ใส่ชื่อแหล่งข่าว เช่น "ตลาดไท" หรือ "กรมส่งเสริมการเกษตร"\n\n` +
    `ผลไม้ที่ต้องการ: ${FRUIT_LIST.join(', ')}\n\n` +
    `ตัวอย่าง output:\n` +
    `[{"name":"ทุเรียนหมอนทอง","price":"130-150","unit":"บาท/กก.","trend":"↓","source":"ตลาดไท"}]\n\n` +
    `ราคาผลไม้ไทยในตลาดวันนี้คือเท่าไหร่`
  );
}

async function callGeminiWithGrounding(model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_api_key_here') throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: buildPricePrompt() }] }],
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

// ─── Step 1: Grounded search ──────────────────────────────────────────────────

async function fetchPricesWithGrounding() {
  for (const model of GROUNDING_MODELS) {
    try {
      console.log(`🔍 กำลังค้นหาราคาผลไม้ด้วย Gemini (${model}) + Google Search...`);
      const { text, sources } = await callGeminiWithGrounding(model);
      const prices = parseJson(text);
      console.log(`✅ ได้ราคา ${prices.length} รายการ จาก ${model}`);
      return { prices, sources, model };
    } catch (err) {
      if (err.quota) {
        console.warn(`[${model}] quota=0 — ข้ามไปยัง model ถัดไป`);
        continue;
      }
      console.warn(`[${model}] ล้มเหลว: ${err.message}`);
    }
  }
  return null;
}

// ─── Step 2: Main ─────────────────────────────────────────────────────────────

async function getFruitPrices() {
  console.log('🍍 เริ่มดึงราคาผลไม้ด้วย Google Search Grounding...');

  const result = await fetchPricesWithGrounding();

  const date = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', timeZone: 'Asia/Bangkok',
  });

  if (result) {
    return { prices: result.prices, date, sources: result.sources, model: result.model };
  }

  console.warn('⚠️ Grounding ล้มเหลวทุก model — ใช้ mock data');
  return { prices: MOCK_PRICES, date, sources: [], model: 'mock' };
}

// ─── Step 3: Format ───────────────────────────────────────────────────────────

const EMOJI_MAP = {
  ทุเรียน: '🍈', มังคุด: '🟣', เงาะ: '🔴', ลำไย: '🟡',
  ลิ้นจี่: '🍒', ลองกอง: '🟤', มะม่วง: '🥭',
  สับปะรด: '🍍', กล้วย: '🍌', มะละกอ: '🧡',
};

function getEmoji(name) {
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (name.includes(key)) return emoji;
  }
  return '🍎';
}

function formatPriceMessage({ prices, date }) {
  const sep   = '─'.repeat(25);
  const lines = prices
    .map(p => `${getEmoji(p.name)} ${p.name}: ${p.price} ${p.unit} ${p.trend}`)
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

module.exports = { getFruitPrices, formatPriceMessage };

// ─── CLI test ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  getFruitPrices()
    .then(data => {
      console.log('\n' + '='.repeat(40));
      console.log(formatPriceMessage(data));
      console.log('='.repeat(40));
      console.log('\nraw prices:');
      data.prices.forEach(p =>
        console.log(`  ${p.name}: ${p.price} ${p.unit} ${p.trend}${p.source ? ' [' + p.source + ']' : ''}`)
      );
      if (data.sources?.length) {
        console.log('\ngrounding sources:', data.sources.slice(0, 5));
      }
      console.log('model used:', data.model);
    })
    .catch(err => console.error('Fatal:', err.message));
}
