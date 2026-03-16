#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/ingest-test-results.js
 * Pós-processador de resultados de testes
 * ============================================================================
 * Uso:
 *   node scripts/ingest-test-results.js --input test-results.json --type UNITÁRIO
 *   node scripts/ingest-test-results.js --input playwright-results.json --type E2E
 *
 * Este script:
 *   1. Lê o JSON de output do Vitest (--reporter=json) ou Playwright
 *   2. Transforma no formato esperado pelo POST /api/test-runs
 *   3. Envia para a API local
 *   4. Imprime o resumo no terminal
 * ============================================================================
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_TOKEN = process.env.TEST_INGEST_TOKEN || ''; // Bearer opcional

// ─── Parsing de argumentos CLI -----------------------------------------------
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { input: null, type: 'UNITÁRIO', env: 'local', dry: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input')  opts.input = args[i + 1];
        if (args[i] === '--type')   opts.type  = args[i + 1];
        if (args[i] === '--env')    opts.env   = args[i + 1];
        if (args[i] === '--dry')    opts.dry   = true;
    }
    return opts;
}

// ─── Parser Vitest JSON -------------------------------------------------------
function parseVitest(raw) {
    const cases = [];
    const testFiles = raw.testResults || raw.files || [];
    let totalDuration = 0;

    for (const file of testFiles) {
        // Caminho completo do arquivo de teste (relativo ao projeto)
        const fullFilePath = file.name || file.filepath || 'unknown.test.js';
        const fileName = fullFilePath.split('/').pop();
        // Extrai módulo a partir do nome do arquivo (ex: "auth.test.js" -> "auth.js")
        const moduleName = fileName.replace(/\.test\.js$/, '.js');
        // Caminho relativo para exibição na UI (a partir de js/tests ou da raiz)
        const relPath = fullFilePath.includes('/js/') 
            ? fullFilePath.substring(fullFilePath.indexOf('/js/')+ 1)
            : fileName;

        const suites = file.assertionResults || file.tests || [];
        for (const t of suites) {
            const passed = t.status === 'passed' || t.state === 'passed';
            const skipped = t.status === 'skipped' || t.state === 'skipped';
            const failed = !passed && !skipped;

            const durationMs = t.duration || 0;
            totalDuration += durationMs;

            // Captura localização exata da falha (já presente no JSON do Vitest)
            const loc = t.location || null;

            cases.push({
                suite_file:     fileName,
                module:         moduleName,
                test_name:      t.fullName || t.name || t.title || '(sem nome)',
                suite_type:     'UNITÁRIO',
                status:         skipped ? 'IGNORADO' : (passed ? 'APROVADO' : 'REPROVADO'),
                duration_ms:    Math.round(durationMs),
                error_message:  failed ? (t.failureMessages?.[0] || t.message || 'Falha desconhecida') : null,
                error_stack:    failed ? (t.failureMessages?.join('\n') || null) : null,
                // Novos campos de localização
                location_file:  failed && loc ? relPath : null,
                location_line:  failed && loc ? (loc.line || null) : null,
                location_col:   failed && loc ? (loc.column || null) : null,
            });
        }
    }

    const totalMs = raw.totalTime ? Math.round(raw.totalTime) : totalDuration;
    return { cases, duration_ms: totalMs };
}

// ─── Parser Playwright JSON ---------------------------------------------------
function parsePlaywright(raw) {
    const cases = [];
    let totalDuration = 0;

    const suites = raw.suites || [];
    function extractFromSuite(suite, parentFile) {
        const file = suite.file || parentFile || 'unknown.spec.js';
        const moduleName = file.split('/').pop().replace(/\.spec\.js$/, '.js');
        const relFile = file.includes('/js/') ? file.substring(file.indexOf('/js/') + 1) : file.split('/').pop();

        for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
                const result = test.results?.[0] || {};
                const passed  = result.status === 'passed';
                const skipped = result.status === 'skipped';
                const failed  = !passed && !skipped;
                const durationMs = result.duration || 0;
                totalDuration += durationMs;

                // Localização via annotations ou erro
                const errLine = result.error?.location?.line || null;
                const errCol  = result.error?.location?.column || null;

                cases.push({
                    suite_file:     file.split('/').pop(),
                    module:         moduleName,
                    test_name:      spec.title || test.title || '(sem nome)',
                    suite_type:     'E2E',
                    status:         skipped ? 'IGNORADO' : (passed ? 'APROVADO' : 'REPROVADO'),
                    duration_ms:    Math.round(durationMs),
                    error_message:  failed ? (result.error?.message || 'E2E falhou') : null,
                    error_stack:    failed ? (result.error?.stack || null) : null,
                    screenshot_url: result.attachments?.find(a => a.contentType?.startsWith('image/'))?.path || null,
                    video_url:      result.attachments?.find(a => a.contentType?.startsWith('video/'))?.path || null,
                    // Localização
                    location_file:  failed && errLine ? relFile : null,
                    location_line:  failed ? errLine : null,
                    location_col:   failed ? errCol : null,
                });
            }
        }

        for (const child of suite.suites || []) {
            extractFromSuite(child, file);
        }
    }

    for (const suite of suites) extractFromSuite(suite, null);
    return { cases, duration_ms: totalDuration };
}

// ─── Principal ---------------------------------------------------------------
async function main() {
    const opts = parseArgs();

    if (!opts.input) {
        console.error('❌ Uso: node ingest-test-results.js --input <arquivo.json> --type UNITÁRIO|E2E');
        process.exit(1);
    }

    const filePath = resolve(opts.input);
    let raw;
    try {
        raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
        console.error(`❌ Erro ao ler arquivo ${filePath}:`, err.message);
        process.exit(1);
    }

    // Detecta o formato automaticamente
    let parsed;
    if (opts.type === 'E2E' || raw.suites) {
        parsed = parsePlaywright(raw);
    } else {
        parsed = parseVitest(raw);
    }

    const { cases, duration_ms } = parsed;
    const passed  = cases.filter(c => c.status === 'PASSOU').length;
    const failed  = cases.filter(c => c.status === 'FALHOU').length;
    const skipped = cases.filter(c => c.status === 'SKIPADO').length;

    console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou | ${skipped} skipado | Total: ${cases.length}`);
    console.log(`⏱  Duração total: ${(duration_ms / 1000).toFixed(2)}s\n`);

    if (opts.dry) {
        console.log('[dry-run] Payload que seria enviado:');
        console.log(JSON.stringify({ suite_type: opts.type, environment: opts.env, duration_ms, cases_count: cases.length }, null, 2));
        process.exit(0);
    }

    const payload = {
        suite_type:  opts.type,
        environment: opts.env,
        duration_ms,
        raw_output:  raw,
        cases,        // já inclui location_file, location_line, location_col
    };

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;

        const resp = await fetch(`${API_URL}/api/test-runs`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error(`❌ API respondeu ${resp.status}:`, text);
            process.exit(1);
        }

        const result = await resp.json();
        console.log(`✅ Execução salva! ID: ${result.id}`);
        console.log(`   Acesse o LOG em: http://localhost:8000 → Log → Log Testes`);
    } catch (err) {
        console.error('❌ Erro ao enviar para API:', err.message);
        process.exit(1);
    }
}

main();
