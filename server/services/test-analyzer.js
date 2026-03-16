/**
 * ============================================================================
 * server/services/test-analyzer.js
 * Serviço de Análise Automática de Falhas de Testes
 * ============================================================================
 * Responsável por:
 *   1. Receber test_cases com status FALHOU/ERRO
 *   2. Ler o código-fonte real do arquivo testado
 *   3. Enviar para Gemini API com prompt estruturado
 *   4. Salvar ai_analysis + fix_proposal + fix_status no banco
 *   5. Aplicar correções aprovadas (applyFix)
 * ============================================================================
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Raiz do projeto (dois níveis acima de server/services/)
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ─── Categorias de falha que a IA pode identificar ──────────────────────────
const TIPOS_FALHA = [
    'MISMATCH_VALOR',        // expect(X).toBe(Y) — valores diferentes
    'MISMATCH_NOME',         // propriedade/função com nome errado
    'EXPORT_AUSENTE',        // função não exportada
    'MOCK_FALTANDO',         // dependência não mockada no teste
    'DEPENDENCIA_EXTERNA',   // lib não instalada ou não disponível no env de teste
    'LOGICA_NEGOCIO',        // regra de negócio divergente entre código e teste
    'LADO_ERRADO',           // teste correto, prod errado (ou vice-versa)
    'OUTRO',
];

// ─── Lê conteúdo de arquivo do projeto de forma segura ──────────────────────
function readProjectFile(relativePath) {
    if (!relativePath) return null;
    try {
        const fullPath = resolve(PROJECT_ROOT, relativePath);
        // Segurança: garante que o arquivo está dentro do projeto
        if (!fullPath.startsWith(PROJECT_ROOT)) return null;
        if (!existsSync(fullPath)) return null;
        return readFileSync(fullPath, 'utf-8');
    } catch {
        return null;
    }
}

// ─── Deriva o caminho do módulo de produção a partir do arquivo de teste ─────
function deriveModulePath(locationFile, moduleName) {
    if (!moduleName) return null;
    // ex: "js/tests/unit/config.test.js" → "js/modules/config.js"
    if (locationFile?.includes('tests/unit/')) {
        return locationFile.replace('tests/unit/', 'modules/').replace('.test.js', '.js');
    }
    if (locationFile?.includes('tests/functional/')) {
        return locationFile.replace('tests/functional/', 'modules/').replace('.test.js', '.js');
    }
    return `js/modules/${moduleName}`;
}

// ─── Chama a API do Gemini ───────────────────────────────────────────────────
async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Gemini API ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Gemini retornou resposta vazia');

    return JSON.parse(rawText);
}

// ─── Analisa uma falha individual ────────────────────────────────────────────
async function analyzeOneFailure(tc) {
    const modulePath  = deriveModulePath(tc.location_file, tc.module);
    const moduleCode  = readProjectFile(modulePath);
    const testCode    = readProjectFile(tc.location_file);

    // Extrai o trecho de código próximo à linha que falhou (±10 linhas)
    let codeSnippet = '';
    if (moduleCode && tc.location_line) {
        const lines = moduleCode.split('\n');
        const st = Math.max(0, (tc.location_line - 1) - 10);
        const en = Math.min(lines.length, (tc.location_line - 1) + 10);
        codeSnippet = lines.slice(st, en).map((l, i) => `${st + i + 1}: ${l}`).join('\n');
    } else if (moduleCode) {
        codeSnippet = moduleCode.slice(0, 2000);
    }

    let testSnippet = '';
    if (testCode && tc.location_line) {
        const lines = testCode.split('\n');
        const st = Math.max(0, (tc.location_line - 1) - 5);
        const en = Math.min(lines.length, (tc.location_line - 1) + 5);
        testSnippet = lines.slice(st, en).map((l, i) => `${st + i + 1}: ${l}`).join('\n');
    }

    const prompt = `Você é um engenheiro sênior de software analisando uma falha de teste automático.

TESTE QUE FALHOU:
- Arquivo de teste: ${tc.location_file || tc.suite_file || 'desconhecido'}
- Linha: ${tc.location_line || 'desconhecida'}
- Nome do teste: ${tc.test_name}
- Status: ${tc.status}

MENSAGEM DE ERRO:
${tc.error_message || '(sem mensagem)'}

STACK TRACE:
${tc.error_stack ? tc.error_stack.slice(0, 800) : '(sem stack)'}

TRECHO DO ARQUIVO DE TESTE (ao redor da linha ${tc.location_line || '?'}):
\`\`\`js
${testSnippet || '(não disponível)'}
\`\`\`

CÓDIGO DO MÓDULO SENDO TESTADO (${modulePath || 'desconhecido'}):
\`\`\`js
${codeSnippet || '(não disponível)'}
\`\`\`

Analise a falha e responda APENAS com um JSON válido neste formato exato:
{
  "causa_raiz": "Uma frase curta descrevendo a causa raiz",
  "tipo_falha": "um dos: ${TIPOS_FALHA.join(' | ')}",
  "descricao_pt": "Explicação completa em português, 2-4 frases, clara e objetiva para um dev",
  "confianca": 0.0,
  "lado_com_problema": "teste | codigo | ambos",
  "fix_possivel": true,
  "fix_arquivo": "caminho relativo do arquivo a corrigir (ex: js/modules/config.js) ou null",
  "fix_linha_ini": 1,
  "fix_linha_fim": 1,
  "fix_before": "linha(s) atual(is) exata(s) que devem ser substituídas",
  "fix_after": "linha(s) nova(s) que substituem as anteriores",
  "fix_descricao": "Explicação da correção em português"
}

Regras:
- confianca entre 0.0 e 1.0
- Se fix_possivel=false, os campos fix_* podem ser null
- fix_before e fix_after devem ser o conteúdo exato das linhas (sem números de linha)
- Prefira corrigir o código de produção (fix_arquivo aponta para js/modules/) exceto se o teste estiver claramente errado`;

    return await callGemini(prompt);
}

// ─── API Pública: analyzeFailures ────────────────────────────────────────────
/**
 * Analisa múltiplos test_cases com falha e salva os resultados no banco.
 * Executa em background (não deve ser awaited pelo caller).
 *
 * @param {Array} failedCases - test_cases com status FALHOU | ERRO
 * @param {PrismaClient} prisma
 */
export async function analyzeFailures(failedCases, prisma) {
    console.log(`[test-analyzer] 🔍 Analisando ${failedCases.length} falha(s) com Gemini...`);

    for (const tc of failedCases) {
        try {
            // Marcar como "processando"
            await prisma.test_cases.update({
                where: { id: tc.id },
                data: { fix_status: 'pending' }
            });

            const result = await analyzeOneFailure(tc);

            // Monta o ai_analysis salvo no banco
            const aiAnalysis = JSON.stringify({
                causa_raiz:        result.causa_raiz || 'Não identificada',
                tipo_falha:        result.tipo_falha || 'OUTRO',
                descricao_pt:      result.descricao_pt || '',
                confianca:         result.confianca || 0,
                lado_com_problema: result.lado_com_problema || 'ambos',
            });

            // Monta o fix_proposal se disponível
            let fixProposal = null;
            if (result.fix_possivel && result.fix_arquivo && result.fix_before && result.fix_after) {
                fixProposal = JSON.stringify({
                    arquivo:    result.fix_arquivo,
                    linha_ini:  result.fix_linha_ini,
                    linha_fim:  result.fix_linha_fim,
                    before:     result.fix_before,
                    after:      result.fix_after,
                    descricao:  result.fix_descricao || '',
                });
            }

            await prisma.test_cases.update({
                where: { id: tc.id },
                data: {
                    ai_analysis:  aiAnalysis,
                    fix_proposal: fixProposal,
                    fix_status:   fixProposal ? 'pending' : null,
                }
            });

            console.log(`[test-analyzer] ✅ ${tc.suite_file} → ${result.tipo_falha} (confiança: ${Math.round((result.confianca || 0) * 100)}%)`);
        } catch (err) {
            console.warn(`[test-analyzer] ⚠️ Falha ao analisar "${tc.test_name}":`, err.message);
            // Não propaga — análise é best-effort
        }
    }

    console.log(`[test-analyzer] 🏁 Análise concluída.`);
}

// ─── API Pública: applyFix ───────────────────────────────────────────────────
/**
 * Aplica a correção proposta no arquivo real do projeto.
 * Cria backup antes de modificar.
 *
 * @param {{ arquivo, linha_ini, linha_fim, before, after }} proposal
 * @returns {{ ok: boolean, error?: string, backupPath?: string }}
 */
export async function applyFix(proposal) {
    try {
        const { arquivo, before, after } = proposal;
        if (!arquivo || !before || after === undefined) {
            return { ok: false, error: 'Proposta de fix incompleta (faltam campos obrigatórios)' };
        }

        const fullPath = resolve(PROJECT_ROOT, arquivo);
        // Segurança: garante que o arquivo está dentro do projeto
        if (!fullPath.startsWith(PROJECT_ROOT)) {
            return { ok: false, error: 'Caminho de arquivo inválido (fora do projeto)' };
        }
        if (!existsSync(fullPath)) {
            return { ok: false, error: `Arquivo não encontrado: ${arquivo}` };
        }

        // Cria backup
        const backupDir = join(PROJECT_ROOT, 'tmp', 'test-fix-backups');
        const timestamp = Date.now();
        mkdirSync(backupDir, { recursive: true });
        const backupPath = join(backupDir, `${arquivo.replace(/\//g, '_')}.${timestamp}.bak`);
        copyFileSync(fullPath, backupPath);

        // Lê o arquivo atual
        const originalContent = readFileSync(fullPath, 'utf-8');

        // Substitui o conteúdo (substitui a primeira ocorrência exata)
        if (!originalContent.includes(before)) {
            return { ok: false, error: `Conteúdo "before" não encontrado no arquivo. O código pode ter mudado desde a análise.` };
        }

        const newContent = originalContent.replace(before, after);
        writeFileSync(fullPath, newContent, 'utf-8');

        console.log(`[test-analyzer] 💾 Fix aplicado: ${arquivo} (backup: ${backupPath})`);
        return { ok: true, backupPath };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
