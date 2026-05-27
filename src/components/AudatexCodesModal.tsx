/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Search, Copy, Check, Info, ArrowRight, Tag, Hammer, HelpCircle, FileText, Settings, Sparkles } from 'lucide-react';

export interface AudatexCode {
  code: string;
  description: string;
  category: string;
  unit?: string;
}

export const AUDATEX_CATEGORIES = {
  BIJZONDERE_BEWERKING: "Bijzondere bewerkingscodes",
  NIEUWSPUITEN_KUNSTSTOF: "Bewerkingscodes nieuwspuiten kunststofdelen (AZT)",
  MUTATIECODES: "Mutatiecodes",
  MUTATIECODES_AZT: "Mutatiecodes AZT (TZ-code 51)",
  TEKSTZONE_ONDERDELEN: "Tekstzonecodes Onderdelen",
  CONTROLEGEGEVENS: "Schadecalculatie Controlegegevens",
  TEKSTZONE_ARBEIDSLOON: "Tekstzonecodes Arbeidsloon",
  TEKSTZONE_SPUITLOON: "Tekstzonecodes Spuitloon",
  TEKSTZONE_SPUITMATERIAAL: "Tekstzonecodes Spuitmateriaal",
  TEKSTZONE_REPARATIEKOSTEN: "Tekstzonecodes Reparatiekosten",
  TEKSTZONE_OVERIGE_KOSTEN: "Tekstzonecodes Overige kosten"
};

export const AUDATEX_CODES: AudatexCode[] = [
  // BIJZONDERE BEWERKINGSCODES
  { code: "BV AE", description: "Maakt van een V een B (Opgave, AE verplicht)", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "CV AE", description: "Maakt van een V een C (AE verplicht)", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "HV AE", description: "Maakt van een V een H (verplicht)", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "SVV AE", description: "Maakt van een V een S", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "S0", description: "Onderdrukken spuitwerk", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "SB", description: "Spuitwerk nog bruikbaar", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "SH1", description: "SH bij > 50% plamuuroppervlak (niet voor kunststof spuiten AZT)", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "D", description: "Uitdeuken Zonder Spuiten (UZS)", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },
  { code: "LS", description: "Spot repair", category: AUDATEX_CATEGORIES.BIJZONDERE_BEWERKING },

  // BEWERKINGSCODES NIEUWSPUITEN KUNSTSTOFDELEN (AZT)
  { code: "SV1", description: "Onderdeel met grondlak - onderdeel ruw, enkel hechtlaag", category: AUDATEX_CATEGORIES.NIEUWSPUITEN_KUNSTSTOF },
  { code: "SV2", description: "Onderdeel ruw met filler, zonder schuren (nat in nat)", category: AUDATEX_CATEGORIES.NIEUWSPUITEN_KUNSTSTOF },
  { code: "SV3", description: "Onderdeel ruw met filler, met schuren", category: AUDATEX_CATEGORIES.NIEUWSPUITEN_KUNSTSTOF },
  { code: "SV4", description: "Onderdeel PUR ruw met filler, met schuren", category: AUDATEX_CATEGORIES.NIEUWSPUITEN_KUNSTSTOF },

  // MUTATIECODES
  { code: "MM %", description: "Toeslag op onderdeel", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "%" },
  { code: "WM %", description: "Aftrek op onderdeel", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "%" },
  { code: "PM %", description: "Aftrek van een onderdeel inclusief extra onderdelen", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "%" },
  { code: "UM %", description: "Toeslag op een onderdeel inclusief extra onderdelen", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "%" },
  { code: "GM €", description: "Opgave spuitmateriaalvergoeding", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "HM €", description: "Opgave reparatievergoeding", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "SM €", description: "Opgave spuitloonvergoeding (excl. spuitmateriaal en voorbereidingstijd)", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "VM €", description: "Mutatie onderdeelprijs", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "BM €", description: "Onderdeelprijs mutatie. Onderdeelnummer zichtbaar & oorspronkelijke prijs op controleblad", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "NP €", description: "Prijsmutatie per hoeveelheid", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "FO €", description: "Onderdeelprijs onderdrukken", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "€" },
  { code: "TM", description: "Type Mutatie (bijv. alternatief onderdeel)", category: AUDATEX_CATEGORIES.MUTATIECODES },
  { code: "NR", description: "Hoeveelheid mutatie", category: AUDATEX_CATEGORIES.MUTATIECODES },
  { code: "PW %", description: "Afwijkend BTW percentage per onderdeel", category: AUDATEX_CATEGORIES.MUTATIECODES, unit: "%" },
  { code: "PZ", description: "Onderdeel zonder korting toeslag TZC 122", category: AUDATEX_CATEGORIES.MUTATIECODES },

  // MUTATIECODES AZT
  { code: "AM €", description: "Bedrag aftrek NVO spuitwerk", category: AUDATEX_CATEGORIES.MUTATIECODES_AZT, unit: "€" },
  { code: "QM dm2", description: "Mutatie oppervlakte spuiten", category: AUDATEX_CATEGORIES.MUTATIECODES_AZT, unit: "dm²" },

  // TEKSTZONECODES ONDERDELEN
  { code: "10 €", description: "Totaalbedrag onderdelen (met specificatie)", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "13 €", description: "Aftrek prijs nog bruikbare delen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "14 €", description: "Aftrek prijs nog bruikbare delen bij carrosserie/cabine", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "20 %", description: "Korting op totaalbedrag onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "21 %", description: "Toeslag op totaalbedrag onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "22 %", description: "Korting over alle (individuele) onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "23 %", description: "Toeslag over alle (individuele) onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "24 %", description: "Aftrek NVO van totaalbedrag onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "26 €", description: "Kleinmateriaal ondergrens", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "27 €", description: "Totaalbedrag kleinmateriaal", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "28 %", description: "Kleinmateriaal als percentage van onderdelenbedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "29 %", description: "Kleinmateriaal als percentage van arbeidsloonbedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "92 %", description: "Kleinmateriaal als percentage van de totale reparatiekosten", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "93 €", description: "Kleinmateriaal bovengrens", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "€" },
  { code: "120 %", description: "Aftrek of toeslag op totaalbedrag onderdelen incl. kleinmateriaal", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "121 %", description: "Aftrek NVO totaalbedrag onderdelen, incl. kleinmateriaal", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },
  { code: "122 %", description: "Korting of toeslag op totaalbedrag onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_ONDERDELEN, unit: "%" },

  // SCHADECALCULATIE CONTROLEGEGEVENS
  { code: "O", description: "Ontbrekende bewerking", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "EL", description: "Geëlimineerde bewerking", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "DO", description: "Dubbel opgevoerde bewerking", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "OB", description: "Opgenomen bewerking (reeds gecontroleerd)", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "E", description: "Extra bewerking toegevoegd", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },

  // TEKSTZONECODES ARBEIDSLOON
  { code: "30 €", description: "Totaalbedrag arbeidsloon (met specificatie)", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "€" },
  { code: "31 AE", description: "Totale arbeidsduur (met specificatie)", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "AE" },
  { code: "32 €", description: "Bijzondere verrichting vergoeding op arbeidsloon", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "€" },
  { code: "33 %", description: "Aftrek op arbeidsloon", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "%" },
  { code: "34 AE", description: "Aftrek van arbeidsduur", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "AE" },
  { code: "38 %", description: "Toeslag op arbeidsloon (bijv. complexiteit)", category: AUDATEX_CATEGORIES.TEKSTZONE_ARBEIDSLOON, unit: "%" },

  // TEKSTZONECODES SPUITLOON
  { code: "52 €", description: "Totaalbedrag spuitloon", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "€" },
  { code: "54 AE", description: "Totale spuitduur met specificatie", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "AE" },
  { code: "55 €", description: "Totaalbedrag spuitloon met specificatie", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "€" },
  { code: "56 €", description: "Aftrek NVO van totaalbedrag spuitwerk", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "€" },
  { code: "58 %", description: "Aftrek NVO van totaalbedrag spuitwerk", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "%" },
  { code: "59 %", description: "Aftrek spuitloonbedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "%" },
  { code: "75 %", description: "Toeslag op spuitloon", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "%" },
  { code: "82 €", description: "Spuitbedrag overig", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "€" },
  { code: "143 €", description: "Aftrek/Toeslag spuitbedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITLOON, unit: "€" },

  // TEKSTZONECODES SPUITMATERIAAL
  { code: "40 %", description: "Spuitmateriaal toeslag als % van spuitloon", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "%" },
  { code: "42 €", description: "Spuitmateriaalbedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "€" },
  { code: "45", description: "Spuitbedrag per dm² (veelal Fiat, Renault)", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL },
  { code: "51 %", description: "AZT spuitsysteem index", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "%" },
  { code: "81", description: "Fabrieksspuitsysteem; o.a. Ford (garantieclaims)", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL },
  { code: "110 %", description: "Toeslag spuitmateriaal percentage", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "%" },
  { code: "111 %", description: "Aftrek spuitmateriaal percentage", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "%" },
  { code: "112 %", description: "Aftrek Nieuw Voor Oud (NVO) van spuitmateriaal", category: AUDATEX_CATEGORIES.TEKSTZONE_SPUITMATERIAAL, unit: "%" },

  // TEKSTZONECODES REPARATIEKOSTEN
  { code: "02 %", description: "Wijziging BTW percentage", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "%" },
  { code: "76 %", description: "Milieutoeslag als % van onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "%" },
  { code: "77 €", description: "Milieutoeslag als vast bedrag", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€" },
  { code: "80 €/AE", description: "Milieutoeslag arbeids- en spuitloon (incl. UZS)", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€/AE" },
  { code: "88 %", description: "Aftrek van totale reparatiekosten", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "%" },
  { code: "89 €", description: "Aftrek van totale reparatiekosten (vast bedrag)", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€" },
  { code: "90 AE", description: "Begrotingskosten reparateur (calculatietarief)", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "AE" },
  { code: "91 €", description: "Aftrek eigen risico", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€" },
  { code: "95 €", description: "Aftrek eerste schade", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€" },
  { code: "123 €/AE", description: "Milieutoeslag klasse 1-4 (arbeids- en spuitloon)", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€/AE" },
  { code: "124 €/AE", description: "Milieutoeslag klasse 5 (arbeidsloon van UZS)", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€/AE" },
  { code: "125 %", description: "Milieutoeslag als percentage van de reparatiekosten", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "%" },
  { code: "126 €", description: "Milieutoeslag als bovengrens van de reparatiekosten", category: AUDATEX_CATEGORIES.TEKSTZONE_REPARATIEKOSTEN, unit: "€" },

  // TEKSTZONECODES OVERIGE KOSTEN
  { code: "60 €", description: "Transportkosten onderdelen", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "61 €", description: "Transportkosten carrosserie/cabine", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "63 €", description: "Hulpstoffen (bijv. vetten / klemmen)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "65 €", description: "Bekledingswerkzaamheden extra", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "66 €", description: "Lijm- en kitmateriaal (ruiten / naden)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "67 €", description: "Poetsen, wassen en reinigen van het voertuig", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "68 €", description: "Voertuigtransport of berging", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "69 €", description: "Noodreparatie (tijdelijk rijklaar maken)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "70 €", description: "Anti-roestbehandeling (Dinitrol of soortgelijk)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "71 €", description: "Anti-roestbehandeling specifiek carrosseriedelen", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "72 €", description: "Bescherming holle ruimte (waxbehandeling)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "73 €", description: "Bescherming holle ruimte carrosserie (aanvullend)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "74 €", description: "Uitlijnen wielen (stuurgeometrie instellen)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "135 €", description: "Kosten Vervangend Vervoer (automatisch berekend)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },
  { code: "136 €", description: "Kosten Vervangend Vervoer (handmatig tekstueel ingevoerd)", category: AUDATEX_CATEGORIES.TEKSTZONE_OVERIGE_KOSTEN, unit: "€" },

  // ADDITIONAL NOTABLE SYSTEM CODES PASTE HELPER
  { code: "0016", description: "Foutgeheugen uitlezen vóór reparatie (Systeemcode)", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "0017", description: "Foutgeheugen uitlezen ná reparatie (Systeemcode)", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
  { code: "0018", description: "Gezamenlijk Uitlijnen & ADAS Kalibratie", category: AUDATEX_CATEGORIES.CONTROLEGEGEVENS },
];

export function findAudatexCodeDescription(rawCode: string): string | null {
  const clean = rawCode.trim().toUpperCase();
  // Strip trailing % or € symbols to search flexibly
  const baseClean = clean.replace(/[\s€%]/g, '');
  
  const found = AUDATEX_CODES.find(item => {
    const itemBase = item.code.toUpperCase().replace(/[\s€%]/g, '');
    return itemBase === baseClean || item.code.toUpperCase() === clean;
  });
  
  return found ? found.description : null;
}

interface AudatexCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AudatexCodesModal({ isOpen, onClose }: AudatexCodesModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const categories = useMemo(() => {
    return [
      { id: 'ALL', name: 'Alle Categorieën' },
      ...Object.entries(AUDATEX_CATEGORIES).map(([key, value]) => ({
        id: value,
        name: value
      }))
    ];
  }, []);

  const filteredCodes = useMemo(() => {
    return AUDATEX_CODES.filter(item => {
      const matchSearch = 
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [searchQuery, selectedCategory]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        id="audatex-modal-backdrop"
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative bg-white rounded-[32px] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100"
        id="audatex-modal-container"
      >
        {/* Decorative Top Accent line */}
        <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 shrink-0" />

        {/* Modal Header */}
        <div className="p-6 md:p-8 flex items-start justify-between border-b border-slate-100 shrink-0 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 px-2 bg-blue-100 text-blue-700 rounded-full font-mono text-[10px] uppercase font-black tracking-wide border border-blue-200">
                Solera Audatex
              </span>
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                <Sparkles size={11} className="animate-pulse" />
                <span>Geïntegreerd in controle</span>
              </div>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Audatex Codekaart Reference
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Snelzoeker en betekenisoverzicht van de officiële Audatex tekstzonecodes, mutatiecodes en controle-aanduidingen.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            id="close-audatex-modal-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body with Scrollable Layout */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Controls Bar: Search & Category Filter */}
          <div className="p-6 bg-white border-b border-slate-100 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder="Zoek op code (bijv. 74 of SV1) of omschrijving (bijv. uitlijnen)..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-800 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <select
                className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 text-slate-700 font-semibold rounded-2xl border border-slate-200 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm cursor-pointer"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto px-6 py-4 bg-slate-50/20">
            {filteredCodes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCodes.map((item, index) => {
                  const isCopied = copiedCode === item.code;
                  const isAlignmentSpecial = item.code === "74" || item.code === "0018";
                  const isCalibrationSpecial = item.code === "0016" || item.code === "0017" || item.code === "0018";
                  
                  return (
                    <div 
                      key={`${item.code}-${index}`}
                      className={`p-4 rounded-2xl border bg-white transition-all duration-300 flex flex-col justify-between hover:shadow-md hover:border-slate-300 group ${
                        isAlignmentSpecial ? 'border-emerald-200/80 bg-emerald-50/10' : 
                        isCalibrationSpecial ? 'border-blue-200/80 bg-blue-50/10' : 'border-slate-100'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-sm font-black px-2.5 py-1 rounded-xl shadow-sm ${
                            isAlignmentSpecial ? 'bg-emerald-100 text-emerald-800' :
                            isCalibrationSpecial ? 'bg-blue-100 text-blue-800' : 'bg-slate-900 text-white'
                          }`}>
                            {item.code}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 tracking-tight block uppercase">
                            {item.category.replace('Tekstzonecodes ', '')}
                          </span>
                        </div>
                        <p className="text-slate-800 font-semibold text-sm leading-snug">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100/50 flex items-center justify-between text-[11px] font-medium text-slate-400">
                        <div className="flex items-center gap-1.5">
                          {item.unit && (
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono text-[10px] font-bold">
                              Eenheid: {item.unit}
                            </span>
                          )}
                          {(isAlignmentSpecial || isCalibrationSpecial) && (
                            <span className="text-[10px] font-bold bg-amber-100/70 text-amber-800 px-1.5 py-0.5 rounded italic">
                              Auto-controleert 🛠️
                            </span>
                          )}
                        </div>
                        <button 
                          onClick={() => handleCopy(item.code)}
                          className="flex items-center gap-1 text-slate-400 group-hover:text-blue-500 hover:text-blue-600 transition-colors py-1 px-2 rounded-lg hover:bg-slate-50 select-none btn-copy-code"
                        >
                          {isCopied ? (
                            <>
                              <Check size={12} className="text-emerald-500" />
                              <span className="text-emerald-600 text-[10px] font-bold">Gekopieerd!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span className="text-[10px]">Kopieer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-white border border-dashed border-slate-200 rounded-3xl">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h4 className="text-slate-800 font-bold text-base">Geen Audatex codes gevonden</h4>
                  <p className="text-slate-500 text-xs max-w-sm">
                    Geen resultaat dat matcht met "{searchQuery}". Probeer te zoeken op een kortere term of selecteer een andere categorie.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 md:px-8 py-5 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-medium text-slate-500">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-blue-500 shrink-0" />
            <span>Bij invoeren van calculatieteksten herkent het dashboard automatisch deze codes en stelt de controle-indicatoren direct nauwkeurig in.</span>
          </div>
          <div className="flex items-center gap-1.5 self-end text-slate-400 select-none">
            <span>Developed by Danny Radjkoemar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
