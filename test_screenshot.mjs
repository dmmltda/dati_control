import { chromium } from '@playwright/test';

(async () => {
    const browser = await chromium.launch({ headless: true });
    
    const context = await browser.newContext({
        viewport: { width: 500, height: 300 },
        deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    try {
        await page.goto('http://localhost:8000', { waitUntil: 'load' });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test_shot.png' });
        console.log('Saved test_shot.png');
    } catch(e) {
        console.error(e);
    }
    
    await browser.close();
})();
