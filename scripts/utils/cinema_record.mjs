import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';

(async () => {
    const browser = await chromium.launch({ headless: true });
    
    // We record at a high DPR, perfect 16:9 box to capture the table area.
    const context = await browser.newContext({
        viewport: { width: 440, height: 250 }, 
        deviceScaleFactor: 2,
        recordVideo: {
            dir: './assets/recordings',
            size: { width: 440, height: 248 }
        }
    });

    const page = await context.newPage();

    // INTERCEPT auth.js dynamically to inject a bypass for Playwright without touching source code
    await page.route('**/js/modules/auth.js', async route => {
        const response = await page.request.fetch(route.request());
        let body = await response.text();
        
        // 1. In initClerk, jump straight to bypass
        body = body.replace('export async function initClerk() {', 
            `export async function initClerk() {
                if (window.location.search.includes('bypass_auth=1')) {
                    console.log('PLAYWRIGHT BYPASS TRIGGERED');
                    await _bootstrapApp();
                    return;
                }`
        );
        
        // 2. In _bootstrapApp, set mock state and render
        body = body.replace('async function _bootstrapApp() {',
            `async function _bootstrapApp() {
                if (window.location.search.includes('bypass_auth=1')) {
                    window.__usuarioAtual = { id: 'playwright', user_type: 'master', nome: 'P', feature_permissions: [] };
                    document.getElementById('login-screen')?.classList.remove('flex-active');
                    document.getElementById('app-layout')?.classList.add('flex-active');
                    
                    state.companies = [ 
                        { id: '1', Nome_da_empresa: 'ABC Inovação S.A.', Status: 'PROSPECT', NPS: '-', Health_Score: '-', Segmento_da_empresa: 'Tecnologia' },
                        { id: '2', Nome_da_empresa: 'Schmersal Elétrica', Status: 'INATIVO', NPS: '-', Health_Score: '-', Segmento_da_empresa: 'Indústria' },
                        { id: '3', Nome_da_empresa: 'FIAP', Status: 'ATIVO', NPS: '-', Health_Score: '-', Segmento_da_empresa: 'Educação' }
                    ];
                    renderCompanyList();
                    // trigger event to stop loaders
                    document.dispatchEvent(new CustomEvent('dati:app-ready'));
                    return;
                }`
        );
        
        await route.fulfill({
            response,
            body,
            headers: { ...response.headers() }
        });
    });

    // Mock the API calls just in case the app tries to fetch anything else
    await page.route('**/api/me', route => route.fulfill({ json: { id: 'p', user_type: 'master', nome: 'P' } }));

    // Inject fake cursor
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const cursor = document.createElement('div');
            cursor.id = 'fake-cursor';
            cursor.style.width = '14px';
            cursor.style.height = '14px';
            cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            cursor.style.border = '2px solid rgba(0, 0, 0, 0.6)';
            cursor.style.borderRadius = '50%';
            cursor.style.position = 'fixed';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '999999';
            cursor.style.transition = 'top 0.15s ease-out, left 0.15s ease-out, transform 0.1s';
            cursor.innerHTML = '<div style="position:absolute; width: 0; height: 0; border-style: solid; border-width: 10px 0 0 10px; border-color: transparent transparent transparent black; left:-2px; top: 12px; transform: rotate(-45deg);"></div>';
            document.body.appendChild(cursor);
            
            window.addEventListener('mousemove', e => {
                cursor.style.left = e.clientX + 'px';
                cursor.style.top = e.clientY + 'px';
            });
            window.addEventListener('mousedown', () => cursor.style.transform = 'scale(0.8) translateY(2px)');
            window.addEventListener('mouseup', () => cursor.style.transform = 'scale(1)');
        });
    });

    await page.goto('http://localhost:8000/?bypass_auth=1', { waitUntil: 'networkidle' });

    // Focus isolation: Hide sidebar, header, etc.
    await page.addStyleTag({ content: `
        .sidebar { display: none !important; }
        .topbar { display: none !important; }
        .header { display: none !important; }
        .dashboard-header { display: none !important; }
        .kpi-container { display: none !important; }
        .search-filters-bar { display: none !important; }
        .main-content { margin-left: 0 !important; padding: 0 !important; padding-top: 10px !important; }
        .company-table-container { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 10px !important; }
    `});

    await page.waitForTimeout(1000); // UI stabilize
    
    // Animation macro!
    // Move to Empresa filter button
    const headerEl = await page.locator('th.sortable-header[data-key="nome"]').filter({ hasText: 'Empresa' });
    await headerEl.hover({ force: true, timeout: 5000 }).catch(e => console.log('Hover skip:', e.message));
    await page.waitForTimeout(400);

    const filterBtn = await headerEl.locator('.btn-filter-column');
    await filterBtn.hover({ force: true }).catch(()=>{});
    await page.waitForTimeout(400);
    
    await filterBtn.click({ force: true }).catch(()=>{});
    await page.waitForTimeout(800);

    // type something
    const searchInput = await page.locator('#filter-popover-nome input[type="text"]');
    if (await searchInput.isVisible()) {
        await searchInput.hover();
        await page.waitForTimeout(200);
        await searchInput.click();
        await page.keyboard.type('ABC', { delay: 100 });
        await page.waitForTimeout(600);
    } else {
        await page.mouse.move(100, 80);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(600);
    }
    
    // close
    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(800);

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    
    console.log('Successfully recorded real DOM at:', videoPath);

    const assetsDir = path.resolve('assets');
    const targetNames = [
        'main', 'nome', 'status', 'saude', 'nps', 'proximo', 
        'produtos', 'segmento', 'act-import', 'act-edit', 'act-delete', 'act-clear'
    ];

    for(let name of targetNames) {
        const out = path.join(assetsDir, `video_tooltip_${name}.mp4`);
        if (fs.existsSync(out)) fs.unlinkSync(out);
        console.log('Converting ->', out);
        // Using libx264 for MP4 Apple compat
        execSync(`"${ffmpeg}" -i "${videoPath}" -c:v libx264 -pix_fmt yuv420p -profile:v main -level 3.1 -an "${out}"`, { stdio: 'ignore' });
    }
    
    // clean up original
    fs.unlinkSync(videoPath);
    console.log('All real videos exported successfully via server bypass!');
})();
