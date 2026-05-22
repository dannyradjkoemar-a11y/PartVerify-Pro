import React from "react";
import { X, BookOpen, HelpCircle, FileText, CheckCircle2, AlertCircle, Sparkles, KeyRound, Smartphone, Mail } from "lucide-react";
import { motion } from "motion/react";

interface ManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManualModal({ isOpen, onClose }: ManualModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
      />

      {/* Manual Content Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 30 }}
        className="relative bg-white text-slate-900 rounded-[2.5rem] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 border border-slate-100 font-sans"
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between border-b border-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-white">Eenvoudige Handleiding</h2>
              <p className="text-[11px] text-blue-105 mt-0.5 font-medium opacity-90">PartVerify Pro — Developed by Danny Radjkoemar</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 bg-blue-805 hover:bg-blue-500 text-blue-100 hover:text-white rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 text-sm text-slate-600 leading-relaxed">
          
          {/* Welcome Disclaimer */}
          <div className="bg-blue-50/70 border border-blue-100 p-5 rounded-2xl flex gap-3.5 items-start">
            <Sparkles className="text-blue-600 shrink-0 mt-0.5" size={18} />
            <div>
              <h3 className="font-bold text-blue-900 text-xs uppercase tracking-wider">Heeft u hulp nodig of komt u er even niet uit?</h3>
              <p className="text-xs text-blue-800 mt-1">
                Geen zorgen! Hieronder leest u in zeer simpele taal hoe u de belangrijkste functies van PartVerify Pro stap-voor-stap kunt gebruiken en beheren.
              </p>
            </div>
          </div>

          {/* Section 1 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-black rounded-lg flex items-center justify-center">1</div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Hoe doe ik een snelle controle? ("Paste & Go")</h3>
            </div>
            <div className="pl-8 space-y-2">
              <p>
                Het controleren van inkoopfacturen tegen uw schadecalculatie is heel eenvoudig:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                <li>
                  <span className="font-bold text-slate-700">Stap A:</span> Selecteer eerst de <span className="font-bold">Opdrachtgever</span> bovenin het scherm (bijv. Allianz of Achmea).
                </li>
                <li>
                  <span className="font-bold text-slate-700">Stap B:</span> Open uw Schadecalculatieprogramma, kopieer de tekst van de calculatie (CTRL+A en daarna CTRL+C) en plak dit in het linkervak <span className="italic">"Plak Schadecalculatie tekst"</span>.
                </li>
                <li>
                  <span className="font-bold text-slate-700">Stap C:</span> Open de inkoopfactuur van uw onderdelenleverancier, kopieer de tekst en plak dit in het rechtervak <span className="italic">"Plak Inkoopfactuur tekst"</span>.
                </li>
                <li>
                  <span className="font-bold text-slate-700">Stap D:</span> Druk op de grote blauwe knop <span className="font-bold">"Verifiëren & Controleren"</span>. Het systeem rekent alles direct voor u uit!
                </li>
              </ul>
            </div>
          </div>

          {/* Section 2 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-black rounded-lg flex items-center justify-center">2</div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Het grote gele Kentekenplaat invoerveld</h3>
            </div>
            <div className="pl-8 space-y-2">
              <p>
                Bovenin het dashboard ziet u een realistische gele Nederlandse kentekenplaat:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
                <li>Wanneer u tekst plakt in de invoervelden, probeert het systeem <span className="font-bold">automatisch het kenteken</span> te herkennen en vult dit hier in.</li>
                <li>U kunt ook <span className="font-bold">zelf een kenteken typen</span>. Het systeem haalt dan direct live de openbare RDW-voertuiggegevens op, zoals merk, model, bouwjaar en catalogusprijs!</li>
              </ul>
            </div>
          </div>

          {/* Section 3 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-black rounded-lg flex items-center justify-center">3</div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Onderdeel-overrides handmatig aanpassen</h3>
            </div>
            <div className="pl-8 space-y-2">
              <p>
                Laat het systeem een prijsverschil of afwijking zien die u handmatig wilt corrigeren?
              </p>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-800">
                <span className="font-bold">Meteen aanpassen:</span> Klik in het resultatenoverzicht simpelweg op het <span className="font-bold">prijsveld</span> van het onderdeel dat u wilt wijzigen. Er verschijnt direct een invoerveld waarin u een nieuwe prijs kunt typen en op enter ramt. Dit omzeilt de automatische berekening op een veilige manier!
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-black rounded-lg flex items-center justify-center">4</div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Beveiliging & Microsoft Authenticator (2FA)</h3>
            </div>
            <div className="pl-8 space-y-2">
              <p>
                Voor extra beveiliging kunt u Twee-staps-verificatie (2FA) instellen op uw account:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
                <li>Ga naar de <span className="font-bold">Instellingenpagina</span> (het tandwiel-tandje in de hoek).</li>
                <li>Klik op <span className="font-bold">"Schakel Twee-factor authenticatie (2FA) in"</span>.</li>
                <li>Er verschijnt een QR-code op uw scherm. Scan deze met een app zoals <span className="font-bold text-slate-700">Microsoft Authenticator</span> of <span className="font-bold text-slate-700">Google Authenticator</span> op uw smartphone.</li>
                <li>Voer de 6-cijferige verificatiecode uit uw app in om te bevestigen. Vanaf nu is uw account optimaal beveiligd!</li>
              </ul>
            </div>
          </div>

          {/* Section 5 (Admin & God Mode) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-black rounded-lg flex items-center justify-center text-amber-600 bg-amber-50">5</div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider text-amber-800">God Mode & Gebruikersbeheer (Beheerder)</h3>
            </div>
            <div className="pl-8 space-y-2">
              <p>
                Als admin en eigenaar heeft u diepgaande controle via de verborgen <span className="font-bold text-amber-700">God Mode Developer Panel</span>:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                <li>
                  <span className="font-bold text-slate-700">Hoe te openen:</span> Klik exact <span className="font-bold text-slate-700">5 keer op de auto-logo</span> linksboven in de header. U heeft hier wel de login credentials van <span className="font-semibold text-slate-700">partverify-pro@outlook.com</span> voor nodig.
                </li>
                <li>
                  <span className="font-bold text-slate-700">Gebruikers en Rollen:</span> In God Mode kunt u alle actieve gebruikers inzien, specifieke gebruikers de rol <span className="font-bold">admin</span> of <span className="font-bold">user</span> toewijzen via een dropdown, of ze volledig verwijderen uit de database.
                </li>
                <li>
                  <span className="font-bold text-slate-700">Automatische User-rol:</span> Iedereen die wordt toegevoegd of inlogt, krijgt automatisch de veilige <span className="font-bold">user</span> rol toegewezen. Zo kan een gewone medewerker nooit zomaar systeem-instellingen wijzigen.
                </li>
                <li>
                  <span className="font-bold text-slate-700">Direct Nieuwe Gebruikers Aanmaken:</span> U kunt direct in God Mode een nieuw e-mailadres invoeren en opslaan. De code zorgt ervoor dat zij direct correct gekoppeld worden. Tevens is er een directe link naar de <span className="font-bold">Firebase Console</span> aanwezig om credentials aan te maken of te beheren.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 6 (Developed by) */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <HelpCircle size={20} />
              </div>
              <div>
                <span className="font-bold text-xs text-slate-700 block text-left">Heeft u technische ondersteuning nodig?</span>
                <span className="text-[11px] text-slate-400 block text-left">Neem rechtstreeks contact op met de maker.</span>
              </div>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl flex items-center gap-2 text-xs font-bold text-slate-700">
              <Mail size={14} className="text-blue-600" />
              <span>Danny Radjkoemar</span>
            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Developed by Danny Radjkoemar</span>
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-all"
          >
            Begrepen, sluiten
          </button>
        </div>
      </motion.div>
    </div>
  );
}
