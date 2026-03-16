import React from 'react';
import { TermometroComunicacaoProps, Message } from './types';
import { 
  getDominantSentiment, 
  getAvgResponseTime, 
  formatResponseTime, 
  getResponseTimeColor,
  SENTIMENT_MAP 
} from './termometroCriteria';
import { TimelineEvent } from './components/TimelineEvent';
import { GapPill } from './components/GapPill';
import { ClosingEvent } from './components/ClosingEvent';

/**
 * TermometroComunicacao
 * Componente analítico central para visualização de conversas (E-mail, WhatsApp, Propostas).
 */
export const TermometroComunicacao: React.FC<TermometroComunicacaoProps> = ({
  channel,
  thread,
  onReply,
  onEscalate,
  onArchive,
  onReassignToGabi
}) => {
  if (!thread || thread.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 border border-dashed rounded-xl border-gray-700/50">
        <i className="ph ph-mask-sad text-4xl mb-2 block opacity-20"></i>
        Nenhum evento capturado nesta conversa.
      </div>
    );
  }

  // ── Cálculos de Cabeçalho ──
  const totalSent = thread.filter(m => m.direction === 'sent').length;
  const totalReceived = thread.filter(m => m.direction === 'received').length;
  const avgResponseTime = getAvgResponseTime(thread);
  const dominantSentiment = getDominantSentiment(thread);
  
  const startTime = thread[0].timestamp;
  const lastTime = thread[thread.length - 1].timestamp;
  const totalDurationMinutes = (lastTime.getTime() - startTime.getTime()) / 60000;

  return (
    <div className="termometro-container flex flex-col gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      
      {/* 1. Header com Métricas Resumidas */}
      <div className="metrics-grid grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Card: Volume */}
        <div className="metric-card bg-dark-800/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">Volume de Interação</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{thread.length}</span>
            <span className="text-xs text-gray-400">mensagens ({totalSent}·{totalReceived})</span>
          </div>
        </div>

        {/* Card: Tempo Total */}
        <div className="metric-card bg-dark-800/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">Ciclo da Thread</span>
          <div className="text-2xl font-bold text-white">{formatResponseTime(totalDurationMinutes)}</div>
        </div>

        {/* Card: Tempo Médio GABI/Equipe */}
        <div className="metric-card bg-dark-800/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">Média de Resposta</span>
          <div className="flex items-center gap-2">
             <div className="text-2xl font-bold text-white">{formatResponseTime(avgResponseTime)}</div>
             <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${getResponseTimeColor(channel, 'gabi', avgResponseTime) === 'green' ? 'bg-green-500 shadow-green-500/20' : 'bg-amber-500'}`}></div>
          </div>
        </div>

        {/* Card: Sentimento Geral */}
        <div className="metric-card bg-dark-800/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">Clima da Conversa</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: SENTIMENT_MAP[dominantSentiment].color }}>
              {SENTIMENT_MAP[dominantSentiment].label}
            </span>
            <i className={`ph ${dominantSentiment === 'very_negative' ? 'ph-warning-octagon' : 'ph-sparkle'}`} style={{ color: SENTIMENT_MAP[dominantSentiment].color }}></i>
          </div>
        </div>

      </div>

      {/* 2. Timeline Vertical */}
      <div className="timeline-view flex flex-col relative pl-2">
        
        {thread.map((msg, idx) => {
          const isFirst = idx === 0;
          const prevMsg = !isFirst ? thread[idx - 1] : null;
          const timeSincePrev = prevMsg ? (msg.timestamp.getTime() - prevMsg.timestamp.getTime()) / 60000 : 0;

          return (
            <React.Fragment key={msg.id}>
              {/* GapPill entre mensagens */}
              {!isFirst && (
                <GapPill 
                  channel={channel} 
                  minutes={timeSincePrev} 
                  receiver={msg.sender} 
                  sender={prevMsg!.sender}
                />
              )}

              {/* Evento de Timeline */}
              <TimelineEvent 
                message={msg}
                channel={channel}
                onReply={onReply}
                onEscalate={onEscalate}
                onArchive={onArchive}
                onReassignToGabi={onReassignToGabi}
              />
            </React.Fragment>
          );
        })}

        {/* 3. Evento de Fechamento */}
        <ClosingEvent channel={channel} thread={thread} />

      </div>
    </div>
  );
};
