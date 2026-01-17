
import React from 'react';
import { AudioSample } from '../../types';

interface SampleCardProps {
  sample: AudioSample;
  onPlay: (sample: AudioSample) => void;
  onCopy: (path: string) => void;
}

export const SampleCard: React.FC<SampleCardProps> = ({ sample, onPlay, onCopy }) => {
  const isMidi = sample.type === 'midi';
  const isSilent = sample.acousticTags.includes('#Silent');
  const conf = sample.confidenceScore;
  const statusColor = conf >= 95 ? 'bg-green-500 shadow-[0_0_10px_#39ff14]' : conf >= 80 ? 'bg-green-700' : conf > 10 ? 'bg-yellow-600' : 'bg-red-700';

  return (
    <div className={`bg-[#080808] border ${isSilent ? 'border-red-900/30' : 'border-green-900/40'} p-3 rounded flex flex-col justify-between h-[200px] min-w-[280px] group hover:border-green-400 transition-all shadow-xl relative`}>
      {/* HEADER */}
      <div className="flex justify-between items-start gap-1 flex-none h-[32px] overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${statusColor}`} title={`Confidence: ${conf}%`}></span>
            <span className="text-[11px] text-green-400 font-black truncate uppercase" title={sample.name}>{sample.name}</span>
          </div>
          <span className="text-[8px] text-green-900 truncate font-mono uppercase opacity-60 leading-tight">{sample.path.split('/').slice(-1)}</span>
        </div>
        
        {isMidi ? (
          <div className="w-6 h-6 flex-none border border-blue-900 flex items-center justify-center text-blue-500" title="MIDI">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
          </div>
        ) : !isSilent && (
          <button onClick={(e) => { e.stopPropagation(); onPlay(sample); }} className="w-6 h-6 flex-none border border-green-900 flex items-center justify-center hover:bg-green-500 hover:text-black transition-all">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        )}
      </div>

      {/* TAGS */}
      <div className="flex flex-wrap gap-1 mt-1 h-[36px] overflow-hidden content-start flex-none">
        {sample.sourceTags.map(t => (
          <span key={t} className="text-[7px] bg-green-950/20 text-green-700 px-1 py-0.5 border border-green-900/10 uppercase font-bold">{t.replace('#', '')}</span>
        ))}
        {sample.acousticTags.map(t => (
          <span key={t} className={`text-[7px] px-1 py-0.5 border uppercase font-bold ${t === '#Silent' ? 'bg-red-900/20 text-red-500 border-red-900/20' : 'bg-white/5 text-white/30 border-white/5'}`}>{t.replace('#', '')}</span>
        ))}
      </div>

      {/* DNA METRICS */}
      <div className="pt-2 border-t border-green-900/20 grid grid-cols-4 gap-0.5 text-[10px] uppercase font-bold flex-none">
        <div className="flex flex-col"><span className="text-green-900 text-[6px] font-black">FREQ</span><span className="text-green-500 tabular-nums">{sample.dna.peakFrequency > 0 ? `${Math.round(sample.dna.peakFrequency)}Hz` : '---'}</span></div>
        <div className="flex flex-col"><span className="text-green-900 text-[6px] font-black">BRI</span><div className="h-0.5 bg-green-900/20 mt-1.5 rounded-full overflow-hidden"><div className="h-full bg-green-400" style={{ width: `${sample.dna.brightness * 100}%` }}></div></div></div>
        <div className="flex flex-col"><span className="text-green-900 text-[6px] font-black">ATK</span><span className="text-green-500 tabular-nums">{sample.dna.attackMs.toFixed(0)}ms</span></div>
        <div className="flex flex-col items-end"><span className="text-green-900 text-[6px] font-black">CONF</span><span className={`${conf >= 95 ? 'text-green-400' : 'text-yellow-600'} tabular-nums`}>{conf}%</span></div>
      </div>

      {/* ACTIONS */}
      <button 
        onClick={() => onCopy(sample.fullPath)} 
        className="mt-2 flex-none text-[8px] border border-green-900/30 py-1.5 uppercase hover:bg-green-600 hover:text-black transition-all font-black tracking-tighter bg-green-950/5 text-green-800"
      >
        COPY_PATH
      </button>
    </div>
  );
};
