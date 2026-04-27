const axios = require('axios');
const cheerio = require('cheerio');

const MOCK_PRICES = [
  { name: 'ทุเรียน', unit: 'กก.', min: 150, max: 200, trend: '↑' },
  { name: 'มังคุด', unit: 'กก.', min: 80, max: 120, trend: '→' },
  { name: 'เงาะ', unit: 'กก.', min: 30, max: 50, trend: '↓' },
  { name: 'ลำไย', unit: 'กก.', min: 40, max: 65, trend: '↑' },
  { name: 'มะม่วง', unit: 'กก.', min: 35, max: 70, trend: '→' },
  { name: 'สับปะรด', unit: 'ลูก', min: 15, max: 25, trend: '↓' },
  { name: 'กล้วยหอม', unit: 'หวี', min: 20, max: 35, trend: '→' },
  { name: 'ส้มเขียวหวาน', unit: 'กก.', min: 30, max: 50, trend: '↑' },
  { name: 'แตงโม', unit: 'กก.', min: 10, max: 18, trend: '↓' },
  { name: 'องุ่น', unit: 'กก.', min: 80, max: 150, trend: '→' },
];

const SCRAPE_URL = 'https://www.talaadthai.com/th/price';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
};

function parsePrice(text) {
  const cleaned = text.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parsePriceRange(text) {
  const parts = text.split(/[-–]/);
  if (parts.length >= 2) {
    return { min: parsePrice(parts[0]), max: parsePrice(parts[1]) };
  }
  const single = parsePrice(text);
  return { min: single, max: single };
}

async function scrapeFromTalaadthai() {
  const res = await axios.get(SCRAPE_URL, { timeout: 12000, headers: HEADERS });
  const $ = cheerio.load(res.data);
  const prices = [];

  // Try common table patterns on the site
  $('table tr, .price-table tr, .product-price tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const name = $(cells[0]).text().trim();
    const unit = $(cells[1]).text().trim() || 'กก.';
    const priceText = $(cells[2]).text().trim();

    if (!name || !priceText) return;
    const { min, max } = parsePriceRange(priceText);
    if (!min) return;

    prices.push({ name, unit, min, max, trend: '→' });
  });

  // Fallback: look for any element containing Thai price patterns
  if (prices.length === 0) {
    $('[class*="price"], [class*="Price"]').each((_, el) => {
      const parent = $(el).closest('tr, li, .item, .row');
      const nameEl = parent.find('[class*="name"], [class*="Name"], td:first-child');
      const name = nameEl.first().text().trim();
      const priceText = $(el).text().trim();
      if (!name || !priceText) return;
      const { min, max } = parsePriceRange(priceText);
      if (!min) return;
      prices.push({ name, unit: 'กก.', min, max, trend: '→' });
    });
  }

  return prices;
}

async function scrapeFruitPrices() {
  try {
    const prices = await scrapeFromTalaadthai();
    if (prices.length > 0) {
      console.log(`Scraped ${prices.length} prices from talaadthai.com`);
      return prices;
    }
    throw new Error('No prices parsed from page');
  } catch (err) {
    console.warn(`Scrape failed (${err.message}), using mock data`);
    return MOCK_PRICES.map((p) => ({
      ...p,
      _mock: true,
      date: new Date().toISOString().slice(0, 10),
    }));
  }
}

module.exports = { scrapeFruitPrices, MOCK_PRICES };
