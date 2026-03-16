import React from 'react';
import { SentimentLevel } from '../types';
import { SENTIMENT_MAP } from '../termometroCriteria';

interface Props {
  level: SentimentLevel;
  score: number;
}

export const SentimentBar: React.FC<Props> = ({ level, score }) => {
  const meta = SENTIMENT_MAP[level];

  return (
    <div className="sentiment-bar-widget flex items-center gap-3">
      {/* Barra visual de progresso */}
      <div className="bar-container bg-dark-800 w-24 h-1.5 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
        <div 
          className="h-full rounded-full transition-all duration-1000 shadow-lg"
          style={{ 
            width: `${score}%`, 
            backgroundColor: meta.color,
            boxShadow: `0 0 10px ${meta.color}55`
          }}
        ></div>
      </div>

      {/* Label e Indicador textual */}
      <div className="flex items-center gap-1.5 min-w-[100px]">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }}></div>
        <span className="text-[10px] font-bold text-gray-400 tracking-tight uppercase" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
    </div>
  );
};
