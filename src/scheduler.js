const cron = require('node-cron');
const { broadcastFruitPrices } = require('./broadcast');

// Runs every day at 07:00 Bangkok time
const DAILY_BROADCAST = '0 7 * * *';

let scheduledTask = null;

function startScheduler() {
  if (scheduledTask) {
    console.warn('Scheduler already running');
    return;
  }

  scheduledTask = cron.schedule(
    DAILY_BROADCAST,
    async () => {
      console.log(`[${new Date().toISOString()}] Daily broadcast starting...`);
      try {
        await broadcastFruitPrices();
        console.log('Daily broadcast completed');
      } catch (err) {
        console.error('Daily broadcast failed:', err.message);
      }
    },
    { timezone: 'Asia/Bangkok' }
  );

  console.log('Scheduler started — daily broadcast at 07:00 Asia/Bangkok');
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler stopped');
  }
}

// Allow manual trigger from admin endpoint
async function triggerNow() {
  console.log('Manual broadcast triggered');
  return broadcastFruitPrices();
}

// Schedule a test run N seconds from now — verifies the job logic works
function scheduleTest(delaySeconds = 10) {
  const fireAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  console.log(`[SCHEDULER TEST] Will fire at ${fireAt}`);

  setTimeout(async () => {
    console.log(`[SCHEDULER TEST] Firing now (${new Date().toISOString()})`);
    try {
      await broadcastFruitPrices();
      console.log('[SCHEDULER TEST] Completed successfully ✓');
    } catch (e) {
      console.error('[SCHEDULER TEST] Failed:', e.message);
    }
  }, delaySeconds * 1000).unref();

  return fireAt;
}

// Returns info about the current cron configuration
function getSchedulerInfo() {
  return {
    expression: DAILY_BROADCAST,
    timezone: 'Asia/Bangkok',
    description: 'Every day at 07:00 (Bangkok time)',
    running: scheduledTask !== null,
  };
}

module.exports = { startScheduler, stopScheduler, triggerNow, scheduleTest, getSchedulerInfo };
