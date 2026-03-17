// Testa modelos Gemini Vision usando server/.env
import { readFileSync } from 'fs';

// Lê server/.env
const envContent = readFileSync('server/.env', 'utf-8');
const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
    return m?.[1]?.trim() || '';
};

const apiKey  = getEnv('GEMINI_API_KEY');
const dbUrl   = getEnv('DATABASE_URL');

console.log('API Key:', apiKey ? `${apiKey.substring(0,12)}...` : 'NÃO ENCONTRADA');
console.log('DB URL :', dbUrl ? `${dbUrl.substring(0,30)}...` : 'não encontrado');

if (!apiKey) process.exit(1);

// Imagem 1x1 PNG base64 puro
const MINI_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const MODELS = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
];

console.log('\n=== Testando visão (inlineData) ===\n');
for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const r = await fetch(url, {
            method: 'POST', signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [
                    { inlineData: { mimeType: 'image/png', data: MINI_PNG } },
                    { text: 'This is a 1x1 pixel image. Respond with exactly: "I can see the image." in Portuguese.' }
                ]}],
                generationConfig: { maxOutputTokens: 80 }
            })
        });
        clearTimeout(t);
        if (r.ok) {
            const d = await r.json();
            const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '(vazio)';
            const block = d.candidates?.[0]?.finishReason || 'OK';
            console.log(`✅ [${r.status}] ${model}`);
            console.log(`   Resposta: "${text.trim().substring(0, 150)}"`);
            console.log(`   finishReason: ${block}\n`);
        } else {
            const err = await r.json().catch(() => ({}));
            const msg = err?.error?.message || JSON.stringify(err).substring(0, 120);
            console.log(`❌ [${r.status}] ${model}: ${msg}\n`);
        }
    } catch(e) {
        clearTimeout(t);
        console.log(`⏱ ${model}: ${e.name === 'AbortError' ? 'TIMEOUT (20s)' : e.message.substring(0,80)}\n`);
    }
}
