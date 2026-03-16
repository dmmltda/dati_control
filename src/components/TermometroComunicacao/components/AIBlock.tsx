import React from 'react';
import { AIAnalysis } from '../types';

interface Props {
  analysis: AIAnalysis;
}

export const AIBlock: React.FC<Props> = ({ analysis }) => {
  return (
    <div className="ai-process-block bg-purple-500/5 border border-purple-500/10 rounded-xl p-4 mt-4 transition-all hover:bg-purple-500/10 hover:border-purple-500/20">
      
      {/* ── Title e Model info ── */}
      <div className="flex justify-between items-center mb-3">
        <strong className="text-purple-400 text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 ">
          <i className="ph-fill ph-sparkle text-xs"></i> Raciocínio & Triagem (Interno)
        </strong>
        <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-500 uppercase font-black">
          {analysis.confidence > 0.85 ? 'Alta Confiança' : 'Médio/Baixo'}
        </span>
      </div>

      {/* ── Grid Principal: Intent & Action ── */}
      <div className="grid grid-cols-2 gap-4 mb-4 border-b border-white/5 pb-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-500 font-bold tracking-tighter uppercase whitespace-nowrap">Intent Detectado:</span>
          <span className="text-white text-xs font-bold leading-tight">{analysis.intent}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-500 font-bold tracking-tighter uppercase whitespace-nowrap">Ação de Triagem:</span>
          <span className="text-green-400 text-xs font-bold leading-tight flex items-center gap-1">
            {analysis.action}
            <i className="ph-bold ph-check"></i>
          </span>
        </div>
      </div>

      {/* ── Summary & Proposta — Processamento ── */}
      <div className="flex flex-col gap-3">
        <div className="summary-text text-[11px] text-gray-300 line-clamp-2 italic leading-relaxed">
          <span className="mb-1 uppercase tracking-widest block text-[9px] font-bold text-gray-600 not-italic">Resumo do Pensamento:</span>
          "{analysis.summary}"
        </div>

        {analysis.generatedResponse && (
          <div className="proposal-box bg-dark-900 border-l-2 border-purple-500 p-2.5 rounded-r-lg group-hover:bg-purple-900/10 transition-colors">
             <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1.5 block">Resposta Sugerida (GABI):</span>
             <div className="text-[11px] text-gray-400 font-medium line-clamp-2 indent-2 italic">
               "{analysis.generatedResponse}"
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
