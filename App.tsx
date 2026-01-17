
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { scanFolder, scanFilesLegacy } from './modules/inventory/scanner';
import { AudioSample, ScanProgress, Plugin } from './types';
import { Terminal } from './ui/components/Terminal';
import { SampleCard } from './ui/components/SampleCard';
import { PluginManager } from './ui/components/PluginManager';
import { localSearch } from './modules/inventory/localSearch';
import { getAIRecommendation } from './services/aiService';
import { saveSamples, saveSamplesBatch, loadSamples, savePlugins, loadPlugins, clearAllData, exportIndex, importIndex } from './services/storageService';

const NeuralPrecisionVisual: React.FC<{ total: number, processed: number }> = ({ total, processed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || total === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const dotsPerRow = Math.ceil(Math.sqrt(total));
    const dotSize = Math.max(2, Math.floor(width / dotsPerRow) - 1);
    for (let i = 0; i < total; i++) {
      const x = (i % dotsPerRow) * (dotSize + 1);
      const y = Math.floor(i / dotsPerRow) * (dotSize + 1);
      if (y > height) break;
      ctx.fillStyle = i < processed ? '#39ff14' : '#0a140a';
      if (i < processed) { ctx.shadowBlur = 4; ctx.shadowColor = '#39ff14'; }
      ctx.fillRect(x, y, dotSize, dotSize);
    }
  }, [total, processed]);

  return (
    <div className="bg-black/90 border border-green-900/40 p-2 rounded mb-4 h-20 relative overflow-hidden shadow-inner flex-none">
      <div className="absolute top-1 left-2 text-[8px] uppercase text-green-900 z-10 font-bold tracking-tighter">Precision_Matrix_v4</div>
      <canvas ref={canvasRef} width={600} height={80} className="w-full h-full opacity-70" />
    </div>
  );
};

const App: React.FC = () => {
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiRecommendedIds, setAiRecommendedIds] = useState<string[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(40);
  const [rightPanelTab, setRightPanelTab] = useState<'ai' | 'vst'>('ai');
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-49), msg]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(filter), 300);
    return () => clearTimeout(timer);
  }, [filter]);

  useEffect(() => {
    async function init() {
      try {
        const ps = await loadPlugins(); if (ps.length) setPlugins(ps);
        const ss = await loadSamples(); if (ss.length) setSamples(ss);
        addLog("SYSTEM: KERNEL_LOADED [STABLE]");
      } catch (e) { addLog("ERR: INDEX_SYNC_FAILED"); }
    }
    init();
  }, [addLog]);

  useEffect(() => { if (plugins.length) savePlugins(plugins); }, [plugins]);

  const handleScan = async () => {
    const triggerLegacy = () => fileInputRef.current?.click();
    try {
      const win = window as any;
      if (typeof win.showDirectoryPicker === 'function' && window.self === window.top) {
        const dirHandle = await win.showDirectoryPicker();
        addLog(`SCAN_INIT: ${dirHandle.name}`);
        setSamples([]); 
        let totalCounter = 0;
        const results = await scanFolder(dirHandle, setProgress, (batch) => {
          setSamples(prev => [...prev, ...batch]);
          totalCounter += batch.length;
          if (totalCounter % 1000 === 0) addLog(`INDEXING: ${totalCounter} NODES_REACHED`);
          saveSamplesBatch(batch);
        });
        await saveSamples(results);
        setProgress(null);
        addLog(`SUCCESS: ${results.length} NODES_INDEXED`);
      } else { triggerLegacy(); }
    } catch (err: any) { triggerLegacy(); }
  };

  const handleAIRequest = async () => {
    if (!aiQuery.trim() || !samples.length) return;
    setIsAiLoading(true);
    addLog(`AI_CORE_LINK: "${aiQuery}"`);
    const topMatches = localSearch(samples, aiQuery, 40);
    const result = await getAIRecommendation(aiQuery, topMatches, plugins);
    addLog(`AI_TACTICIAN: ${result.text}`);
    if (result.recommendedIds.length) setAiRecommendedIds(result.recommendedIds);
    setIsAiLoading(false);
    setAiQuery('');
  };

  const playSample = async (sample: AudioSample) => {
    if (sample.type === 'midi') return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (activeSourceRef.current) {
        try { activeSourceRef.current.stop(); activeSourceRef.current.disconnect(); } catch(e) {}
        activeSourceRef.current = null;
      }
      const file = sample.handle instanceof File ? sample.handle : await sample.handle.getFile();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      activeSourceRef.current = source;
      source.start();
    } catch (e) { addLog("ERR: AUDIO_STREAM_FAIL"); }
  };

  const filteredSamples = useMemo(() => {
    if (aiRecommendedIds) return samples.filter(s => aiRecommendedIds.includes(s.id));
    return localSearch(samples, debouncedFilter, 30000);
  }, [samples, debouncedFilter, aiRecommendedIds]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 1000) {
      setVisibleCount(prev => Math.min(prev + 40, filteredSamples.length));
    }
  };

  return (
    <div className="h-screen w-screen cyber-grid flex flex-col overflow-hidden bg-[#020202] text-[#39ff14] font-mono select-none text-[14px]">
      <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
          if (!e.target.files?.length) return;
          setSamples([]);
          addLog(`LEGACY_INIT: ${e.target.files.length} ITEMS`);
          const res = await scanFilesLegacy(e.target.files, setProgress, (b) => {
            setSamples(p => [...p, ...b]);
            saveSamplesBatch(b);
          });
          addLog(`SUCCESS: ${res.length} NODES_INDEXED`);
          setProgress(null);
      }} {...({ webkitdirectory: "", directory: "" } as any)} multiple />
      
      <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            try {
              const text = await file.text();
              const data = await importIndex(text);
              setSamples(data.samples); setPlugins(data.plugins || []);
              addLog(`RESTORE_COMPLETE: ${data.samples.length} NODES`);
            } catch (err: any) { addLog(`ERR: ${err.message}`); }
          }
      }} />

      <header className="flex-none p-4 md:px-8 border-b border-green-900/30 flex justify-between items-center bg-black/60 backdrop-blur-md z-50">
        <div>
          <h1 className="text-2xl font-black neon-text tracking-tighter uppercase font-['Orbitron']">
            Techno Architect <span className="text-white text-lg">v3.4.0</span>
          </h1>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#39ff14]"></span>
            <p className="text-green-900 text-[8px] uppercase tracking-[0.6em] font-bold leading-none">Semantic_Truth_Core_Active</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportIndex} className="px-3 py-1.5 border border-green-900/50 text-green-700 text-[9px] uppercase hover:text-green-400 font-bold transition-all">EXPORT_JSON</button>
          <button onClick={() => importInputRef.current?.click()} className="px-3 py-1.5 border border-green-900/50 text-green-700 text-[9px] uppercase hover:text-green-400 font-bold transition-all">IMPORT_JSON</button>
          <button onClick={handleScan} disabled={!!progress} className="px-6 py-2 bg-green-600 text-black font-black uppercase text-[10px] rounded-sm hover:bg-white neon-border disabled:opacity-50 transition-all">
            {progress ? `SYNC_${Math.round((progress.processedFiles / (progress.totalFiles || 1)) * 100)}%` : 'SCAN_INVENTORY'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr_320px] gap-4 p-4">
        {/* LEFT PANEL: LOGS & FILTERS */}
        <aside className="flex flex-col gap-4 overflow-hidden h-full">
          <Terminal logs={logs} title="SYSTEM_CORE_LOG" />
          {progress && <NeuralPrecisionVisual total={progress.totalFiles} processed={progress.processedFiles} />}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/80 border border-green-900/40 p-3 rounded-lg flex flex-col shadow-2xl">
             <h3 className="text-green-500 font-bold mb-3 uppercase text-[9px] tracking-widest border-b border-green-900/20 pb-1">DNA_Matrix_Filters</h3>
             <input type="text" placeholder="SEARCH..." className="w-full bg-green-950/5 border border-green-900/40 p-2 text-green-400 text-xs outline-none focus:border-green-400 mb-3 font-mono placeholder:text-green-900" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="grid grid-cols-2 gap-1 content-start">
              {['#Kick', '#Bass', '#Hat', '#Vocal', '#MIDI', '#Sequence', '#Tight', '#Loop', '#SubRange', '#Unclassified'].map(tag => (
                <button key={tag} onClick={() => setFilter(prev => prev.includes(tag) ? prev.replace(tag, '').trim() : `${prev} ${tag}`.trim())} className={`text-[8px] border p-2 transition-all uppercase font-bold ${filter.includes(tag) ? 'bg-green-500 text-black shadow-[0_0_10px_#39ff14]' : 'border-green-900 text-green-900 hover:border-green-400'}`}>
                  {tag.replace('#', '')}
                </button>
              ))}
            </div>
            <button onClick={() => { setFilter(''); setAiRecommendedIds(null); setVisibleCount(40); }} className="mt-3 text-[8px] text-green-900 uppercase font-bold hover:text-green-400 self-end">[RESET]</button>
          </div>
        </aside>

        {/* CENTER PANEL: INVENTORY STREAM */}
        <section className="flex flex-col gap-4 overflow-hidden h-full">
          <div className="flex-none flex justify-between items-center px-4 py-2 bg-black/80 border border-green-900/30 rounded-lg shadow-xl">
             <h2 className="text-[10px] font-bold uppercase tracking-[0.5em] text-white">Inventory_Stream_v4</h2>
             <div className="text-[9px] text-green-900 font-bold uppercase">NODES: {filteredSamples.length}</div>
          </div>
          <div onScroll={handleScroll} className="flex-1 overflow-y-auto pr-1 custom-scrollbar grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 content-start pb-20">
            {filteredSamples.length > 0 ? (
              filteredSamples.slice(0, visibleCount).map(s => (
                <SampleCard key={s.id} sample={s} onPlay={playSample} onCopy={p => { navigator.clipboard.writeText(p); addLog(`COPY_PATH: ${s.name}`); }} />
              ))
            ) : (
              <div className="col-span-full py-40 text-center text-green-900 text-[12px] uppercase tracking-[1em] opacity-20">No_Data_Link</div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: AI & PLUGINS */}
        <aside className="flex flex-col gap-4 overflow-hidden h-full">
          <div className="flex-none flex border border-green-900/40 rounded-lg overflow-hidden h-[36px] bg-black/80 shadow-lg">
            <button onClick={() => setRightPanelTab('ai')} className={`flex-1 text-[9px] font-black uppercase tracking-widest transition-all ${rightPanelTab === 'ai' ? 'bg-green-600 text-black' : 'text-green-900 hover:text-green-400'}`}>AI_TACTICIAN</button>
            <button onClick={() => setRightPanelTab('vst')} className={`flex-1 text-[9px] font-black uppercase tracking-widest transition-all ${rightPanelTab === 'vst' ? 'bg-green-600 text-black' : 'text-green-900 hover:text-green-400'}`}>VST_REGISTRY</button>
          </div>

          <div className="flex-1 overflow-hidden relative">
            {rightPanelTab === 'ai' ? (
              <div className="h-full flex flex-col gap-3 bg-black/80 border border-green-900/40 p-3 rounded-lg shadow-2xl overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar text-[11px] text-green-400 space-y-3 pr-1 font-mono">
                  <div className="border-l border-green-900 pl-2 py-0.5 opacity-50 italic uppercase text-[9px]">Neural_Link: Established</div>
                  {aiRecommendedIds && (
                    <div className="bg-green-900/20 p-2 border border-green-500/30 rounded text-white text-[10px] leading-relaxed">
                      [STRATEGY_OVERLAY]: Filtered {aiRecommendedIds.length} nodes.
                      <button onClick={() => setAiRecommendedIds(null)} className="block mt-1 text-red-500 underline font-bold uppercase text-[8px]">Terminate AI Filter</button>
                    </div>
                  )}
                  <p className="text-[10px] text-green-700 leading-tight">Enter tactical request for sample analysis and VST matching.</p>
                </div>
                <div className="flex-none space-y-2">
                  <textarea value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="REQUEST_CORE..." className="w-full h-20 bg-green-950/10 border border-green-900/40 p-2 text-green-300 text-[10px] outline-none focus:border-green-500 resize-none font-mono placeholder:text-green-900" />
                  <button onClick={handleAIRequest} disabled={isAiLoading || !aiQuery.trim()} className="w-full bg-green-500 text-black font-black py-2.5 text-[9px] uppercase hover:bg-white transition-all disabled:opacity-30">
                    {isAiLoading ? 'SYNCING...' : 'EXECUTE_QUERY'}
                  </button>
                </div>
              </div>
            ) : (
              <PluginManager plugins={plugins} onAdd={(p) => setPlugins(prev => [...prev, { ...p, id: crypto.randomUUID() }])} onAddBatch={(ps) => setPlugins(prev => [...prev, ...ps.map(p => ({ ...p, id: crypto.randomUUID() }))])} onRemove={(id) => setPlugins(prev => prev.filter(p => p.id !== id))} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};
export default App;
