export type Channel = 'email' | 'whatsapp' | 'proposal'
export type SenderType = 'gabi' | 'user' | 'client'
export type MessageStatus = 'sent' | 'received' | 'failed' | 'pending'
export type SentimentLevel =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'very_negative'

export interface SentimentScore {
  level: SentimentLevel
  confidence: number   // 0–1
  score: number        // 0–100 para a barra visual
}

export interface AIAnalysis {
  intent: string               // ex: "resposta_simples", "reclamacao", "solicitacao"
  action: string               // ex: "auto_replied", "escalated", "ignored"
  summary: string              // resumo em português do que o cliente disse
  generatedResponse?: string   // resposta exata enviada pela GABI, se houver
  confidence: number           // 0–1
  shouldEscalate: boolean      // true quando sentimento é negativo ou muito negativo
}

export interface Message {
  id: string
  direction: 'sent' | 'received'
  sender: SenderType
  from: string                 // nome ou e-mail/telefone do remetente
  to: string                   // nome ou e-mail/telefone do destinatário
  timestamp: Date
  subject?: string             // apenas para channel="email"
  content?: string             // pode ser null/undefined se não capturado no histórico
  sentiment?: SentimentScore
  aiAnalysis?: AIAnalysis
  status: MessageStatus
  errorMessage?: string        // preenchido quando status="failed"
  via?: string                 // ex: "Outlook", "WhatsApp HD", "GABI automático"
}

export interface TermometroComunicacaoProps {
  channel: Channel
  thread: Message[]
  onReply?: (message: Message) => void
  onEscalate?: (message: Message) => void
  onArchive?: (message: Message) => void
  onReassignToGabi?: (message: Message) => void
}
