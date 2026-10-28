import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calculator,
  BookOpen,
  Printer,
  RotateCcw,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';

interface VBTItem {
  id: string;
  desc: string;
  ae: number;
}

interface MatItem {
  id: string;
  desc: string;
  euro: number;
  isDouble: boolean;
}

interface ParsedResult {
  vbtAftrekAE: number | null;
  vbtUitleg: string;
  matAftrekEuro: number | null;
  matUitleg: string;
  samenvatting: string;
  stappen: string[];
  gevonden: any;
  controlePunten: string[];
}

interface AftrekcheckModuleProps {
  onBackToVerification?: () => void;
}

export const AftrekcheckModule: React.FC<AftrekcheckModuleProps> = ({ onBackToVerification }) => {
  const [activeTab, setActiveTab] = useState<'plak' | 'zelf' | 'ref'>('plak');

  // Tab 1: Plakken state (standaard 2 schades, uitbreidbaar t/m 10 via + knop)
  const [schades, setSchades] = useState<string[]>(['', '']);
  const [korting, setKorting] = useState<number>(12.5);
  const [plate, setPlate] = useState<string | null>(null);
  const [calcResult, setCalcResult] = useState<ParsedResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const addSchade = () => {
    if (schades.length < 10) {
      setSchades([...schades, '']);
    }
  };

  const removeSchade = (index: number) => {
    if (schades.length <= 2) return;
    setSchades(schades.filter((_, idx) => idx !== index));
  };

  const updateSchade = (index: number, val: string) => {
    setSchades(schades.map((s, idx) => (idx === index ? val : s)));
  };

  // Tab 2: Zelf rekenen state
  const [vbtRows, setVbtRows] = useState<VBTItem[]>([
    { id: '1', desc: 'Schade 1 – kunststof (bumper uitgebouwd)', ae: 14 },
    { id: '2', desc: 'Schade 2 – metaal', ae: 23 },
    { id: '3', desc: 'Schade 2 – kunststof (tweede materiaal)', ae: 5 },
  ]);
  const [matRows, setMatRows] = useState<MatItem[]>([
    { id: '1', desc: 'Materiaalconstante schade 1 (kunststof)', euro: 45.3, isDouble: true },
    { id: '2', desc: 'Materiaalconstante schade 2 (kunststof)', euro: 45.3, isDouble: false },
  ]);
  const [korting2, setKorting2] = useState<number>(12.5);

  const [qLak, setQLak] = useState<'2' | '1'>('2');
  const [qMat, setQMat] = useState<'metaal' | 'kunststof' | 'spot'>('metaal');
  const [qFase, setQFase] = useState('zwaar');
  const [qSit, setQSit] = useState<number>(0);
  const [qSpots, setQSpots] = useState<number>(1);
  const [qTweede, setQTweede] = useState<string>('zwaar');
  const [q2k, setQ2k] = useState<boolean>(false);

  // Drawer modal voor AZT-tabel
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Automatische detectie van Nederlands kenteken
  useEffect(() => {
    const PLATE_PATTERNS = [
      /\b[A-Z]{2}-?\d{2}-?\d{2}\b/,
      /\b\d{2}-?\d{2}-?[A-Z]{2}\b/,
      /\b\d{2}-?[A-Z]{2}-?\d{2}\b/,
      /\b[A-Z]{2}-?\d{2}-?[A-Z]{2}\b/,
      /\b[A-Z]{2}-?[A-Z]{2}-?\d{2}\b/,
      /\b\d{2}-?[A-Z]{2}-?[A-Z]{2}\b/,
      /\b\d{2}-?[A-Z]{3}-?\d\b/,
      /\b\d-?[A-Z]{3}-?\d{2}\b/,
      /\b[A-Z]-?\d{3}-?[A-Z]{2}\b/,
      /\b[A-Z]{2}-?\d{3}-?[A-Z]\b/,
      /\b[A-Z]{3}-?\d{2}-?[A-Z]\b/,
      /\b[A-Z]-?\d{2}-?[A-Z]{3}\b/,
      /\b\d-?[A-Z]{2}-?\d{3}\b/,
      /\b\d{3}-?[A-Z]{2}-?\d\b/,
    ];
    const txt = schades.join('\n').toUpperCase();
    let found: string | null = null;
    for (const re of PLATE_PATTERNS) {
      const m = txt.match(re);
      if (m) {
        const c = m[0].replace(/-/g, '');
        const matched =
          c.match(/^([A-Z0-9]{2})([A-Z0-9]{2})([A-Z0-9]{2})$/) ||
          c.match(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9])$/) ||
          c.match(/^([A-Z0-9])([A-Z0-9]{3})([A-Z0-9]{2})$/) ||
          c.match(/^([A-Z0-9])([A-Z0-9]{2})([A-Z0-9]{3})$/) ||
          c.match(/^([A-Z0-9]{3})([A-Z0-9]{2})([A-Z0-9])$/);
        found = matched ? matched.slice(1).join('-') : m[0];
        break;
      }
    }
    setPlate(found);
  }, [schades]);

  const parseAE = (str: string): number | null => {
    const m = String(str).replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  const parseCalc = (text: string) => {
    const up = text.toUpperCase();
    const lines = up.split(/\r?\n/);
    const out: {
      vbt: { mat: string; ae: number }[];
      mat: { mat: string; euro: number }[];
      lak: string | null;
      uitgebouwd: boolean;
      voorspuiten: boolean;
      spot: boolean;
    } = {
      vbt: [],
      mat: [],
      lak: null,
      uitgebouwd: false,
      voorspuiten: false,
      spot: false,
    };

    if (/\b3-?LAGEN|\b4-?LAGEN|MEERLAGEN/.test(up)) out.lak = 'meer';
    else if (/\b2-?LAGEN/.test(up)) out.lak = '2';
    else if (/\b1-?LAAG|1-?LAGEN|\bUNI\b/.test(up)) out.lak = '1';

    if (/MONT-?DELEN\s+UITGEB|UITGEB(OUWD)?|GEDEMONT|DEMONTAB/.test(up)) out.uitgebouwd = true;
    if (/VOORSPUIT/.test(up)) out.voorspuiten = true;
    if (/SPOT-?REPAIR|\bSPOTREP/.test(up)) out.spot = true;

    let pendingVbt: string | null = null;
    let pendingMat: string | null = null;

    lines.forEach((ln) => {
      let m = ln.match(/VOORBEREIDING\S*\s+(KUNSTSTOF|METAAL)\D*(-?\d+[.,]?\d*)/);
      if (m) {
        const val = parseAE(m[2]);
        if (val !== null) out.vbt.push({ mat: m[1] === 'KUNSTSTOF' ? 'kunststof' : 'metaal', ae: val });
        return;
      }
      m = ln.match(/VOORBEREIDING\s+(KUNSTSTOF|METAAL)\s*$/);
      if (m) {
        pendingVbt = m[1] === 'KUNSTSTOF' ? 'kunststof' : 'metaal';
        return;
      }
      if (pendingVbt) {
        const a = parseAE(ln);
        if (a !== null) {
          out.vbt.push({ mat: pendingVbt, ae: a });
          pendingVbt = null;
          return;
        }
      }

      m = ln.match(/MATERIAAL-?CONSTANTE\s+(KUNSTSTOF|METAAL)\D*(-?\d+[.,]?\d*)/);
      if (m) {
        const val = parseAE(m[2]);
        if (val !== null) out.mat.push({ mat: m[1] === 'KUNSTSTOF' ? 'kunststof' : 'metaal', euro: val });
        return;
      }
      m = ln.match(/MATERIAAL-?CONSTANTE\s+(KUNSTSTOF|METAAL)\s*$/);
      if (m) {
        pendingMat = m[1] === 'KUNSTSTOF' ? 'kunststof' : 'metaal';
        return;
      }
      if (pendingMat) {
        const a = parseAE(ln);
        if (a !== null) {
          out.mat.push({ mat: pendingMat, euro: a });
          pendingMat = null;
        }
      }
    });

    return out;
  };

  const handleCalculate = () => {
    setErrorMsg('');
    const ingevuld = schades
      .map((tekst, idx) => ({ tekst, schadeNr: idx + 1 }))
      .filter((item) => item.tekst.trim().length > 0);

    if (ingevuld.length < 2) {
      setErrorMsg('Voer a.u.b. minimaal twee calculaties (bijv. Schade 1 en Schade 2) in.');
      return;
    }

    const parsedList = ingevuld.map((item) => ({
      schadeNr: item.schadeNr,
      parsed: parseCalc(item.tekst),
    }));

    const hasMeer = parsedList.some((p) => p.parsed.lak === 'meer');
    const allOne = parsedList.every((p) => p.parsed.lak === '1');
    const lak = hasMeer ? 'meer' : allOne ? '1' : '2';

    const alleVbt = parsedList.flatMap((p) =>
      p.parsed.vbt.map((v) => ({ ...v, schade: p.schadeNr }))
    );
    const alleMat = parsedList.flatMap((p) =>
      p.parsed.mat.map((v) => ({ ...v, schade: p.schadeNr }))
    );

    const totVbt = alleVbt.reduce((a, v) => a + (v.ae || 0), 0);

    let juist = 0;
    const juistUitleg: string[] = [];

    if (alleVbt.length > 0) {
      const hoofd = alleVbt.reduce((a, b) => ((b.ae || 0) > (a.ae || 0) ? b : a));
      juist += hoofd.ae || 0;
      juistUitleg.push(`hoofdbewerking ${hoofd.mat} ${hoofd.ae} AE`);
      const hoofdMat = hoofd.mat;
      const andereMaterialen = Array.from(new Set(alleVbt.map((v) => v.mat))).filter((m) => m !== hoofdMat);
      andereMaterialen.forEach((m) => {
        const comb = lak === '1' ? 6 : 8;
        juist += comb;
        juistUitleg.push(`tweede materiaal ${m} ${comb} AE`);
      });
    }

    const vbtAftrek = Math.round((totVbt - juist) * 100) / 100;

    const perMat: Record<string, typeof alleMat> = {};
    alleMat.forEach((mm) => {
      if (!perMat[mm.mat]) perMat[mm.mat] = [];
      perMat[mm.mat].push(mm);
    });

    let dubbelEuro = 0;
    const matUitleg: string[] = [];
    Object.keys(perMat).forEach((matKey) => {
      const list = perMat[matKey].slice().sort((a, b) => (b.euro || 0) - (a.euro || 0));
      list.slice(1).forEach((x) => {
        dubbelEuro += x.euro || 0;
        matUitleg.push(`€ ${x.euro.toFixed(2).replace('.', ',')} (${matKey}, schade ${x.schade})`);
      });
    });

    const matNet = Math.round(dubbelEuro * (1 - korting / 100) * 100) / 100;

    const stappenList: string[] = [];
    stappenList.push(
      `Gevonden voorbereidingstijd (${ingevuld.length} schades): ${
        alleVbt.length > 0
          ? alleVbt.map((v) => `${v.mat} ${v.ae} AE (schade ${v.schade})`).join(', ')
          : 'geen'
      }.`
    );
    if (alleVbt.length > 0) {
      stappenList.push(`Bij één gecombineerde spuitgang telt: ${juistUitleg.join(' + ')} = ${juist} AE.`);
      stappenList.push(`Aftrek voorbereidingstijd: ${totVbt} AE − ${juist} AE = ${vbtAftrek} AE.`);
    }
    stappenList.push(
      `Gevonden materiaalconstante: ${
        alleMat.length > 0
          ? alleMat.map((m) => `${m.mat} € ${m.euro.toFixed(2).replace('.', ',')} (schade ${m.schade})`).join(', ')
          : 'geen'
      }.`
    );
    if (dubbelEuro > 0) {
      stappenList.push(
        `Dubbele constante: € ${dubbelEuro.toFixed(2).replace('.', ',')} min ${String(korting).replace('.', ',')}% korting = € ${matNet.toFixed(2).replace('.', ',')}. Dit bedrag kan worden ingevuld bij tekstzonecode 143.`
      );
    }

    const controleList: string[] = [];
    if (!alleVbt.length) controleList.push("Geen voorbereidingstijd gevonden. Controleer of 'VOORBEREIDING METAAL/KUNSTSTOF' in de tekst staat.");
    if (!alleMat.length) controleList.push("Geen materiaalconstante gevonden. Controleer of 'MATERIAAL-CONSTANTE' in de tekst staat.");
    if (lak === 'meer') controleList.push('Dit betreft een meerlagen laksysteem (3- of 4-lagen). Controleer de tijden in de AZT-naslagtabel.');
    controleList.push(
      ingevuld.length === 2
        ? 'Aangenomen is dat beide schades in één doorgang worden hersteld/gespoten.'
        : `Aangenomen is dat alle ${ingevuld.length} schades in één gecombineerde doorgang worden hersteld/gespoten.`
    );
    if (alleMat.length > 1) {
      controleList.push('Per materiaalsoort hoort slechts één materiaalconstante te worden gerekend. Het dubbele bedrag is gecorrigeerd conform korting.');
    }

    const samenvattingParts: string[] = [];
    if (alleVbt.length > 0) {
      samenvattingParts.push(`Breng ${vbtAftrek} AE voorbereidingstijd in mindering.`);
    }
    if (dubbelEuro > 0) {
      samenvattingParts.push(`Breng € ${matNet.toFixed(2).replace('.', ',')} materiaalconstante in mindering (tekstzonecode 143).`);
    }

    setCalcResult({
      vbtAftrekAE: vbtAftrek,
      vbtUitleg: juistUitleg.join(' + '),
      matAftrekEuro: dubbelEuro > 0 ? matNet : null,
      matUitleg: matUitleg.join(', ') || 'Geen dubbele materiaalconstante gevonden',
      samenvatting: samenvattingParts.join(' ') || 'Geen aftrekposten gedetecteerd conform ingevoerde tekst.',
      stappen: stappenList,
      gevonden: parsedList,
      controlePunten: controleList,
    });
  };

  const handleReset = () => {
    setSchades(['', '']);
    setCalcResult(null);
    setErrorMsg('');
    setPlate(null);
  };

  const loadExample = () => {
    setSchades([
      `CALCULATIE SCHADE 1 (VOORZIJDE)
KENTEKEN: 34-HBL-9
LAKSYSTEEM: 2-LAGEN METALLIC
VOORBEREIDING KUNSTSTOF 14 AE
MATERIAAL-CONSTANTE KUNSTSTOF € 45,30
MONT-DELEN UITGEBOUWD
SPUITEN BUMPER VOORZIJDE`,
      `CALCULATIE SCHADE 2 (ACHTERZIJDE)
KENTEKEN: 34-HBL-9
LAKSYSTEEM: 2-LAGEN METALLIC
VOORBEREIDING METAAL 23 AE
MATERIAAL-CONSTANTE METAAL € 45,30
MATERIAAL-CONSTANTE KUNSTSTOF € 45,30
SPUITEN ACHTERSCHERM EN ACHTERKLEP`,
    ]);
    setErrorMsg('');
  };

  const handleCopyReport = () => {
    if (!calcResult) return;
    const txt = `=== AE MODULE EXPERTISE RESULTAAT ===
${plate ? `Kenteken: ${plate}\n` : ''}Samenvatting: ${calcResult.samenvatting}

--- DETAILS VOORBEREIDINGSTIJD (VBT) ---
Aftrek VBT: ${calcResult.vbtAftrekAE} AE
Uitleg: ${calcResult.vbtUitleg}

--- DETAILS MATERIAALCONSTANTE (TEKSTZONE 143) ---
Aftrek Netto: € ${calcResult.matAftrekEuro !== null ? calcResult.matAftrekEuro.toFixed(2).replace('.', ',') : '0,00'}
Gedetecteerd: ${calcResult.matUitleg}

--- BEREKENINGSSTAPPEN ---
${calcResult.stappen.map((s, i) => `${i + 1}. ${s}`).join('\n')}

--- CONTROLEPUNTEN ---
${calcResult.controlePunten.map((c) => `• ${c}`).join('\n')}
=======================================`;

    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Zelf rekenen helpers
  const addVbtRow = () => {
    setVbtRows([
      ...vbtRows,
      { id: Date.now().toString(), desc: `Extra regel ${vbtRows.length + 1}`, ae: 8 },
    ]);
  };

  const removeVbtRow = (id: string) => {
    setVbtRows(vbtRows.filter((r) => r.id !== id));
  };

  const updateVbtRow = (id: string, field: 'desc' | 'ae', val: any) => {
    setVbtRows(
      vbtRows.map((r) => (r.id === id ? { ...r, [field]: field === 'ae' ? parseFloat(val) || 0 : val } : r))
    );
  };

  const addMatRow = () => {
    setMatRows([
      ...matRows,
      { id: Date.now().toString(), desc: `Constante ${matRows.length + 1}`, euro: 45.3, isDouble: true },
    ]);
  };

  const removeMatRow = (id: string) => {
    setMatRows(matRows.filter((r) => r.id !== id));
  };

  const updateMatRow = (id: string, field: 'desc' | 'euro' | 'isDouble', val: any) => {
    setMatRows(
      matRows.map((r) =>
        r.id === id ? { ...r, [field]: field === 'euro' ? parseFloat(val) || 0 : val } : r
      )
    );
  };

  // Berekening voor Tab 2 (Zelf rekenen)
  const manualTotVbt = vbtRows.reduce((sum, r) => sum + r.ae, 0);
  const manualHoofdAE = vbtRows.length > 0 ? Math.max(...vbtRows.map((r) => r.ae)) : 0;
  const manualCombiAE = qLak === '1' ? 6 : 8;
  const manualAllowedVbt = manualHoofdAE + (vbtRows.length > 1 ? manualCombiAE : 0);
  const manualVbtAftrek = Math.max(0, manualTotVbt - manualAllowedVbt);

  const manualDubbelBruto = matRows
    .filter((r) => r.isDouble)
    .reduce((sum, r) => sum + r.euro, 0);
  const manualDubbelNetto = Math.round(manualDubbelBruto * (1 - korting2 / 100) * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-12 px-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
              <img 
                src="/assets/aistudio/image_70c0586f.png" 
                alt="AE MODULE" 
                className="h-9 w-auto max-w-[170px] object-contain" 
                draggable={false}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  AE Module (Audatex / AZT Laknormen)
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">
                  Automatische controle VBT en materiaalconstanten
                </p>
                <span className="text-[10px] text-slate-300">•</span>
                <p className="text-[10px] text-orange-600 font-bold uppercase tracking-tight">
                  By Danny Radjkoemar
                </p>
              </div>
            </div>
          </div>

          {/* Quick Drawer trigger & Back button */}
          <div className="flex items-center gap-2">
            {onBackToVerification && (
              <button
                onClick={onBackToVerification}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all shadow-xs"
              >
                ← Terug naar Calculatie Verificatie
              </button>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all shadow-xs"
            >
              <BookOpen size={15} />
              AZT Naslagtabel Bekijken
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 max-w-md">
          <button
            onClick={() => setActiveTab('plak')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'plak'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            1. Plakken & Check
          </button>
          <button
            onClick={() => setActiveTab('zelf')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'zelf'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator size={15} />
            2. Zelf Rekenen
          </button>
          <button
            onClick={() => setActiveTab('ref')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'ref'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={15} />
            3. AZT Referentietabel
          </button>
        </div>
      </div>

      {/* TAB 1: PLAKKEN */}
      {activeTab === 'plak' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {schades.map((schadeTekst, index) => {
              const schadeNr = index + 1;
              const hint =
                schadeNr === 1
                  ? ' (bijv. Voorzijde)'
                  : schadeNr === 2
                  ? ' (bijv. Achterzijde)'
                  : '';
              const badgeColor =
                index % 2 === 0
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-violet-100 text-violet-700';

              return (
                <div
                  key={schadeNr}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-md ${badgeColor} font-black text-xs flex items-center justify-center`}
                      >
                        {schadeNr}
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm">
                        Calculatie Schade {schadeNr}
                        {hint}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Plak Audatex tekst
                      </span>
                      {index === schades.length - 1 && schades.length < 10 && (
                        <button
                          type="button"
                          onClick={addSchade}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all shadow-xs"
                          title={`Schade ${schades.length + 1} toevoegen (max. 10)`}
                        >
                          <Plus size={14} />
                          <span>Schade {schades.length + 1}</span>
                        </button>
                      )}
                      {index >= 2 && (
                        <button
                          type="button"
                          onClick={() => removeSchade(index)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title={`Verwijder Schade ${schadeNr}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={schadeTekst}
                    onChange={(e) => updateSchade(index, e.target.value)}
                    placeholder={`Plak hier de calculatietekst van schade ${schadeNr}...`}
                    className="w-full h-44 p-3 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs font-mono leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                  />
                </div>
              );
            })}
          </div>

          {schades.length < 10 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addSchade}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all shadow-xs"
              >
                <Plus size={15} />
                Extra Schade Toevoegen ({schades.length}/10)
              </button>
            </div>
          )}

          {/* Controls Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {plate && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-black tracking-wider">
                  <span>🚗 KENTEKEN:</span>
                  <span className="bg-amber-400 text-black px-2 py-0.5 rounded font-mono font-black">{plate}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600">Korting op materiaal (%):</label>
                <div className="relative w-24">
                  <input
                    type="number"
                    step="0.5"
                    value={korting}
                    onChange={(e) => setKorting(parseFloat(e.target.value) || 0)}
                    className="w-full pl-3 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={loadExample}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all"
              >
                Laad Voorbeeld
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 rounded-xl transition-all"
              >
                <RotateCcw size={14} />
                Wissen
              </button>
              <button
                type="button"
                onClick={handleCalculate}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.01]"
              >
                <Calculator size={15} />
                Bereken AE Module (AZT)
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Results Card */}
          {calcResult && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">AE Module Berekening & Uitkomst</h3>
                    <p className="text-xs text-slate-500">Conform de officiële AZT laknormen bij dubbele schades.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyReport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copied ? 'Gekopieerd!' : 'Kopieer Rapport'}
                  </button>
                </div>
              </div>

              {/* Samenvatting Banner */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 border border-indigo-200/80 rounded-xl flex items-start gap-3">
                <Sparkles size={20} className="text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-black text-indigo-950 uppercase tracking-wide">Eindadvies / Samenvatting</div>
                  <div className="text-sm font-bold text-slate-800">{calcResult.samenvatting}</div>
                </div>
              </div>

              {/* Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* VBT Kaart */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-indigo-900 uppercase">Voorbereidingstijd (VBT)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-200/60 text-indigo-800">Arbeid</span>
                  </div>
                  <div className="text-3xl font-black text-indigo-700">
                    {calcResult.vbtAftrekAE !== null ? `${calcResult.vbtAftrekAE} AE` : '0 AE'}
                  </div>
                  <p className="text-xs text-indigo-800 font-medium">
                    {calcResult.vbtUitleg ? `Toegestaan bij gecombineerd spuiten: ${calcResult.vbtUitleg}` : 'Geen aftrek berekend.'}
                  </p>
                </div>

                {/* Materiaalconstante Kaart */}
                <div className="p-4 rounded-xl border border-violet-200 bg-violet-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-violet-900 uppercase">Materiaalconstante (Tekstzone 143)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-violet-200/60 text-violet-800">Materiaal</span>
                  </div>
                  <div className="text-3xl font-black text-violet-700">
                    {calcResult.matAftrekEuro !== null
                      ? `€ ${calcResult.matAftrekEuro.toFixed(2).replace('.', ',')}`
                      : '€ 0,00'}
                  </div>
                  <p className="text-xs text-violet-800 font-medium">
                    {calcResult.matUitleg || 'Slechts 1 constante per materiaalsoort toegestaan.'}
                  </p>
                </div>
              </div>

              {/* Berekeningsstappen */}
              {calcResult.stappen.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-slate-500" />
                    Berekende Stappen & Formule
                  </h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    {calcResult.stappen.map((stap, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{stap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controlepunten */}
              {calcResult.controlePunten.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Info size={14} className="text-slate-500" />
                    Controle- & Aandachtspunten
                  </h4>
                  <div className="space-y-1.5">
                    {calcResult.controlePunten.map((pt, idx) => (
                      <div key={idx} className="p-2.5 bg-amber-50/70 border border-amber-200/60 rounded-lg text-xs font-medium text-amber-900 flex items-start gap-2">
                        <span className="text-amber-500 font-bold mt-0.5">•</span>
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ZELF REKENEN */}
      {activeTab === 'zelf' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Voorbereidingstijden Tabel */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">1. Voorbereidingstijden (VBT)</h3>
                  <p className="text-[11px] text-slate-500">Voeg alle berekende VBT regels toe van beide calculaties.</p>
                </div>
                <button
                  type="button"
                  onClick={addVbtRow}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
                >
                  <Plus size={14} />
                  Regel Toevoegen
                </button>
              </div>

              <div className="space-y-2">
                {vbtRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="text"
                      value={row.desc}
                      onChange={(e) => updateVbtRow(row.id, 'desc', e.target.value)}
                      placeholder="Omschrijving onderdeel / materiaal"
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="relative w-24">
                      <input
                        type="number"
                        value={row.ae}
                        onChange={(e) => updateVbtRow(row.id, 'ae', e.target.value)}
                        className="w-full pl-2.5 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">AE</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVbtRow(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Verwijderen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs space-y-1 text-indigo-900 font-medium">
                <div className="flex justify-between">
                  <span>Totaal berekend in beide dossiers:</span>
                  <strong className="font-bold">{manualTotVbt} AE</strong>
                </div>
                <div className="flex justify-between">
                  <span>Toegestane hoofdbewerking (hoogste):</span>
                  <strong className="font-bold">{manualHoofdAE} AE</strong>
                </div>
                {vbtRows.length > 1 && (
                  <div className="flex justify-between">
                    <span>Tweede materiaal toeslag ({qLak === '1' ? '1-laag (6 AE)' : '2-lagen (8 AE)'}):</span>
                    <strong className="font-bold">+{manualCombiAE} AE</strong>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-indigo-200 text-indigo-700 font-black">
                  <span>AFTREK VOORBEREIDINGSTIJD:</span>
                  <span className="text-sm font-black">{manualVbtAftrek} AE</span>
                </div>
              </div>
            </div>

            {/* Materiaalconstante Tabel */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">2. Materiaalconstante (Lakmateriaal)</h3>
                  <p className="text-[11px] text-slate-500">Vink de dubbele constante aan die in mindering moet worden gebracht.</p>
                </div>
                <button
                  type="button"
                  onClick={addMatRow}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
                >
                  <Plus size={14} />
                  Regel Toevoegen
                </button>
              </div>

              <div className="space-y-2">
                {matRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={row.isDouble}
                        onChange={(e) => updateMatRow(row.id, 'isDouble', e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-bold text-slate-500">Dubbel?</span>
                    </label>
                    <input
                      type="text"
                      value={row.desc}
                      onChange={(e) => updateMatRow(row.id, 'desc', e.target.value)}
                      placeholder="Omschrijving"
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">€</span>
                      <input
                        type="number"
                        step="0.01"
                        value={row.euro}
                        onChange={(e) => updateMatRow(row.id, 'euro', e.target.value)}
                        className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMatRow(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Verwijderen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                <span>Korting op lakmateriaal:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    value={korting2}
                    onChange={(e) => setKorting2(parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-right font-bold text-xs"
                  />
                  <span>%</span>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs space-y-1 text-indigo-900 font-medium">
                <div className="flex justify-between">
                  <span>Dubbele constante (bruto):</span>
                  <strong className="font-bold">€ {manualDubbelBruto.toFixed(2).replace('.', ',')}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Korting ({korting2}%):</span>
                  <strong className="font-bold">- € {(manualDubbelBruto * (korting2 / 100)).toFixed(2).replace('.', ',')}</strong>
                </div>
                <div className="flex justify-between pt-1 border-t border-indigo-200 text-indigo-700 font-black">
                  <span>AFTREK TEKSTZONECODE 143 (NETTO):</span>
                  <span className="text-sm font-black">€ {manualDubbelNetto.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Snelkiezer AZT parameters */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600" />
              Snelkiezer AZT Laknorm Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Laksysteem</label>
                <select
                  value={qLak}
                  onChange={(e) => setQLak(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="2">2-Lagen (Metallic / Parelmoer / Uni blank)</option>
                  <option value="1">1-Laag (Standaard Uni)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Materiaalsoort</label>
                <select
                  value={qMat}
                  onChange={(e) => setQMat(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="metaal">Metaal (Plaatwerk)</option>
                  <option value="kunststof">Kunststof (Bumpers, spiegels)</option>
                  <option value="spot">Spotrepair</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Schadefase / Bewerking</label>
                <select
                  value={qFase}
                  onChange={(e) => setQFase(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="licht">Fase 1 (Lichte schade / Nieuw deel)</option>
                  <option value="middel">Fase 2 (Middelmatige schade)</option>
                  <option value="zwaar">Fase 3 (Zware schade / Uitgebreid)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AZT REFERENTIETABEL */}
      {activeTab === 'ref' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <BookOpen size={18} className="text-indigo-600" />
                AZT Laknormen Naslagtabel
              </h3>
              <p className="text-xs text-slate-500">
                Officiële richtlijnen voor voorbereidingstijden (VBT), meervoudige spuitgangen en materiaalconstanten.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                title="Zoom uit"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-xs font-bold text-slate-500 min-w-12 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                title="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                title="Herstel zoom"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          <div
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
            className="transition-transform duration-150 space-y-6"
          >
            {/* Tabel 1: Voorbereidingstijden */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex justify-between">
                <span>1. AZT Normtijden Voorbereidingstijd (VBT)</span>
                <span className="text-slate-300 font-normal">Arbeidseenheden (10 AE = 1 Uur)</span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Omschrijving / Materiaalgroep</th>
                    <th className="p-3">1-Laags Systeem</th>
                    <th className="p-3">2-Lagen Systeem</th>
                    <th className="p-3">Meerlagen (3/4-Lagen)</th>
                    <th className="p-3">Toelichting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">Metaal – Lichte Schade (Fase 1 / K2)</td>
                    <td className="p-3 font-semibold">12 AE</td>
                    <td className="p-3 font-bold text-indigo-700">14 AE</td>
                    <td className="p-3">17 AE</td>
                    <td className="p-3 text-slate-500">Oppervlakkige schade / nieuw deel</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">Metaal – Middelmatige Schade (Fase 2 / K3)</td>
                    <td className="p-3 font-semibold">16 AE</td>
                    <td className="p-3 font-bold text-indigo-700">18 AE</td>
                    <td className="p-3">22 AE</td>
                    <td className="p-3 text-slate-500">Deel hersteld met plamuurwerk</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">Metaal – Zware Schade (Fase 3 / K4)</td>
                    <td className="p-3 font-semibold">20 AE</td>
                    <td className="p-3 font-bold text-indigo-700">23 AE</td>
                    <td className="p-3">27 AE</td>
                    <td className="p-3 text-slate-500">Grote reparatie / meervoudige delen</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-amber-50/30">
                    <td className="p-3 font-bold text-amber-900">Kunststof – Bumper (Uitgebouwd)</td>
                    <td className="p-3 font-semibold">11 AE</td>
                    <td className="p-3 font-bold text-amber-800">14 AE</td>
                    <td className="p-3">16 AE</td>
                    <td className="p-3 text-slate-500">Kunststof hechtprimer & elastificeerder</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-amber-50/30">
                    <td className="p-3 font-bold text-amber-900">Kunststof – Bumper (Ingebouwd)</td>
                    <td className="p-3 font-semibold">9 AE</td>
                    <td className="p-3 font-bold text-amber-800">11 AE</td>
                    <td className="p-3">13 AE</td>
                    <td className="p-3 text-slate-500">Afplakken montagedelen</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-indigo-900">Tweede Materiaal (Combinatietoeslag)</td>
                    <td className="p-3 font-bold text-indigo-700">6 AE</td>
                    <td className="p-3 font-black text-indigo-700">8 AE</td>
                    <td className="p-3 font-bold text-indigo-700">10 AE</td>
                    <td className="p-3 text-indigo-600 font-semibold">Vaste toeslag bij combi metaal + kunststof</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">Spotrepair / Deelreparatie</td>
                    <td className="p-3">6 AE</td>
                    <td className="p-3 font-semibold">8 AE</td>
                    <td className="p-3">10 AE</td>
                    <td className="p-3 text-slate-500">Plaatselijke herstelling per plek</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Richtlijnen Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Info size={15} className="text-indigo-600" />
                  Regel 1: Voorbereidingstijd bij Meervoudige Schades
                </h4>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Indien een voertuig voor meerdere schades in één spuitgang wordt behandeld, mag de voorbereidingstijd niet tweemaal volledig worden berekend. Er geldt:
                </p>
                <ul className="text-xs text-indigo-900/90 list-disc list-inside space-y-1">
                  <li><strong>Hoofdbewerking:</strong> De bewerking met de hoogste VBT (meestal metaal zwaar of uitgebouwde bumper).</li>
                  <li><strong>Tweede materiaal:</strong> Alleen de vaste toeslag (8 AE voor 2-lagen, 6 AE voor 1-laag).</li>
                  <li><strong>Aftrek:</strong> Totale VBT minus (Hoofdbewerking + Tweede materiaal toeslag).</li>
                </ul>
              </div>

              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Info size={15} className="text-indigo-600" />
                  Regel 2: Materiaalconstante (Tekstzonecode 143)
                </h4>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  De materiaalconstante dekt spuitklaar maken, reinigen en mengen van basislak/blanke lak:
                </p>
                <ul className="text-xs text-indigo-900/90 list-disc list-inside space-y-1">
                  <li>Slechts <strong>1 materiaalconstante per materiaalsoort</strong> per spuitgang is toegestaan.</li>
                  <li>Een dubbele materiaalconstante in schade 2 wordt in mindering gebracht onder <strong>tekstzonecode 143</strong>.</li>
                  <li>Indien er een overeengekomen lakmateriaal-korting geldt (bijv. 12,5%), wordt deze in mindering gebracht op het brutobedrag.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER MODAL VOOR AZT TABEL (toegankelijk vanuit elke tab) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <h3 className="font-bold text-slate-900 text-base">AZT Laknormen Naslagtabel</h3>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Bewerking</th>
                      <th className="p-3">1-Laag</th>
                      <th className="p-3">2-Lagen</th>
                      <th className="p-3">Meerlagen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="p-3 font-semibold">Metaal (Lichte schade)</td>
                      <td className="p-3">12 AE</td>
                      <td className="p-3 font-bold text-indigo-700">14 AE</td>
                      <td className="p-3">17 AE</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">Metaal (Middelmatige schade)</td>
                      <td className="p-3">16 AE</td>
                      <td className="p-3 font-bold text-indigo-700">18 AE</td>
                      <td className="p-3">22 AE</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">Metaal (Zware schade)</td>
                      <td className="p-3">20 AE</td>
                      <td className="p-3 font-bold text-indigo-700">23 AE</td>
                      <td className="p-3">27 AE</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">Kunststof Bumper (Uitgebouwd)</td>
                      <td className="p-3">11 AE</td>
                      <td className="p-3 font-bold text-amber-700">14 AE</td>
                      <td className="p-3">16 AE</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">Tweede Materiaal Toeslag</td>
                      <td className="p-3 font-bold">6 AE</td>
                      <td className="p-3 font-black text-indigo-700">8 AE</td>
                      <td className="p-3 font-bold">10 AE</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <strong>Let op:</strong> Bij gelijktijdig spuiten van schade 1 en schade 2 mag maximaal 1 hoofdbewerking + 1 tweede materiaaltoeslag gerekend worden. De rest is aftrek!
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AftrekcheckModule;
