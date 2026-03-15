import PgBoss from 'pg-boss';
import { processNotificationJob } from './notification-worker.js';
import { runGabiTestRoutine } from './gabi-test.js';

const boss = new PgBoss(process.env.DATABASE_URL);

boss.on('error', error => console.error('[pg-boss] Error:', error));

export async function initQueue() {
    await boss.start();
    console.log('[pg-boss] Queue started');

    await boss.work('send-notification', { teamSize: 20 }, async job => {
        try {
            await processNotificationJob(job.data);
        } catch (err) {
            console.error('[notification-worker] Job failed:', err.message);
            throw err; // pg-boss will retry
        }
    });

    // START TESTE 30 MIN GABI
    await boss.schedule('gabi-test-routine', '*/30 * * * *');
    await boss.work('gabi-test-routine', async () => {
        try {
            await runGabiTestRoutine();
        } catch (e) {
            console.error('[gabi-test] Job wrapper falhou:', e.message);
        }
    });
}

export { boss };
