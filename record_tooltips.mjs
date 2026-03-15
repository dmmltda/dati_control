import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

(async () => {
    // We launch Chromium.
    const browser = await chromium.launch({ headless: true });
    
    const context = await browser.newContext({
        viewport: { width: 500, height: 300 }, // 16:9 format
        deviceScaleFactor: 2, // HiDPI
        recordVideo: {
            dir: './assets',
            size: { width: 500, height: 300 }
        }
    });

    const page = await context.newPage();
    
    // Create a mock page based on index.html design
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Mock Record</title>
        <link rel="stylesheet" href="css/style.css">
        <link rel="stylesheet" href="src/css/variables.css">
        <link rel="stylesheet" href="src/css/base.css">
        <link rel="stylesheet" href="src/css/components.css">
        <link rel="stylesheet" href="src/css/layout.css">
        <script src="https://unpkg.com/@phosphor-icons/web"></script>
        <style>
            body { background: #141824; color: #cbd5e1; margin: 0; padding: 10px; font-family: 'Plus Jakarta Sans', sans-serif; }
            .company-table-container { border: none !important; box-shadow: none !important; background: transparent; }
            #fake-cursor {
                width: 14px; height: 14px; background: rgba(255, 255, 255, 0.9);
                border: 2px solid rgba(0, 0, 0, 0.6); border-radius: 50%;
                position: fixed; pointer-events: none; z-index: 999999;
                transition: top 0.15s ease-out, left 0.15s ease-out, transform 0.1s;
            }
            #fake-cursor::after {
                content: ''; position: absolute; width: 0; height: 0;
                border-style: solid; border-width: 10px 0 0 10px;
                border-color: transparent transparent transparent black;
                left: -2px; top: 12px; transform: rotate(-45deg);
            }
        </style>
    </head>
    <body>
        <div id="fake-cursor" style="left: 100px; top: 100px;"></div>
        <div class="company-table-container">
            <table class="company-table">
                <thead>
                    <tr>
                        <th class="sortable-header">
                            <div class="header-content">
                                <span>Empresa</span>
                                <button class="btn-filter-column"><i class="ph ph-funnel"></i></button>
                            </div>
                        </th>
                        <th class="sortable-header">
                            <div class="header-content">
                                <span>Status</span>
                                <button class="btn-filter-column"><i class="ph ph-funnel"></i></button>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="company-name-cell">
                                <div class="company-icon">A</div>
                                <div class="company-info">
                                    <span class="company-name" style="color: #f1f5f9; font-weight:600;">ABC Inovação S.A.</span>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge status-prospect">PROSPECT</span></td>
                    </tr>
                    <tr>
                        <td>
                            <div class="company-name-cell">
                                <div class="company-icon" style="background:#5B52F6;">S</div>
                                <div class="company-info">
                                    <span class="company-name" style="color: #f1f5f9; font-weight:600;">Schmersal Elétrica</span>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge" style="background:#5a1010;color:#ff8080;">INATIVO</span></td>
                    </tr>
                     <tr>
                        <td>
                            <div class="company-name-cell">
                                <div class="company-icon" style="background:#0F9D58;">F</div>
                                <div class="company-info">
                                    <span class="company-name" style="color: #f1f5f9; font-weight:600;">FIAP</span>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge" style="background:#1e3c23;color:#80ff80;">ATIVO</span></td>
                    </tr>
                </tbody>
            </table>
            <!-- Mock do popover -->
            <div id="mock-popover" class="filter-popover" style="position: absolute; left: 40px; top: 40px; display: none;">
                <div class="filter-header">Filtrar Empresa</div>
                <div class="filter-search-wrap">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" placeholder="Buscar..." class="filter-search-input">
                </div>
                <div class="filter-options-list">
                    <label class="filter-option-item">
                        <input type="checkbox" checked> <span>(Selecionar Tudo)</span>
                    </label>
                    <label class="filter-option-item">
                        <input type="checkbox" checked> <span>ABC Inovação S.A.</span>
                    </label>
                     <label class="filter-option-item">
                        <input type="checkbox" checked> <span>Schmersal Elétrica</span>
                    </label>
                </div>
            </div>
        </div>
        <script>
            window.addEventListener('mousemove', e => {
                const c = document.getElementById('fake-cursor');
                c.style.left = e.clientX + 'px';
                c.style.top = e.clientY + 'px';
            });
            window.addEventListener('mousedown', () => document.getElementById('fake-cursor').style.transform = 'scale(0.8) translateY(2px)');
            window.addEventListener('mouseup', () => document.getElementById('fake-cursor').style.transform = 'scale(1)');
        </script>
    </body>
    </html>
    `;

    // Write it to a temp file in the root directory so CSS paths work
    const fakeHtmlPath = path.join(process.cwd(), 'record-dummy.html');
    fs.writeFileSync(fakeHtmlPath, htmlContent, 'utf8');

    await page.goto('file://' + fakeHtmlPath, { waitUntil: 'load' });
    
    await page.waitForTimeout(1000); // stabilize UI
    
    // Animation routine via mouse methods
    await page.mouse.move(50, 20, { steps: 5 });
    await page.waitForTimeout(400);

    const filterBtnBounds = { x: 95, y: 22 };
    await page.mouse.move(filterBtnBounds.x, filterBtnBounds.y, { steps: 5 });
    await page.waitForTimeout(500);
    
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    
    await page.evaluate(() => {
        const pop = document.getElementById('mock-popover');
        pop.style.display = 'block';
    });
    await page.waitForTimeout(500);

    // move to input
    await page.mouse.move(95, 80, { steps: 5 });
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    
    await page.keyboard.type('ABC', { delay: 100 });
    await page.waitForTimeout(1000);
    
    // Close it
    await page.mouse.move(10, 10, { steps: 5 });
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.evaluate(() => {
        const pop = document.getElementById('mock-popover');
        pop.style.display = 'none';
    });
    
    await page.waitForTimeout(800);

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    console.log('Video saved precisely at:', videoPath);

    const assetsDir = path.resolve('assets');
    const targetNames = [
        'video_tooltip_main.webm', 
        'video_tooltip_nome.webm',
        'video_tooltip_status.webm',
        'video_tooltip_saude.webm',
        'video_tooltip_nps.webm',
        'video_tooltip_proximo.webm',
        'video_tooltip_produtos.webm',
        'video_tooltip_segmento.webm',
        'video_tooltip_act-import.webm',
        'video_tooltip_act-edit.webm',
        'video_tooltip_act-delete.webm',
        'video_tooltip_act-clear.webm'
    ];

    for(let name of targetNames) {
        fs.copyFileSync(videoPath, path.join(assetsDir, name));
    }
    fs.unlinkSync(videoPath);
    fs.unlinkSync(fakeHtmlPath);
    console.log('Finished distributing pristine .webm files!');
})();
