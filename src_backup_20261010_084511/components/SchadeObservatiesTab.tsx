import React, { useState, useRef, useEffect } from "react";
import { 
  CheckSquare, Square, Plus, Trash2, Shield, 
  HelpCircle, Sparkles, RefreshCw, Layers, ClipboardCheck, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ObservationItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

interface SchadeObservatiesTabProps {
  playCyberBeep?: (freq?: number, duration?: number, type?: string) => void;
}

export default function SchadeObservatiesTab({ playCyberBeep }: SchadeObservatiesTabProps) {
  const [items, setItems] = useState<ObservationItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleAddItem = () => {
    if (!inputValue.trim()) return;

    const newItem: ObservationItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: inputValue.trim(),
      completed: false,
      createdAt: new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    };

    setItems(prev => [newItem, ...prev]);
    setInputValue("");
    
    if (playCyberBeep) {
      playCyberBeep(980, 0.04);
    }

    // Retain focus in input for seamless multi-line typing
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  };

  const toggleCompleted = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextState = !item.completed;
        if (playCyberBeep) {
          if (nextState) {
            playCyberBeep(1200, 0.08, "sine");
          } else {
            playCyberBeep(700, 0.06, "sine");
          }
        }
        return { ...item, completed: nextState };
      }
      return item;
    }));
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering completion toggles
    setItems(prev => prev.filter(item => item.id !== id));
    if (playCyberBeep) {
      playCyberBeep(500, 0.05);
    }
  };

  const handleClearAll = () => {
    setItems([]);
    setInputValue("");
    if (playCyberBeep) {
      playCyberBeep(350, 0.15, "sawtooth");
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const completedCount = items.filter(i => i.completed).length;

  return (
    <div className="space-y-6" id="schade-observaties-container">
      {/* Premium Obsidian Top Panel */}
      <div className="bg-slate-900 border border-slate-950 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        {/* Absolute branding design decoration lines */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>
        <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="z-10 space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="p-1 px-2.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-md shrink-0 font-mono text-xs font-bold flex items-center justify-center">
              AUDIT
            </span>
            <h2 className="text-base font-black text-white tracking-tight uppercase">
              Persoonlijke Schade Observaties
            </h2>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            Registreer uw eigen onafhankelijke expert-waarnemingen vakkundig. Gegevens blijven strikt bewaard in de actieve browser-sessie.  
            <span className="text-slate-300 font-bold ml-1">Developed by Danny Radjkoemar</span>
          </p>
        </div>

        {/* Legal/Compliance Safe Badge */}
        <div className="z-10 flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-800/80 border border-slate-700/50 rounded-xl text-emerald-400 shrink-0 font-mono">
          <Shield size={13} className="text-emerald-400 stroke-[2.5]" />
          <span className="text-[8.5px] font-black uppercase tracking-widest leading-none">In-Memory Audit (No Auto-Save)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left main input & interactive list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 space-y-6">
            
            {/* Elegant Input Element */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-[10.5px] font-black uppercase tracking-widest text-slate-500 block ml-1">
                  Nieuwe Observatieregel toevoegen
                </label>
                <div className="text-[9px] font-mono font-medium text-slate-400">
                  Druk op <span className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 font-black">ENTER</span> om op te slaan
                </div>
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-slate-400 font-mono text-xs font-bold pointer-events-none select-none">
                  ❯
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Voer uw strakke observatieregel in..."
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl py-3.5 pl-9 pr-28 text-xs font-semibold text-slate-850 transition-all placeholder:text-slate-400/80 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:shadow-sm"
                />
                <button
                  onClick={handleAddItem}
                  disabled={!inputValue.trim()}
                  className={`absolute right-1.5 px-4 py-2 rounded-lg text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 ${
                    inputValue.trim() 
                      ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/10 cursor-pointer" 
                      : "bg-slate-200 text-slate-450 cursor-not-allowed"
                  }`}
                >
                  <Plus size={13} className="stroke-[3]" />
                  Toevoegen
                </button>
              </div>
            </div>

            {/* Premium status control row */}
            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  {items.length === 0 
                    ? "Geen actieve observaties" 
                    : `${completedCount} / ${items.length} OBSERVED TASKS RESOLVED`}
                </span>
              </div>

              {items.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="px-3.5 py-1.5 bg-white border border-slate-200/80 hover:bg-rose-50 hover:border-rose-250 hover:text-rose-600 text-[9.5px] font-black uppercase tracking-wider text-slate-500 rounded-lg transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Trash2 size={12} />
                  Alles opschonen
                </button>
              )}
            </div>

            {/* Beautiful, expensive looking checklist */}
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {items.length > 0 ? (
                  items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, x: -12, transition: { duration: 0.1 } }}
                      onClick={() => toggleCompleted(item.id)}
                      className={`group border rounded-xl p-4 flex gap-4 items-start cursor-pointer transition-all ${
                        item.completed 
                          ? "bg-slate-50/75 border-slate-205 text-slate-400" 
                          : "bg-white border-slate-200/95 hover:border-blue-400 hover:shadow-lg hover:shadow-slate-55/40 text-slate-800 shadow-sm"
                      }`}
                    >
                      {/* Checkbox styling with expensive transitions */}
                      <div className="mt-0.5 shrink-0 transition-transform active:scale-75">
                        {item.completed ? (
                          <div className="w-4.5 h-4.5 border border-emerald-500 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center">
                            <motion.svg 
                              initial={{ scale: 0.1 }}
                              animate={{ scale: 1 }}
                              className="w-3 h-3 stroke-[3]" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </motion.svg>
                          </div>
                        ) : (
                          <div className="w-4.5 h-4.5 border-2 border-slate-300 rounded group-hover:border-blue-500 transition-colors bg-white"></div>
                        )}
                      </div>

                      {/* Content details block */}
                      <div className="flex-1 space-y-1.5 min-w-0 pr-2">
                        <p className={`text-xs font-bold leading-relaxed break-words tracking-tight ${
                          item.completed ? "line-through text-slate-400 font-medium" : "text-slate-800"
                        }`}>
                          {item.text}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8.5px] font-mono tracking-wider font-semibold text-slate-400/80 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                            UTC {item.createdAt}
                          </span>
                        </div>
                      </div>

                      {/* Explicit Interactive Delete Button */}
                      <button
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 active:scale-95 shrink-0"
                        title="Verwijder regel"
                      >
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-16 border-2 border-dashed border-slate-150 rounded-2xl bg-slate-50/50 px-6 space-y-3.5">
                    <div className="w-12 h-12 bg-white border border-slate-200/85 rounded-xl shadow-sm flex items-center justify-center mx-auto">
                      <Eye size={20} className="text-slate-400" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1">
                      <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">Geen Actieve Observaties</h4>
                      <p className="text-[10px] text-slate-400 leading-normal font-bold">
                        Geen persoonlijke observaties opgesteld. Heeft u afwijkende bumpergroottes, verfvarianten of paneelhoeken ontdekt? Voeg ze hierboven snel toe.
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right instructions pane - Expensive styled card */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ClipboardCheck size={14.5} className="text-blue-600 stroke-[2.5]" />
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-widest">Systeem Kenmerken</h3>
            </div>
            
            <div className="text-[11px] leading-relaxed text-slate-500 space-y-4 font-semibold">
              <p>
                De tab <span className="text-slate-800 font-bold">Schade Observaties</span> dient als kantoorkladblok voor onmiddellijke, handmatig af te vinken checks.
              </p>
              
              {/* Premium callout block */}
              <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2.5 text-[9.5px] border border-slate-950 font-mono relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
                <div className="font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
                  ⚡ SECURE PROTOCOL
                </div>
                <p className="leading-normal font-medium text-slate-300">
                  Gegevens worden rechtstreeks berekend in het lokale RAM-geheugen van uw browser. Ze worden <strong className="text-white">nooit</strong> doorgestuurd naar servers of opgeslagen in gedeelde databases.
                </p>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3.5">
                <span className="text-[9.5px] font-black uppercase text-slate-400 block tracking-widest">Werkproces</span>
                <ul className="space-y-2 pl-1">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0">1.</span>
                    <span>Analyseer foto's en calculatieloops.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0">2.</span>
                    <span>Typ uw opmerkingen live in en druk op enter.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0">3.</span>
                    <span>Vink de gecontroleerde dossierspecifieke punten direct af.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
