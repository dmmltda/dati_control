import React from 'react';
import { Channel, SenderType } from '../types';
import { formatResponseTime, getResponseTimeColor } from '../termometroCriteria';

interface Props {
  channel: Channel;
  minutes: number;
  receiver: SenderType;
  sender: SenderType;
}

export const GapPill: React.FC<Props> = ({ channel, minutes, receiver, sender }) => {
  const color = getResponseTimeColor(channel, receiver, minutes);
  const isGabiResponse = receiver === 'gabi';
  const isTeamResponse = receiver === 'user';
  const isClientWait = sender === 'client' && (isGabiResponse || isTeamResponse);

  const colorClasses = {
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    yellow: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20'
  }

  return (
    <div className="relative pl-12 flex justify-start my-4">
      {/* 1. Timeline Line Contínua */}
      <div className="absolute left-4 top-0 bottom-0 w-1 bg-white/5"></div>

      <div className={`gap-tag flex items-center gap-2 px-3 py-1.5 rounded-xl border z-20 text-[10px] font-bold tracking-tight shadow-xl ${colorClasses[color]}`}>
        <i className={`ph ${color === 'green' ? 'ph-timer' : 'ph-clock-countdown'}`}></i>
        <span>
          {isClientWait ? 
            (isGabiResponse ? `GABI respondeu em ${formatResponseTime(minutes)}` : `Equipe respondeu em ${formatResponseTime(minutes)}`) :
            `Aguardado por ${formatResponseTime(minutes)} até a próxima interação`
          }
        </span>
      </div>
    </div>
  );
};
