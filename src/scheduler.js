const cron = require('node-cron');
const { buildDailyPrices } = require('./scraper');
const { setDailyCache }    = require('./firebase');
const { broadcastFruitPrices } = require('./broadcast');

const DAILY_BROADCAST = '0 7 * * *';

let scheduledTask = null;

// ─── Core daily job ───────────────────────────────────────────────────────────

async function runDailyJob() {
  console.log(`[${new Date().toISOString()}] Daily job starting...`);

  // 1. ค้นหาราคาทีละชนิด แล้วเก็บลง Firebase
  const { fruits, vegetables } = await buildDailyPrices();

  await setDailyCache('fruits', fruits).catch(e =>
    console.warn('Cache save (fruits) failed:', e.message)
  );
  await setDailyCache('vegetables', vegetables).catch(e =>
    console.warn('Cache save (vegetables) failed:', e.message)
  );

  // 2. Broadcast ใช้ข้อมูลที่เพิ่งเก็บ (getFruitPrices จะอ่าน cache)
  await broadcastFruitPrices();

  console.log('Daily job completed');
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function startScheduler() {
  if (scheduledTask) {
    console.warn('Scheduler already running');
    return;
  }

  scheduledTask = cron.schedule(
    DAILY_BROADCAST,
    async () => {
      try {
        await runDailyJob();
      } catch (err) {
        console.error('Daily job failed:', err.message);
      }
    },
    { timezone: 'Asia/Bangkok' }
  );

  console.log('Scheduler started — daily job at 07:00 Asia/Bangkok');
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler stopped');
  }
}

async function triggerNow() {
  console.log('Manual trigger — running daily job now');
  return runDailyJob();
}

function scheduleTest(delaySeconds = 10) {
  const fireAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  console.log(`[SCHEDULER TEST] Will fire at ${fireAt}`);
  setTimeout(async () => {
    console.log(`[SCHEDULER TEST] Firing now`);
    try {
      await runDailyJob();
      console.log('[SCHEDULER TEST] Completed ✓');
    } catch (e) {
      console.error('[SCHEDULER TEST] Failed:', e.message);
    }
  }, delaySeconds * 1000).unref();
  return fireAt;
}

function getSchedulerInfo() {
  return {
    expression:  DAILY_BROADCAST,
    timezone:    'Asia/Bangkok',
    description: 'Every day at 07:00 (Bangkok time)',
    running:     scheduledTask !== null,
  };
}

module.exports = { startScheduler, stopScheduler, triggerNow, scheduleTest, getSchedulerInfo };
