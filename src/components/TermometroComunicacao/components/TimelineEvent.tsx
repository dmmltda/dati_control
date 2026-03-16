import React from 'react';
import { Message, Channel } from '../types';
import { SENDER_COLORS, SENTIMENT_MAP } from '../termometroCriteria';
import { SentimentBar } from './SentimentBar';
import { AIBlock } from './AIBlock';
import { EscalationEvent } from './EscalationEvent';

interface Props {
  message: Message;
  channel: Channel;
  onReply?: (m: Message) => void;
  onEscalate?: (m: Message) => void;
  onArchive?: (m: Message) => void;
  onReassignToGabi?: (m: Message) => void;
}

export const TimelineEvent: React.FC<Props> = ({ 
  message, 
  channel, 
  onReply, 
  onEscalate,
  onArchive,
  onReassignToGabi
}) => {
  const isGabi = message.sender === 'gabi';
  const isClient = message.sender === 'client';
  const colorData = SENDER_COLORS[message.sender];
  const sentimentData = message.sentiment ? SENTIMENT_MAP[message.sentiment.level] : null;

  return (
    <div className="relative mb-8 pl-12 group transition-all duration-300">
      
      {/* 1. Timeline Line Contínua */}
      <div className="absolute left-4 top-10 bottom-0 w-1 bg-white/5 group-last:hidden"></div>

      {/* 2. Avatar Node */}
      <div 
        className={`absolute left-0 top-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xl z-20 
                   ${colorData.border ? 'border-2 border-white/10' : ''}`}
        style={{ backgroundColor: colorData.bg }}
      >
        {colorData.label}
        <div className={`absolute -right-1 -bottom-1 w-4 h-4 rounded-full border-2 border-dark-900 flex items-center justify-center 
                        ${message.status === 'sent' ? 'bg-green-500' : 
                          message.status === 'received' ? 'bg-blue-500' : 
                          message.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`}>
          <i className={`ph text-[8px] text-white ${message.status === 'sent' ? 'ph-check' : 'ph-arrow-arc-left'}`}></i>
        </div>
      </div>

      {/* 3. Event Card */}
      <div className="event-card bg-dark-900 border border-white/10 rounded-2xl p-5 shadow-2xl hover:border-white/20 transition-colors">
        
        {/* Event Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="sender-info flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-500 uppercase font-black tracking-tight">{message.from} &rarr; {message.to}</span>
            <span className="text-[11px] text-[#cbd5e1] font-semibold">{message.timestamp.toLocaleString('pt-BR')}</span>
          </div>

          <div className="event-badges flex items-center gap-2">
            {isGabi && (
              <span className="bg-purple-500/10 text-purple-400 text-[9px] px-2 py-0.5 rounded-full border border-purple-500/20 font-bold uppercase tracking-wider">
                Inteligência IA
              </span>
            )}
            {message.via && (
              <span className="bg-white/5 text-gray-400 text-[9px] px-2 py-0.5 rounded-full border border-white/10 font-medium">
                Via {message.via}
              </span>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="event-content">
          {message.subject && (
            <h4 className="text-white font-bold text-sm mb-2">{message.subject}</h4>
          )}
          
          <div className={`text-sm ${message.content ? 'text-gray-300' : 'text-gray-600 italic'} line-clamp-3 leading-relaxed`}>
            {message.content || 'Conteúdo não capturado no histórico'}
          </div>

          {message.status === 'failed' && message.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] p-3 rounded-lg mt-3 flex items-center gap-2">
              <i className="ph-fill ph-warning-circle text-lg"></i>
              {message.errorMessage}
            </div>
          )}
        </div>

        {/* Action Belt - Régua de métricas e Botões */}
        <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap justify-between items-center gap-4">
          
          {/* Métricas e Tags */}
          <div className="metrics-tags flex items-center gap-5">
             {sentimentData && (
               <div className="flex items-center gap-3">
                 <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest whitespace-nowrap">Clima:</span>
                 <SentimentBar score={message.sentiment!.score} level={message.sentiment!.level} />
               </div>
             )}
          </div>

          {/* Botões de Ação */}
          <div className="actions flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => onReply?.(message)}
              className="text-[11px] font-bold text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all"
            >
              Responder {channel === 'email' ? 'Outlook' : 'WhatsApp'}
            </button>
            
            <button 
              onClick={() => onArchive?.(message)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Arquivar"
            >
              <i className="ph ph-archive-box"></i>
            </button>
          </div>
        </div>

        {/* 4. AI Process Block (se houver análise) */}
        {message.aiAnalysis && <AIBlock analysis={message.aiAnalysis} />}

        {/* 5. Escalation Rule (se detectado gatilho crítico) */}
        {message.aiAnalysis?.shouldEscalate && <EscalationEvent onEscalate={() => onEscalate?.(message)} />}

      </div>

    </div>
  );
};
