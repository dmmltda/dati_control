import React from 'react';
import { Channel, Message } from '../types';
import { RESPONSE_TIME_THRESHOLDS } from '../termometroCriteria';

interface Props {
  channel: Channel;
  thread: Message[];
}

export const ClosingEvent: React.FC<Props> = ({ channel, thread }) => {
  const lastMsg = thread[thread.length - 1];
  const isLastFromTeam = lastMsg.sender === 'gabi' || lastMsg.sender === 'user';
  const hoursSinceLast = (new Date().getTime() - lastMsg.timestamp.getTime()) / 3600000;
  
  // ── Lógica de Resolução ──
  // 1. Verde: Resolvido (Última da equipe e tempo ok)
  // 2. Amarelo: Aguardando Cliente (Equipe respondeu, cliente ainda não)
  // 3. Laranja/Vermelho: Aguardando Equipe (Cliente falou por último)
  
  let status: 'resolved' | 'waiting_client' | 'waiting_team' = 'resolved';
  let message = 'Thread resolvida — sem resposta pendente';
  let color = 'green';

  if (!isLastFromTeam) {
    status = 'waiting_team';
    message = `Aguardando resposta da equipe — cliente respondeu há ${Math.floor(hoursSinceLast * 60)} min`;
    color = 'amber';
  } else if (hoursSinceLast < 24) {
    status = 'waiting_client';
    message = 'Aguardando resposta do cliente';
    color = 'blue';
  }

  const iconClasses = {
    green: 'bg-green-500/10 text-green-500 border-green-500/20 ph-check-circle',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20 ph-clock-countdown',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20 ph-timer'
  };

  return (
    <div className="relative pl-12 flex justify-start my-8">
      {/* 1. Timeline Line Contínua (Acabando aqui) */}
      <div className="absolute left-4 top-0 h-4 w-1 bg-white/5"></div>
      <div className="absolute left-3.5 top-4 w-2 h-2 rounded-full bg-white/5"></div>

      <div className={`status-node flex items-center gap-3 px-4 py-2.5 rounded-2xl border z-20 text-[11px] font-bold tracking-tight shadow-2xl transition-all hover:scale-[1.02] 
                      ${iconClasses[color as keyof typeof iconClasses].split(' ').slice(0, 3).join(' ')}`}>
        <i className={`ph text-lg ${iconClasses[color as keyof typeof iconClasses].split(' ').pop()}`}></i>
        <div className="flex flex-col gap-0.5">
          <span className="uppercase text-[9px] opacity-60 font-black tracking-widest leading-none">STATUS ATUAL:</span>
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
};
