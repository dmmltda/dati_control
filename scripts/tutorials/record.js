#!/usr/bin/env node
/**
 * ============================================================================
 * Tutorial Recorder — Journey CRM
 * scripts/tutorials/record.js
 * ============================================================================
 * Usa Playwright para abrir o app localmente, executar cada tutorial definido
 * em tutorials.config.js e exportar os vídeos em assets/tutorials/.
 *
 * Uso:
 *   npm run record-tutorials                  → grava todos
 *   npm run record-tutorials filtro-empresas  → grava apenas um
 *
 * Pré-requisitos:
 *   1. npm run dev   (servidor em http://localhost:3001 ou PORT definido)
 *   2. Usuário de teste configurado em js/tests/e2e/fixtures/.env.e2e
 *      TEST_USER_MASTER_EMAIL=seu@email.com
 *      TEST_USER_MASTER_PASSWORD=suaSenha
 * ============================================================================
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { TUTORIALS } from './tutorials.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const AUTH_FILE = path.join(ROOT, 'js/tests/e2e/fixtures/.auth/master.json');
const BASE_URL  = process.env.BASE_URL || 'http://localhost:3001';

// ─── Caminho do perfil Chrome do usuário (reutiliza cookies/Clerk session) ───
// macOS: ~/Library/Application Support/Google/Chrome/Default
const CHROME_USER_DATA = process.env.CHROME_USER_DATA ||
  path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome');

// CSS para tornar o cursor visível no vídeo gravado
const CURSOR_CSS = `
  *, *::before, *::after { cursor: none !important; }
  #pw-cursor {
    position: fixed;
    width: 18px; height: 24px;
    pointer-events: none;
    z-index: 2147483647;
    transform: translate(-2px, -2px);
    filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));
    transition: transform 0.06s ease;
  }
  #pw-cursor.clicking { transform: translate(-2px, -2px) scale(0.85); }
`;

const CURSOR_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24">
    <path d="M0 0 L0 20 L5 15 L8 22 L11 21 L8 14 L14 14 Z"
          fill="white" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
  </svg>
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[record] ${msg}`); }
function err(msg) { console.error(`[record] ❌ ${msg}`); }

async function injectCursor(page) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate((svg) => {
    const el = document.createElement('div');
    el.id = 'pw-cursor';
    el.innerHTML = svg;
    document.body.appendChild(el);
    document.addEventListener('mousemove', (e) => {
      el.style.left = e.clientX + 'px';
      el.style.top  = e.clientY + 'px';
    });
    document.addEventListener('mousedown', () => el.classList.add('clicking'));
    document.addEventListener('mouseup',   () => el.classList.remove('clicking'));
  }, CURSOR_SVG);
}

async function executarPassos(page, passos) {
  for (const passo of passos) {
    log(`  → ${passo.acao}${passo.seletor ? ' ' + passo.seletor : ''}${passo.texto ? ' "' + passo.texto + '"' : ''}`);

    switch (passo.acao) {

      case 'navegar':
        await page.goto(BASE_URL + (passo.destino || '/'));
        break;

      case 'aguardar':
        await page.waitForTimeout(passo.ms || 500);
        break;

      case 'aguardar_sel':
        try {
          await page.waitForSelector(passo.seletor, { timeout: passo.timeout || 5000 });
        } catch {
          log(`    ⚠️  Seletor não encontrado: ${passo.seletor} (continuando...)`);
        }
        break;

      case 'mover_mouse':
        await page.mouse.move(passo.x, passo.y, { steps: 20 });
        break;

      case 'mover_mouse_para': {
        try {
          const el = page.locator(passo.seletor).first();
          const box = await el.boundingBox();
          if (box) {
            const ox = passo.offset?.x || 0;
            const oy = passo.offset?.y || 0;
            await page.mouse.move(
              box.x + box.width  / 2 + ox,
              box.y + box.height / 2 + oy,
              { steps: 30 }
            );
          }
        } catch {
          log(`    ⚠️  Não encontrou elemento para mover: ${passo.seletor}`);
        }
        break;
      }

      case 'clicar':
        try {
          await page.click(passo.seletor, { delay: 80 });
        } catch {
          log(`    ⚠️  Não clicou: ${passo.seletor}`);
        }
        break;

      case 'clicar_texto': {
        try {
          const itens = await page.locator(passo.seletor).all();
          for (const item of itens) {
            const txt = await item.textContent();
            if (txt && txt.toLowerCase().includes(passo.texto.toLowerCase())) {
              const box = await item.boundingBox();
              if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
                await page.waitForTimeout(300);
                await item.click({ delay: 80 });
              }
              break;
            }
          }
        } catch {
          log(`    ⚠️  Não encontrou item com texto: ${passo.texto}`);
        }
        break;
      }

      case 'digitar':
        try {
          await page.fill(passo.seletor, '');
          await page.type(passo.seletor, passo.texto, { delay: 80 });
        } catch {
          log(`    ⚠️  Não digitou em: ${passo.seletor}`);
        }
        break;

      case 'scroll':
        await page.mouse.wheel(0, passo.delta || 300);
        await page.waitForTimeout(200);
        break;

      case 'pressionar':
        await page.keyboard.press(passo.tecla || 'Escape');
        break;

      default:
        log(`    ⚠️  Ação desconhecida: ${passo.acao}`);
    }
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function login(page, context) {
  await page.goto(BASE_URL);

  // Verifica se já está logado (app-layout visível)
  const jaLogado = await page.locator('#app-layout').isVisible().catch(() => false);
  if (jaLogado) {
    log('  ✅ Já autenticado — continuando');
    return;
  }

  // Se tem sessão salva do Playwright, ela já foi carregada via storageState no context
  // Se chegou aqui, provavelmente não havia sessão
  log('');
  log('  ─────────────────────────────────────────────────────────');
  log('  👤 AÇÃO NECESSÁRIA: Faça login no browser que abriu agora');
  log('     URL: ' + BASE_URL);
  log('     Aguardando até 2 minutos...');
  log('  ─────────────────────────────────────────────────────────');

  try {
    // Aguarda até 2 minutos para o usuário logar
    await page.waitForSelector('#app-layout', { timeout: 120000 });
    log('  ✅ Login detectado!');

    // Salva a sessão para próximas execuções
    const authDir = path.dirname(AUTH_FILE);
    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: AUTH_FILE });
    log('  💾 Sessão salva — próximas gravações serão automáticas');

  } catch {
    err('Timeout: Login não detectado em 2 minutos.');
    throw new Error('Login falhou');
  }
}

// ─── Gravador principal ───────────────────────────────────────────────────────

async function gravarTutorial(tutorial) {
  log(`\n📹 Gravando: ${tutorial.id}`);
  log(`   Destino: ${tutorial.saida}`);

  const saidaAbs = path.join(ROOT, tutorial.saida);
  fs.mkdirSync(path.dirname(saidaAbs), { recursive: true });

  const vp = tutorial.viewport || { width: 1280, height: 800 };

  const browser = await chromium.launch({
    headless: false,   // sempre visível — você vê o que está sendo gravado
    args: ['--no-sandbox', '--start-maximized'],
  });

  const contextOpts = {
    viewport: vp,
    deviceScaleFactor: 2,   // resolução Retina
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    recordVideo: { dir: path.dirname(saidaAbs), size: vp },
  };

  // Se tem sessão salva de run anterior, reutiliza
  if (fs.existsSync(AUTH_FILE)) {
    log('  Sessão anterior encontrada — carregando...');
    contextOpts.storageState = AUTH_FILE;
  }

  const context = await browser.newContext(contextOpts);
  const page    = await context.newPage();

  try {
    await login(page, context);   // interativo na 1ª vez, automático depois
    await injectCursor(page);

    log('  ▶ Executando passos...');
    await executarPassos(page, tutorial.passos);
    await page.waitForTimeout(800);

  } catch (e) {
    err(`Erro durante gravação de "${tutorial.id}": ${e.message}`);
  } finally {
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();

    if (videoPath && fs.existsSync(videoPath)) {
      fs.renameSync(videoPath, saidaAbs);
      log(`  ✅ Vídeo salvo: ${tutorial.saida}`);
    } else {
      err(`Vídeo não foi gerado: ${tutorial.id}`);
    }
  }
}


// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const filtro = process.argv[2]; // Ex: npm run record-tutorials filtro-empresas

  const lista = filtro
    ? TUTORIALS.filter(t => t.id === filtro)
    : TUTORIALS;

  if (lista.length === 0) {
    err(`Nenhum tutorial encontrado${filtro ? ' com id "' + filtro + '"' : ''}`);
    process.exit(1);
  }

  log(`🎬 Tutorial Recorder — Journey CRM`);
  log(`   Base URL: ${BASE_URL}`);
  log(`   Tutoriais: ${lista.map(t => t.id).join(', ')}\n`);

  for (const tutorial of lista) {
    await gravarTutorial(tutorial);
  }

  log('\n✅ Gravação concluída!');
  log('   Arquivos gerados em assets/tutorials/');
  log('   Próximo passo: atualize a tooltip no index.html para usar <video> em vez de <canvas>');
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
