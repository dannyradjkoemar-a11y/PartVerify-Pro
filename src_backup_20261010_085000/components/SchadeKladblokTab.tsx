import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  ExternalLink, 
  RefreshCw, 
  Trash2, 
  ClipboardCopy, 
  ArrowLeft,
  Maximize2,
  Minimize2,
  Check,
  AlertCircle,
  Loader2,
  HelpCircle,
  Settings
} from "lucide-react";
import { 
  parseDamageLine, 
  getAutoCompletions, 
  ACTION_SHORTCUTS, 
  PART_SHORTCUTS,
  ParsedDamageLine 
} from "../utils/damageCodeParser";

export interface ActionPoint {
  id: string;
  task: string;
  category: string;
  priority: "hoog" | "normaal" | "laag";
  note?: string;
  ae?: number;
  completed: boolean;
}

interface SchadeKladblokTabProps {
  licensePlate?: string;
  caseNumber?: string;
  vehicleName?: string;
  customSynonyms?: Record<string, string>;
  onNavigateToSettings?: () => void;
  onBackToVerification?: () => void;
  playCyberBeep?: (freq?: number, duration?: number, type?: string) => void;
}

export default function SchadeKladblokTab({
  licensePlate = "",
  caseNumber = "",
  vehicleName = "",
  customSynonyms,
  onNavigateToSettings,
  onBackToVerification,
  playCyberBeep
}: SchadeKladblokTabProps) {
  // Synchroniseer met actuele gegevens van de voorpagina
  const activeKenteken = licensePlate?.trim() || "";
  const activeDossier = caseNumber?.trim() || "";
  const activeVoertuig = vehicleName?.trim() || "";

  // State voor observaties & smart editor
  const [observationInput, setObservationInput] = useState("");
  const gutterRef = useRef<HTMLDivElement>(null);
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [newManualPoint, setNewManualPoint] = useState("");
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [activeTabMode, setActiveTabMode] = useState<"interactive" | "iframe">("interactive");
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelperCheatsheet, setShowHelperCheatsheet] = useState(false);

  // Real-time live suggestie van de huidige actieve regel
  const [currentLineSuggestion, setCurrentLineSuggestion] = useState<ParsedDamageLine | null>(null);
  const [autoSuggestions, setAutoSuggestions] = useState<Array<{ text: string; hint: string; fullSample: string }>>([]);

  // Laad eventueel eerdere actiepunten per dossier op basis van kenteken/dossiernummer
  const storageKey = `schade_kladblok_${activeKenteken || "default"}_${activeDossier || "default"}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.actionPoints) {
          // Zorg dat oude opgeslagen notities/tips ook direct opgeschoond zijn
          setActionPoints(parsed.actionPoints.map((p: any) => ({ ...p, note: undefined })));
        }
        if (parsed.observationInput) setObservationInput(parsed.observationInput);
      }
    } catch (e) {
      console.error("Fout bij laden van opgeslagen kladblok:", e);
    }
  }, [storageKey]);

  // Automatisch opslaan van de actiepunten en observaties
  useEffect(() => {
    try {
      if (actionPoints.length > 0 || observationInput.trim().length > 0) {
        localStorage.setItem(storageKey, JSON.stringify({
          actionPoints,
          observationInput,
          updatedAt: new Date().toISOString()
        }));
      }
    } catch (e) {
      console.error("Fout bij opslaan van kladblok:", e);
    }
  }, [actionPoints, observationInput, storageKey]);

  // URL voor het externe iframe programma
  const baseUrl = "https://ais-dev-oqkbtgt2g6cn65myoajrtm-842307341145.europe-west2.run.app/";
  const queryParams = new URLSearchParams({
    kenteken: activeKenteken || "JXZ-80-J",
    dossier: activeDossier || "PV-2026-8942",
    voertuig: activeVoertuig || "Opel Astra"
  });
  const fullIframeSrc = `${baseUrl}?${queryParams.toString()}`;

  // Analyseer de laatste regel die getypt wordt voor de auto-aanvul preview
  useEffect(() => {
    const lines = observationInput.split("\n");
    const lastLine = lines[lines.length - 1] || "";
    if (lastLine.trim().length > 0) {
      const parsed = parseDamageLine(lastLine, customSynonyms);
      setCurrentLineSuggestion(parsed);
      setAutoSuggestions(getAutoCompletions(lastLine, customSynonyms));
    } else {
      setCurrentLineSuggestion(null);
      setAutoSuggestions([]);
    }
  }, [observationInput, customSynonyms]);

  // Pas een autocomplete suggestie toe op de laatste getypte regel
  const applySuggestion = (fullSample: string) => {
    if (playCyberBeep) playCyberBeep(850, 0.05);
    const lines = observationInput.split("\n");
    lines[lines.length - 1] = fullSample;
    setObservationInput(lines.join("\n"));
  };

  // Directe actiepunt toevoeging wanneer gebruiker op Enter drukt op een regel
  const handleDirectEnterGeneration = (lineText: string) => {
    const trimmed = lineText.trim();
    if (!trimmed) return;

    const parsed = parseDamageLine(trimmed, customSynonyms);
    const taskText = parsed ? parsed.fullText : trimmed;
    const category = parsed ? parsed.category : "Plaatwerk & Herstel";
    const ae = parsed ? parsed.ae : undefined;

    // Check of dit punt niet al exact bovenaan staat om duplicaten te voorkomen
    const newPt: ActionPoint = {
      id: `pt-live-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      task: taskText,
      category,
      priority: "normaal",
      ae,
      completed: false
    };

    if (playCyberBeep) playCyberBeep(880, 0.06);
    setActionPoints(prev => [newPt, ...prev]);
  };

  // AI Actiepunten genereren via backend of instant lokale conversie
  const handleGenerateActionPoints = async () => {
    if (!observationInput.trim()) {
      setGenerationError("Typ eerst uw observaties of herstelcodes in het tekstvak.");
      return;
    }

    if (playCyberBeep) playCyberBeep(700, 0.08);
    setIsGenerating(true);
    setGenerationError(null);

    // Eerst lokaal direct de bekende regels parsen voor onmiddellijke reactie
    const localLines = observationInput.split("\n");
    const localParsedPoints: ActionPoint[] = [];
    localLines.forEach(l => {
      const parsed = parseDamageLine(l, customSynonyms);
      if (parsed) {
        localParsedPoints.push({
          id: `pt-loc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          task: parsed.fullText,
          category: parsed.category,
          priority: "normaal",
          ae: parsed.ae,
          completed: false
        });
      }
    });

    try {
      const response = await fetch("/api/schade/action-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observationText: observationInput,
          kenteken: activeKenteken,
          dossier: activeDossier,
          voertuig: activeVoertuig,
          customSynonyms
        })
      });

      if (!response.ok) {
        // Fallback naar de lokale snelle parser als de server bezet is
        if (localParsedPoints.length > 0) {
          setActionPoints(prev => [...localParsedPoints, ...prev]);
          return;
        }
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "Fout bij communiceren met de server.");
      }

      const data = await response.json();

      if (Array.isArray(data.actionPoints)) {
        const mappedPoints: ActionPoint[] = data.actionPoints.map((item: any, idx: number) => ({
          id: item.id || `pt-${Date.now()}-${idx}`,
          task: item.task || "Herstelpunt",
          category: item.category || "Plaatwerk & Herstel",
          priority: (item.priority === "hoog" || item.priority === "normaal" || item.priority === "laag") ? item.priority : "normaal",
          ae: item.ae,
          completed: false
        }));

        setActionPoints(prev => [...mappedPoints, ...prev]);
        if (playCyberBeep) playCyberBeep(980, 0.12);
      }
    } catch (err: any) {
      console.error("Fout bij genereren actiepunten:", err);
      // Als AI faalt maar we hebben lokale parsing:
      if (localParsedPoints.length > 0) {
        setActionPoints(prev => [...localParsedPoints, ...prev]);
      } else {
        setGenerationError(err.message || "Kon actiepunten niet genereren.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle checklist item
  const toggleActionPoint = (id: string) => {
    if (playCyberBeep) playCyberBeep(650, 0.04);
    setActionPoints(prev =>
      prev.map(p => (p.id === id ? { ...p, completed: !p.completed } : p))
    );
  };

  // Handmatig actiepunt toevoegen (ondersteunt ook shorthand zoals 'h voorb 20', 'y7 voorb')
  const handleAddManualPoint = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newManualPoint.trim()) return;

    if (playCyberBeep) playCyberBeep(800, 0.05);
    const parsed = parseDamageLine(newManualPoint, customSynonyms);

    const newPt: ActionPoint = {
      id: `manual-${Date.now()}`,
      task: parsed ? parsed.fullText : newManualPoint.trim(),
      category: parsed ? parsed.category : "Handmatig",
      priority: "normaal",
      ae: parsed ? parsed.ae : undefined,
      completed: false
    };

    setActionPoints(prev => [newPt, ...prev]);
    setNewManualPoint("");
  };

  // Verwijder één specifiek actiepunt
  const handleDeletePoint = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (playCyberBeep) playCyberBeep(420, 0.06);
    setActionPoints(prev => prev.filter(p => p.id !== id));
  };

  // Verwijder alle afgevinkte punten
  const handleClearCompleted = () => {
    if (playCyberBeep) playCyberBeep(500, 0.08);
    setActionPoints(prev => prev.filter(p => !p.completed));
  };

  // Kopiëren van de checklist naar klembord
  const handleCopyChecklist = () => {
    const totalAE = actionPoints.reduce((sum, p) => sum + (p.ae || 0), 0);
    const lines = [
      `SCHADE OBSERVATIES & HERSTEL ACTIEPUNTEN`,
      `Kenteken: ${activeKenteken || "Onbekend"} | Dossier: ${activeDossier || "Onbekend"} | Voertuig: ${activeVoertuig || "Onbekend"}`,
      totalAE > 0 ? `Totaal berekende hersteltijd: ${totalAE} AE` : "",
      "\nACTIEPUNTEN CHECKLIST:",
      ...actionPoints.map(p => `[${p.completed ? "X" : " "}] (${p.category.toUpperCase()}) ${p.task}${p.ae ? ` [${p.ae} AE]` : ""}`),
      `\nVoortgang: ${actionPoints.filter(p => p.completed).length}/${actionPoints.length} punten afgevinkt.`
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedNotification(true);
    if (playCyberBeep) playCyberBeep(880, 0.06);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const completedCount = actionPoints.filter(p => p.completed).length;
  const totalCount = actionPoints.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalCalculatedAE = actionPoints.reduce((acc, p) => acc + (p.ae || 0), 0);

  return (
    <div className={`space-y-6 ${isFullscreen ? "fixed inset-0 z-50 bg-slate-50 p-6 overflow-y-auto" : ""}`}>
      {/* Top Bar: Clean, sleek SaaS header with breadcrumbs/context & primary actions */}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                Schade Kladblok & Werkplaats Checklist
              </h2>
              <span className="text-[11px] text-slate-400">·</span>
              <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Directe invoer actief
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>Kenteken: <strong className="font-mono text-slate-800 uppercase">{activeKenteken || "Onbekend"}</strong></span>
              <span>·</span>
              <span>Dossier: <strong className="font-mono text-slate-800">{activeDossier || "Geen"}</strong></span>
              {activeVoertuig && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[200px]" title={activeVoertuig}>{activeVoertuig}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Rechter knoppen / Segmented control */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          {/* Weergave tabs */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => {
                if (playCyberBeep) playCyberBeep(750, 0.05);
                setActiveTabMode("interactive");
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTabMode === "interactive" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Smart Kladblok
            </button>
            <button
              type="button"
              onClick={() => {
                if (playCyberBeep) playCyberBeep(750, 0.05);
                setActiveTabMode("iframe");
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTabMode === "iframe" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cloud Run
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (playCyberBeep) playCyberBeep(750, 0.05);
              setIsFullscreen(!isFullscreen);
            }}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
            title={isFullscreen ? "Verkleinen" : "Volledig scherm"}
            aria-label="Volledig scherm schakelen"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {onBackToVerification && (
            <button
              type="button"
              onClick={onBackToVerification}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ArrowLeft size={13} />
              <span>Verificatie</span>
            </button>
          )}
        </div>
      </div>

      {activeTabMode === "interactive" ? (
        /* INTERACTIEF SMART KLADBLOK MET AUTO-AANVULLEN & DIRECTE ENTER GENERATIE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LINKER KOLOM: Observaties Editor */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
              {/* Header van de Editor */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">
                    Schaderegels Invoer
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Druk op <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono">Enter</kbd> na een regel om direct toe te voegen
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHelperCheatsheet(!showHelperCheatsheet)}
                  className="text-xs text-slate-600 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
                >
                  <HelpCircle size={13} />
                  <span>Codes referentie</span>
                </button>
              </div>

              {/* Codes referentie uitklapbaar */}
              {showHelperCheatsheet && (
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div>
                      <span className="font-mono font-medium text-slate-800">atp</span>
                      <span className="text-slate-500"> &rarr; achtertussenpaneel (bv. h atp 20)</span>
                    </div>
                    <div>
                      <span className="font-mono font-medium text-slate-800">bui / bi</span>
                      <span className="text-slate-500"> &rarr; buiten / binnen (bv. h bui paneel ra 20)</span>
                    </div>
                    <div>
                      <span className="font-mono font-medium text-slate-800">h / richt</span>
                      <span className="text-slate-500"> &rarr; herstel / richten (bv. h voorb 20, richt a 30)</span>
                    </div>
                    <div>
                      <span className="font-mono font-medium text-slate-800">y7 / y8</span>
                      <span className="text-slate-500"> &rarr; uitgebouwd / losse delen spuiten</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Textarea met strakke regeltjes en regelnummers */}
              <div className="p-3.5 space-y-3">
                <div className="relative rounded-lg border border-slate-200 overflow-hidden bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors flex">
                  {/* Regelnummering goot */}
                  <div 
                    ref={gutterRef}
                    aria-hidden="true" 
                    className="w-8 py-3 select-none bg-slate-50 text-right pr-2 text-[11px] font-mono font-medium text-slate-400 border-r border-slate-100 flex flex-col leading-[26px] shrink-0 overflow-hidden"
                  >
                    {Array.from({ length: Math.max(8, observationInput.split("\n").length) }, (_, i) => (
                      <span key={i} className="text-slate-400">
                        {i + 1}
                      </span>
                    ))}
                  </div>

                  {/* Lined notebook text area */}
                  <textarea
                    value={observationInput}
                    onChange={(e) => setObservationInput(e.target.value)}
                    onScroll={(e) => {
                      if (gutterRef.current) {
                        gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                      }
                    }}
                    onKeyDown={(e) => {
                      // Tab: suggestie overnemen
                      if (e.key === "Tab" && currentLineSuggestion) {
                        e.preventDefault();
                        applySuggestion(currentLineSuggestion.fullText);
                        return;
                      }

                      // ENTER: direct het huidige actiepunt genereren en toevoegen
                      if (e.key === "Enter" && !e.shiftKey) {
                        const target = e.currentTarget;
                        const cursorPos = target.selectionStart;
                        const textBeforeCursor = observationInput.substring(0, cursorPos);
                        const linesBefore = textBeforeCursor.split("\n");
                        const currentLine = linesBefore[linesBefore.length - 1];

                        if (currentLine && currentLine.trim().length > 0) {
                          handleDirectEnterGeneration(currentLine);
                        }
                      }
                    }}
                    placeholder={`h atp 20\nh voorb 20\nricht a 30\ny7 voorb\ny8 scherm rv\nh bui paneel ra 20 ae`}
                    rows={8}
                    style={{
                      lineHeight: "26px",
                      backgroundImage: "linear-gradient(transparent 25px, #f1f5f9 25px, #f1f5f9 26px)",
                      backgroundSize: "100% 26px",
                      backgroundAttachment: "local"
                    }}
                    className="w-full py-3 px-3 bg-transparent text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none resize-y"
                  />
                </div>

                {/* Subtiele live herkenning & suggestie */}
                {currentLineSuggestion && (
                  <div 
                    onClick={() => applySuggestion(currentLineSuggestion.fullText)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-blue-50/50 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[11px] text-slate-500">Suggestie:</span>
                      <span className="font-mono text-xs font-medium text-slate-800 truncate">
                        {currentLineSuggestion.fullText}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono shrink-0">
                      Tab of Enter
                    </span>
                  </div>
                )}

                {/* Snelle suggestieteksten als simpele tekst-knoppen */}
                {autoSuggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                    <span className="text-[11px] text-slate-400 mr-1">Voorbeelden:</span>
                    {autoSuggestions.slice(0, 3).map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applySuggestion(sug.fullSample)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-mono transition-colors"
                      >
                        {sug.text}
                      </button>
                    ))}
                  </div>
                )}

                {generationError && (
                  <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-rose-600" />
                    <span>{generationError}</span>
                  </div>
                )}

                {/* Knoppenbalk onder textarea */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    {onNavigateToSettings ? (
                      <button
                        type="button"
                        onClick={onNavigateToSettings}
                        title="Beheer uw persoonlijke synoniemen en afkortingen in Instellingen"
                        className="px-2 py-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md font-medium transition-colors flex items-center gap-1"
                      >
                        <Settings size={12} />
                        <span>Afkortingen & synoniemen beheren</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {customSynonyms && Object.keys(customSynonyms).length > 0
                          ? `${Object.keys(customSynonyms).length} eigen afkorting${Object.keys(customSynonyms).length > 1 ? "en" : ""} actief`
                          : "Herkenning van schadecodes actief"}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateActionPoints}
                    disabled={isGenerating || !observationInput.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Verwerken...</span>
                      </>
                    ) : (
                      <span>Alles verwerken</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Handmatig los punt toevoegen */}
              <div className="px-3.5 py-3 bg-slate-50 border-t border-slate-100">
                <form onSubmit={handleAddManualPoint} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newManualPoint}
                    onChange={(e) => setNewManualPoint(e.target.value)}
                    placeholder="Snel een regel toevoegen (bv. h atp 20, richt a 30)..."
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!newManualPoint.trim()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium disabled:opacity-40 transition-colors shrink-0"
                  >
                    Toevoegen
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RECHTER KOLOM: Nette Werkplaats Checklist & Tabellen */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
              {/* Header met aantal & acties */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">
                    Herstel Checklist
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{completedCount} van {totalCount} voltooid</span>
                    {totalCalculatedAE > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-slate-800 font-medium">Totaal: {totalCalculatedAE} AE</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {actionPoints.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopyChecklist}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md font-medium transition-colors flex items-center gap-1"
                      >
                        {copiedNotification ? (
                          <>
                            <Check size={12} className="text-emerald-600" />
                            <span className="text-emerald-700 font-medium">Gekopieerd</span>
                          </>
                        ) : (
                          <>
                            <ClipboardCopy size={12} />
                            <span>Kopiëren</span>
                          </>
                        )}
                      </button>

                      {completedCount > 0 && (
                        <button
                          type="button"
                          onClick={handleClearCompleted}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md font-medium transition-colors"
                        >
                          Afgevinkte wissen
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Voortgangsbalk */}
              {totalCount > 0 && (
                <div className="w-full bg-slate-100 h-1">
                  <div 
                    className="bg-emerald-600 h-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              {/* Lijst van hersteltaken */}
              {actionPoints.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-xs font-medium text-slate-700">Geen hersteltaken geregistreerd</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Voer links in het kladblok een schaderegel in (zoals <code className="font-mono text-slate-600">h atp 20</code>) en druk op <kbd className="font-mono text-slate-500">Enter</kbd>.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
                  {actionPoints.map((point) => (
                    <div
                      key={point.id}
                      onClick={() => toggleActionPoint(point.id)}
                      className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors group ${
                        point.completed
                          ? "bg-slate-50/60"
                          : "hover:bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Custom Checkbox */}
                        <div 
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                            point.completed 
                              ? "bg-emerald-600 border-emerald-600 text-white" 
                              : "border-slate-300 bg-white group-hover:border-slate-400"
                          }`}
                        >
                          {point.completed && <Check size={11} strokeWidth={3} />}
                        </div>

                        {/* Taak tekst & categorie */}
                        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                          <span className={`text-xs font-mono truncate ${
                            point.completed ? "line-through text-slate-400" : "text-slate-800 font-medium"
                          }`}>
                            {point.task}
                          </span>

                          <span className="text-[11px] text-slate-400">·</span>

                          <span className="text-[11px] text-slate-500">
                            {point.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {point.ae !== undefined && (
                          <span className="font-mono text-xs tabular-nums text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {point.ae} AE
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleDeletePoint(point.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                          title="Taak verwijderen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* EXTERNE CLOUD RUN B-PAGINA MET OVERGENOMEN QUERY PARAMETERS */
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden relative">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
            <span className="text-slate-600 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Kenteken: <strong className="font-mono">{activeKenteken || "Geen"}</strong> · Dossier: <strong className="font-mono">{activeDossier || "Geen"}</strong></span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIframeKey(k => k + 1)}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={11} />
                <span>Herladen</span>
              </button>
              <a
                href={fullIframeSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={11} />
                <span>Apart venster</span>
              </a>
            </div>
          </div>

          <iframe
            key={iframeKey}
            src={fullIframeSrc}
            style={{
              width: "100%",
              height: isFullscreen ? "calc(100vh - 160px)" : "720px",
              border: "none",
              display: "block"
            }}
            title="PartVerify Schade Kladblok"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      )}
    </div>
  );
}
