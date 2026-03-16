import { Channel, SenderType, SentimentLevel, Message } from './types'

// ── Limiares de tempo de resposta por canal e tipo de remetente ──
// Valores em minutos. "green" = bom, "yellow" = aceitável, acima = vermelho.
export const RESPONSE_TIME_THRESHOLDS = {
  email: {
    gabi:   { green: 2,    yellow: 10    },  // automático — acima de 10min é falha
    user:   { green: 120,  yellow: 480   },  // até 2h = ótimo, até 8h = ok, acima = ruim
    client: { engaged: 60, normal: 1440, cold: 2880 }  // engajamento do cliente
  },
  whatsapp: {
    gabi:   { green: 0.5,  yellow: 2     },  // esperado em segundos, limiar em minutos
    user:   { green: 30,   yellow: 120   },
    client: { engaged: 15, normal: 240,  cold: 480  }
  },
  proposal: {
    gabi:   { green: 5,    yellow: 30    },
    user:   { green: 240,  yellow: 1440  },
    client: { engaged: 240, normal: 4320, cold: 10080 }
  }
}

// ── Mapa de sentimentos — 5 níveis ──
export const SENTIMENT_MAP = {
  very_positive: {
    label: 'Muito positivo',
    color: '#1a9e6e',
    description: 'Elogio explícito, agradecimento, confirmação entusiasmada'
  },
  positive: {
    label: 'Positivo',
    color: '#34d399',
    description: 'Resposta objetiva confirmatória, sem fricção'
  },
  neutral: {
    label: 'Neutro',
    color: '#d4911a',
    description: 'Pergunta simples, solicitação sem carga emocional'
  },
  negative: {
    label: 'Negativo',
    color: '#f97316',
    description: 'Insatisfação implícita, tom de cobrança, urgência'
  },
  very_negative: {
    label: 'Crítico',
    color: '#e05454',
    description: 'Reclamação explícita, ameaça de cancelamento, raiva'
  }
}

// ── Regras de escalação ──
// Quando shouldEscalate=true, GABI não responde sozinha — notifica humano
export const ESCALATION_RULES = {
  triggers: ['negative', 'very_negative'] as SentimentLevel[],
  action: 'notify_human',
  // bloqueia o botão "GABI responder" e insere evento de escalação na timeline
  blockAutoReply: true
}

// ── Cores dos remetentes ──
export const SENDER_COLORS = {
  gabi:   { bg: '#8b5cf6', label: 'G' },  // roxo
  user:   { bg: '#5b73f8', label: 'U' },  // azul
  client: { bg: '#1a2030', label: 'C', border: true }  // cinza escuro com borda
}

// ── Utilitários exportados ──

// Retorna a cor semântica do tempo de resposta
/**
 * getResponseTimeColor
 * Determina a cor semântica com base nos limiares de tempo
 */
export function getResponseTimeColor(
  channel: Channel,
  sender: SenderType,
  minutes: number
): 'green' | 'yellow' | 'red' {
  // @ts-ignore - Indexing thresholds
  const channelThresholds = RESPONSE_TIME_THRESHOLDS[channel];
  if (!channelThresholds) return 'red';

  const thresholds = channelThresholds[sender];
  if (!thresholds || typeof thresholds.green === 'undefined') return 'green'; // Fail-safe for client engaged/normal/cold logic

  if (minutes <= thresholds.green) return 'green';
  if (minutes <= thresholds.yellow) return 'yellow';
  return 'red';
}

// Formata o tempo em string legível: "2 min", "1h 30min", "2 dias"
export function formatResponseTime(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMins = Math.floor(minutes % 60);

  if (hours < 24) {
    return `${hours}h${remainingMins > 0 ? ` ${remainingMins}m` : ''}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// Retorna o sentimento predominante de uma thread
export function getDominantSentiment(messages: Message[]): SentimentLevel {
  const scores: Record<SentimentLevel, number> = {
    very_negative: 0,
    negative: 0,
    neutral: 0,
    positive: 0,
    very_positive: 0,
  };

  messages.forEach(m => {
    if (m.sentiment) scores[m.sentiment.level]++;
  });

  // Priorização de sentimentos críticos em caso de empate ou presença
  if (scores.very_negative > 0) return 'very_negative';
  if (scores.negative > 1) return 'negative';

  const sortedSentiments = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sortedSentiments[0][0] as SentimentLevel;
}

// Retorna o tempo médio de resposta da equipe/GABI (ignora respostas do cliente)
export function getAvgResponseTime(messages: Message[]): number {
  const teamReplies = messages.filter(m => m.sender === 'gabi' || m.sender === 'user');
  if (teamReplies.length === 0) return 0;

  let totalMins = 0;
  let count = 0;

  messages.forEach((m, i) => {
    if (i > 0 && (m.sender === 'gabi' || m.sender === 'user')) {
      const prevMsg = messages[i-1];
      if (prevMsg.sender === 'client') {
        const diffInMs = m.timestamp.getTime() - prevMsg.timestamp.getTime();
        totalMins += diffInMs / 60000;
        count++;
      }
    }
  });

  return count > 0 ? totalMins / count : 0;
}

// Verifica se uma mensagem deveria ter escalado e não escalou (para alertas)
export function checkMissedEscalation(message: Message): boolean {
  if (message.sender === 'gabi' && message.aiAnalysis && !message.aiAnalysis.shouldEscalate) {
    // Check if sentiment was negative but it didn't escalate
    if (message.sentiment && (message.sentiment.level === 'negative' || message.sentiment.level === 'very_negative')) {
      return true;
    }
  }
  return false;
}
