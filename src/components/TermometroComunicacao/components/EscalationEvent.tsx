import React from 'react';

interface Props {
  onEscalate?: () => void;
}

export const EscalationEvent: React.FC<Props> = ({ onEscalate }) => {
  return (
    <div className="escalation-alert-box bg-red-600/10 border border-red-600/20 rounded-xl p-4 mt-4 flex flex-col gap-4 shadow-xl">
      
      {/* ── ALERTA DE SEGURANÇA ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center text-red-500 shadow-lg">
          <i className="ph-fill ph-shield-warning text-xl"></i>
        </div>
        <div className="flex flex-col gap-0.5">
          <strong className="text-red-500 text-[10px] uppercase tracking-widest font-black">Escalação Crítica Detectada</strong>
          <span className="text-white text-xs font-bold leading-relaxed">
            Sentimento crítico detectado — GABI sinalizou para atendimento humano.
          </span>
        </div>
      </div>

      {/* ── BOTÃO DE ASSUMIR — SEGURANÇA ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onEscalate}
          className="bg-red-600 hover:bg-red-700 text-white font-black text-[11px] px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xl transition-all hover:scale-[1.03] animate-pulse"
        >
          Assumir Atendimento
          <i className="ph-bold ph-hand-eye"></i>
        </button>
        <span className="text-[10px] text-gray-400 italic">"GABI BLOQUEADA PARA RESPOSTA AUTOMÁTICA"</span>
      </div>
      
    </div>
  );
};
