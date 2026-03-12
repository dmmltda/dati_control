/**
 * @file google-meet.js — Serviço de integração Google Meet + Google Drive
 *
 * Arquitetura:
 *  - Uma única Google Workspace Service Account como organizador universal.
 *  - Os usuários finais entram com qualquer conta Google — sem custo extra.
 *  - Feature totalmente degradável: se GOOGLE_SERVICE_ACCOUNT_JSON não existir,
 *    TODAS as funções retornam null silenciosamente.
 *
 * Scopes necessários:
 *  - https://www.googleapis.com/auth/meetings.space.created  (Meet API)
 *  - https://www.googleapis.com/auth/drive.readonly          (Drive API)
 */

import { google } from 'googleapis';

// ─── Configuração / Guard ─────────────────────────────────────────────────────

function _getCredentials() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
        console.error('[GoogleMeet] ❌ GOOGLE_SERVICE_ACCOUNT_JSON inválido — não é um JSON válido:', err.message);
        return null;
    }
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

/**
 * Inicializa e retorna o cliente GoogleAuth com os scopes necessários.
 * Retorna null se as credenciais não estiverem configuradas.
 */
export function getGoogleAuth() {
    const credentials = _getCredentials();
    if (!credentials) return null;

    try {
        return new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/meetings.space.created',
                'https://www.googleapis.com/auth/drive.readonly',
            ],
        });
    } catch (err) {
        console.error('[GoogleMeet] ❌ Erro ao criar GoogleAuth:', err.message);
        return null;
    }
}

// ─── Google Meet API ──────────────────────────────────────────────────────────

/**
 * Cria um Meeting Space via Google Meet REST API v2.
 *
 * @returns {Promise<{ meetingUri: string, name: string } | null>}
 *   meetingUri → "https://meet.google.com/xxx-xxx-xxx"
 *   name       → "spaces/xxxx" (ID interno — salvar em google_event_id)
 *
 * Retorna null se Google não estiver configurado.
 */
export async function createMeetingSpace() {
    const auth = getGoogleAuth();
    if (!auth) return null;

    try {
        const authClient = await auth.getClient();
        const token = await authClient.getAccessToken();

        // Usa fetch direto para a Meet REST API v2 (googleapis não tem SDK oficial ainda)
        const response = await fetch('https://meet.googleapis.com/v2/spaces', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[GoogleMeet] ❌ Erro ao criar Meeting Space (${response.status}):`, errBody);
            return null;
        }

        const space = await response.json();

        // space.meetingUri  = "https://meet.google.com/xxx-xxx-xxx"
        // space.name        = "spaces/xxxxx" (ID interno)
        console.log(`[GoogleMeet] ✅ Meeting Space criado: ${space.meetingUri} (${space.name})`);

        return {
            meetingUri: space.meetingUri,
            name: space.name,
        };
    } catch (err) {
        console.error('[GoogleMeet] ❌ Erro inesperado ao criar Meeting Space:', err.message);
        return null;
    }
}

// ─── Google Drive API ─────────────────────────────────────────────────────────

/**
 * Busca no Google Drive gravações associadas a um Meeting Space.
 *
 * O Google Meet salva gravações no Drive com o nome do meeting code no arquivo.
 * Ex: "Recording - meet.google.com/xxx-xxx-xxx - ..."
 *
 * @param {string} meetingSpaceName  — "spaces/xxxx" (o google_event_id salvo na atividade)
 * @returns {Promise<Array<{ id: string, name: string, webViewLink: string, mimeType: string, size: number }>>}
 *
 * Retorna [] se Google não estiver configurado ou nenhuma gravação encontrada.
 */
export async function findRecordingsForSpace(meetingSpaceName) {
    const auth = getGoogleAuth();
    if (!auth || !meetingSpaceName) return [];

    // Extrai o meeting code do nome do space: "spaces/abc-XXXX" → parte do URI
    // O nome do arquivo no Drive geralmente contém o meeting code (xxx-xxx-xxx)
    const meetCode = meetingSpaceName.split('/').pop(); // ex: "abc-1234-xyz"

    try {
        const drive = google.drive({ version: 'v3', auth });

        // Busca de gravações — o Google Meet salva com mimeType video/mp4
        // e geralmente inclui "Meet" ou o código da reunião no nome
        const folderId = process.env.GOOGLE_DRIVE_RECORDINGS_FOLDER_ID;
        let query = `mimeType = 'video/mp4' and trashed = false`;
        if (meetCode) {
            query += ` and name contains '${meetCode}'`;
        }
        if (folderId) {
            query += ` and '${folderId}' in parents`;
        }

        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name, webViewLink, mimeType, size)',
            orderBy: 'createdTime desc',
            pageSize: 10,
        });

        const files = res.data.files || [];

        if (files.length > 0) {
            console.log(`[GoogleMeet] ✅ ${files.length} gravação(ões) encontrada(s) para ${meetingSpaceName}`);
        }

        return files.map(f => ({
            id: f.id,
            name: f.name,
            webViewLink: f.webViewLink,
            mimeType: f.mimeType,
            size: parseInt(f.size || '0'),
        }));
    } catch (err) {
        console.error(`[GoogleMeet] ❌ Erro ao buscar gravações no Drive para ${meetingSpaceName}:`, err.message);
        return [];
    }
}

/**
 * Faz download de um arquivo do Google Drive e retorna o Buffer.
 *
 * @param {string} fileId — ID do arquivo no Drive
 * @returns {Promise<Buffer | null>}
 */
export async function downloadDriveFile(fileId) {
    const auth = getGoogleAuth();
    if (!auth || !fileId) return null;

    try {
        const drive = google.drive({ version: 'v3', auth });

        const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        return Buffer.from(res.data);
    } catch (err) {
        console.error(`[GoogleMeet] ❌ Erro ao baixar arquivo ${fileId} do Drive:`, err.message);
        return null;
    }
}
