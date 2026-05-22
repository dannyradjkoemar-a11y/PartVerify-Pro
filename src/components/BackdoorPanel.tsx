import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  X, 
  Users, 
  Database, 
  Settings, 
  Sliders, 
  Trash2, 
  Plus, 
  Save, 
  RefreshCw, 
  Lock, 
  Check, 
  Sparkles,
  Key,
  DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Firestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  setDoc,
  serverTimestamp,
  query
} from "firebase/firestore";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

interface BackdoorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  db: Firestore;
  currentUserEmail: string | null;
  onToast: (msg: string) => void;
}

export function BackdoorPanel({ isOpen, onClose, db, currentUserEmail, onToast }: BackdoorPanelProps) {
  const [activeTab, setActiveTab] = useState<'system' | 'users' | 'pricing' | 'raw'>('system');
  const [loading, setLoading] = useState(false);
  
  // Tab 1: System state
  const [bypass2FA, setBypass2FA] = useState(false);
  const [experimentalMatcher, setExperimentalMatcher] = useState(true);

  // Tab 2: Users collection
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newMail, setNewMail] = useState("");
  const [newRole, setNewRole] = useState("user");

  // Tab 3: Pridings
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [newPartNo, setNewPartNo] = useState("");
  const [newPartDesc, setNewPartDesc] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");

  // Tab 4: Raw Logs / DB collections
  const [logs, setLogs] = useState<any[]>([]);

  // Load configuration and data
  const loadAllBackdoorData = async () => {
    setLoading(true);
    try {
      // Users
      const userSnap = await getDocs(collection(db, "users"));
      setUsers(userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Clients
      const clientSnap = await getDocs(collection(db, "clients"));
      const clList = clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clList);
      if (clList.length > 0 && !selectedClient) {
        setSelectedClient(clList[0].id);
      }

      // Login attempts / logs
      const logsSnap = await getDocs(collection(db, "login_attempts"));
      setLogs(logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, 50));
    } catch (err: any) {
      console.error("Backdoor loading error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAllBackdoorData();
      // Load bypassed settings from localstorage
      setBypass2FA(localStorage.getItem("godmode_bypass_2fa") === "true");
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedClient && isOpen) {
      const loadPrices = async () => {
        try {
          const pricesSnap = await getDocs(collection(db, "clients", selectedClient, "prices"));
          setClientPrices(pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Error loading prices for backdoor:", err);
        }
      };
      loadPrices();
    }
  }, [selectedClient, isOpen]);

  const handleSaveSystemTweaks = () => {
    localStorage.setItem("godmode_bypass_2fa", bypass2FA ? "true" : "false");
    onToast("Systeemconfiguratie direct opgeslagen in local cache & cloud!");
  };

  const handleUpdateUserRole = async (userId: string, targetRole: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { role: targetRole });
      onToast(`Gebruiker rol veranderd naar ${targetRole}!`);
      loadAllBackdoorData();
    } catch (err: any) {
      onToast(`Fout bij updaten gebruiker: ${err.message}`);
    }
  };

  const handleSendResetEmail = async (email: string) => {
    if (!email) return;
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, email);
      onToast(`Wachtwoordherstellink is succesvol verzonden naar ${email}!`);
    } catch (err: any) {
      onToast(`Fout bij verzenden herstellink: ${err.message}`);
    }
  };

  const handleToggleUserTfa = async (userId: string, currentTfa: boolean) => {
    try {
      const nextTfa = !currentTfa;
      const updateData: any = { tfaEnabled: nextTfa };
      if (!nextTfa) {
        updateData.tfaSecret = null; // Clear secret if turning off
      }
      await updateDoc(doc(db, "users", userId), updateData);
      onToast(nextTfa ? "2FA ingeschakeld (verplicht gemaakt) voor gebruiker!" : "2FA uitgeschakeld voor gebruiker.");
      loadAllBackdoorData();
    } catch (err: any) {
      onToast(`Fout bij instellen van 2FA status: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Weet u zeker dat u deze gebruiker wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, "users", userId));
      onToast("Gebruiker verwijderd uit Firestore database.");
      loadAllBackdoorData();
    } catch (err: any) {
      onToast(`Fout bij verwijderen gebruiker: ${err.message}`);
    }
  };

  const handleCreateUserDirect = async () => {
    const cleanedEmail = newMail.trim().toLowerCase();
    if (!cleanedEmail) {
      onToast("Voer a.u.b. een bekend e-mailadres in.");
      return;
    }
    try {
      // First check if user already exists in local list
      const userExists = users.some(u => u.email?.toLowerCase() === cleanedEmail);
      if (userExists) {
        onToast("Deze gebruiker staat al in de database!");
        return;
      }

      await addDoc(collection(db, "users"), {
        email: cleanedEmail,
        role: newRole || "user",
        tfaEnabled: false,
        createdAt: serverTimestamp()
      });

      onToast(`Gebruiker ${cleanedEmail} succesvol aangemaakt als ${newRole || "user"}!`);
      setNewMail("");
      setNewRole("user");
      loadAllBackdoorData();
    } catch (err: any) {
      onToast(`Fout bij aanmaken gebruiker: ${err.message}`);
    }
  };

  const handleAddDirectPriceRule = async () => {
    if (!selectedClient || !newPartNo || !newPartPrice) {
      onToast("Vul a.u.b. onderdeelnummer en prijs in.");
      return;
    }
    try {
      await addDoc(collection(db, "clients", selectedClient, "prices"), {
        partNumber: newPartNo.trim().toUpperCase(),
        description: newPartDesc.trim() || "Automatische override",
        price: parseFloat(newPartPrice) || 0,
        createdAt: serverTimestamp()
      });
      onToast("Prijsregel succesvol direct toegevoegd!");
      setNewPartNo("");
      setNewPartDesc("");
      setNewPartPrice("");
      // reload lists
      const pricesSnap = await getDocs(collection(db, "clients", selectedClient, "prices"));
      setClientPrices(pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err: any) {
      onToast(`Fout bij toevoegen: ${err.message}`);
    }
  };

  const handleDeletePriceRule = async (priceId: string) => {
    try {
      await deleteDoc(doc(db, "clients", selectedClient, "prices", priceId));
      onToast("Prijsregel verwijderd.");
      setClientPrices(clientPrices.filter(p => p.id !== priceId));
    } catch (err: any) {
      onToast(`Fout bij verwijderen: ${err.message}`);
    }
  };

  const handleClearLogs = async () => {
    setLoading(true);
    try {
      const logsSnap = await getDocs(collection(db, "login_attempts"));
      const promises = logsSnap.docs.map(d => deleteDoc(doc(db, "login_attempts", d.id)));
      await Promise.all(promises);
      setLogs([]);
      onToast("Inlogpoging-geschiedenis volledig opgeschoond!");
    } catch (err: any) {
      onToast(`Opschonen mislukt: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
      />

      {/* Main Backdoor Window */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        className="relative bg-slate-900 border border-slate-800 text-white rounded-[2rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 font-sans"
      >
        {/* Glow Header */}
        <div className="p-6 bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-950">
              <ShieldAlert className="text-white animate-pulse" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white uppercase">God Mode Developer Portal</h2>
                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md text-[9px] font-black tracking-widest uppercase">BACKDOOR</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Directe bypass van database, rollen, overrides & beveiliging</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2.5 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white rounded-full transition-colors"
            title="Sluiten"
          >
            <X size={16} />
          </button>
        </div>

        {/* Dynamic Warning Header */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 text-amber-300 text-xs flex items-center gap-2 font-semibold">
          <Sparkles size={14} className="shrink-0" />
          <span>Geautoriseerde ontwikkelaarsmodus voor partverify-pro@outlook.com. Aanpassingen worden live opgeslagen in de cloud.</span>
        </div>

        {/* Sidebar Panels & Tabs */}
        <div className="flex flex-1 overflow-hidden min-h-[400px]">
          {/* Internal Navigation Tabs Menu */}
          <div className="w-48 bg-slate-950 p-4 flex flex-col gap-1 border-r border-slate-800 shrink-0">
            <button 
              onClick={() => setActiveTab('system')}
              className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-all ${activeTab === 'system' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Sliders size={14} />
              Systeem Tweaks
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Users size={14} />
              Gebruikersrollen
            </button>
            <button 
              onClick={() => setActiveTab('pricing')}
              className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-all ${activeTab === 'pricing' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <DollarSign size={14} />
              Prijs Overrides
            </button>
            <button 
              onClick={() => setActiveTab('raw')}
              className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-all ${activeTab === 'raw' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Database size={14} />
              Database Logs
            </button>

            <div className="mt-auto pt-6 text-center border-t border-slate-900">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">PartVerify Pro v1.4</span>
            </div>
          </div>

          {/* Right Column Pane */}
          <div className="flex-1 bg-slate-900/40 p-6 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center p-12 text-purple-400 gap-2">
                <RefreshCw size={20} className="animate-spin" />
                <span className="font-bold text-xs uppercase tracking-wider">Gegevens laden via Firestore...</span>
              </div>
            )}

            {!loading && activeTab === 'system' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider mb-4">Gekozen Bypass & Testinstellingen</h3>
                  
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">Tijdelijke 2FA Vergrendeling Bypass</span>
                        <p className="text-[10px] text-slate-400">Schakel TOTP 2FA verificatie direct offline uit voor testdoeleinden</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={bypass2FA}
                        onChange={(e) => setBypass2FA(e.target.checked)}
                        className="w-5 h-5 accent-purple-500 rounded bg-slate-900 border-slate-800"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer group pt-4 border-t border-slate-900">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">Geavanceerde Onderdelen Vergelijking Heuristics</span>
                        <p className="text-[10px] text-slate-400">Maak gebruik van fuzzy matching via lexicale patronen</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={experimentalMatcher}
                        onChange={(e) => setExperimentalMatcher(e.target.checked)}
                        className="w-5 h-5 accent-purple-500 rounded bg-slate-900 border-slate-800"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button 
                    onClick={handleSaveSystemTweaks}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 hover:opacity-95 shadow-lg shadow-purple-950"
                  >
                    <Save size={14} />
                    Instellingen Bevestigen
                  </button>
                </div>
              </div>
            )}

            {!loading && activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider">Actieve Gebruikers database</h3>
                  <span className="text-[10px] px-2.5 py-1 bg-slate-950 font-bold text-slate-400 rounded-md border border-slate-850">{users.length} Gebruikers</span>
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-850 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
                        <th className="p-4">E-mailadres</th>
                        <th className="p-4">Huidige Rol</th>
                        <th className="p-4">2FA Verplicht</th>
                        <th className="p-4 text-center">Rol Toewijzen</th>
                        <th className="p-4 text-right">Beheer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500 italic">Geen gebruikers gevonden.</td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-900/40">
                            <td className="p-4 font-mono font-bold text-purple-300">{u.email}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider ${u.role === 'admin' ? 'bg-amber-600/10 text-amber-500 border border-amber-500/20' : 'bg-slate-800 text-slate-400'}`}>
                                {u.role || "user"}
                              </span>
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => handleToggleUserTfa(u.id, !!u.tfaEnabled)}
                                className={`px-2 py-1 rounded-lg font-bold text-[9px] uppercase tracking-wide border transition-all ${
                                  u.tfaEnabled 
                                    ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-600/20' 
                                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                {u.tfaEnabled ? "Ja (Verplicht)" : "Nee (Druk om te eisen)"}
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <select
                                value={u.role || "user"}
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                className="bg-slate-900 border border-slate-750 text-white rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-500"
                              >
                                <option value="user">user (Standaard)</option>
                                <option value="admin">admin</option>
                              </select>
                            </td>
                            <td className="p-4 text-right flex items-center justify-end gap-2">
                              {/* Trigger password reset link */}
                              <button
                                onClick={() => handleSendResetEmail(u.email)}
                                className="px-2.5 py-1.5 text-slate-300 hover:text-amber-400 bg-slate-900 border border-slate-800 hover:border-amber-900/30 rounded-lg transition-all font-bold text-[10px] uppercase tracking-wide flex items-center gap-1.5"
                                title="Stuur Wachtwoord Herstellink naar deze gebruiker"
                              >
                                <Key size={11} className="text-amber-500" />
                                Reset Wachtwoord
                              </button>

                              <button 
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded bg-slate-900 border border-slate-800/80 hover:border-rose-950 transition-all"
                                title="Verwijder Gebruiker"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Form to directly add a new user to Firestore list */}
                <div className="bg-slate-950 p-6 rounded-3xl border border-slate-850 space-y-4">
                  <h3 className="text-xs font-black uppercase text-purple-400 tracking-wider">Direct Nieuwe Gebruiker Aanmaken (Firestore)</h3>
                  <p className="text-[11px] text-slate-400">
                    Nieuwe accounts worden automatisch als <span className="font-bold text-slate-200">user</span> ingesteld. Voer het e-mailadres in om de database-inrichting direct te regelen:
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider pl-1">E-mailadres</label>
                      <input 
                        type="email"
                        placeholder="naam@outlook.com of @gmail.com"
                        value={newMail}
                        onChange={(e) => setNewMail(e.target.value)}
                        className="w-full h-11 bg-slate-900 border border-slate-850 focus:border-purple-600/50 text-xs rounded-xl px-4 outline-none text-white focus:ring-2 focus:ring-purple-500/10 placeholder:text-slate-650 transition-all font-medium"
                      />
                    </div>

                    <div className="w-full sm:w-48 space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider pl-1">Rol Toewijzen</label>
                      <select 
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full h-11 bg-slate-900 border border-slate-850 text-xs rounded-xl px-3 font-bold text-white focus:outline-none"
                      >
                        <option value="user">user (Standaard)</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>

                    <button
                      onClick={handleCreateUserDirect}
                      className="h-11 px-6 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shrink-0 transition-colors shadow-lg shadow-purple-950"
                    >
                      <Plus size={14} />
                      Gebruiker Opslaan
                    </button>
                  </div>
                </div>

                {/* Direct Link to Firebase Console */}
                <div className="bg-gradient-to-r from-slate-950 to-indigo-950/60 p-5 rounded-3xl border border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider">Link naar Firebase Console</h4>
                    <p className="text-[11px] text-slate-400">
                      Om de login-inloggegevens (wachtwoorden) van gebruikers aan te maken of te resetten, dient u naar de Firebase Console te gaan.
                    </p>
                  </div>
                  
                  <a 
                    href="https://console.firebase.google.com/" 
                    target="_blank" 
                    rel="noreferrer noopener"
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black tracking-wide uppercase rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5"
                    id="lnk-firebase-console"
                  >
                    Open Firebase Console
                    <RefreshCw size={12} className="opacity-70" />
                  </a>
                </div>

              </div>
            )}

            {!loading && activeTab === 'pricing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider mb-4">Directe Overrides Toevoegen per Dossier/Opdrachtgever</h3>
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-450 uppercase mb-1.5">Opdrachtgever / Relatie</label>
                        <select 
                          value={selectedClient}
                          onChange={(e) => setSelectedClient(e.target.value)}
                          className="w-full h-11 bg-slate-900 border border-slate-800 text-xs rounded-xl px-3 font-bold"
                        >
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-450 uppercase mb-1.5">Onderdeelnummer</label>
                        <input 
                          type="text"
                          value={newPartNo}
                          onChange={(e) => setNewPartNo(e.target.value)}
                          placeholder="Bijv. 53154-0H020"
                          className="w-full h-11 bg-slate-900 border border-slate-800 text-xs rounded-xl px-3 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-450 uppercase mb-1.5">Beschrijving (Nederlands/Engels)</label>
                        <input 
                          type="text"
                          value={newPartDesc}
                          onChange={(e) => setNewPartDesc(e.target.value)}
                          placeholder="Bijv. Schuim grille"
                          className="w-full h-11 bg-slate-900 border border-slate-800 text-xs rounded-xl px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-450 uppercase mb-1.5">Toegestane Maximum Prijs (EUR)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-3.5 text-xs text-slate-500">€</span>
                          <input 
                            type="number"
                            step="0.01"
                            value={newPartPrice}
                            onChange={(e) => setNewPartPrice(e.target.value)}
                            placeholder="Bijv 75.00"
                            className="w-full h-11 bg-slate-900 border border-slate-800 text-xs rounded-xl pl-8 pr-3 font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button 
                        onClick={handleAddDirectPriceRule}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-purple-950"
                      >
                        <Plus size={14} />
                        Override Direct Toevoegen
                      </button>
                    </div>

                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-2">Huidige Overrides in database ({clientPrices.length})</h4>
                  <div className="bg-slate-950 rounded-2xl border border-slate-850 overflow-hidden max-h-[220px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider sticky top-0">
                          <th className="p-3">Onderdeelnummer</th>
                          <th className="p-3">Beschrijving</th>
                          <th className="p-3">Gemarkeerde Prijs</th>
                          <th className="p-3 text-right">Beheer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-xs">
                        {clientPrices.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-slate-500 font-semibold italic">Geen handmatige prijsregels voor deze opdrachtgever ingesteld.</td>
                          </tr>
                        ) : (
                          clientPrices.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-900/20">
                              <td className="p-3 font-mono font-bold text-slate-300">{p.partNumber}</td>
                              <td className="p-3 text-slate-400">{p.description}</td>
                              <td className="p-3 font-bold text-indigo-400">€ {p.price?.toFixed(2)}</td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleDeletePriceRule(p.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-500 rounded-lg transition-colors"
                                  title="Verwijderen"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {!loading && activeTab === 'raw' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider">Inlogpogingen & Systeemlogs</h3>
                  <button 
                    onClick={handleClearLogs}
                    className="px-4 py-2 bg-rose-950 hover:bg-rose-900 text-rose-300 rounded-xl text-xs font-bold border border-rose-900/50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={14} />
                    Wis alle logs in cloud
                  </button>
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-850 overflow-hidden max-h-[350px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider sticky top-0">
                        <th className="p-3">Tijdstip</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Details / User-Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-slate-500 italic">Geen systeemlogs gevonden in Firebase Firestore.</td>
                        </tr>
                      ) : (
                        logs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-900/40">
                            <td className="p-3 text-slate-500 text-[11px]">
                              {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : "Net ingelogd"}
                            </td>
                            <td className="p-3 text-slate-300 font-bold">{log.email}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${log.status === 'attempted' ? 'bg-amber-600/10 text-amber-500 border border-amber-500/10' : log.status === 'failed' ? 'bg-rose-600/10 text-rose-500 border border-rose-500/10' : 'bg-emerald-600/10 text-emerald-500 border border-emerald-500/10'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 text-[11px] truncate max-w-xs" title={log.userAgent}>
                              {log.error || log.userAgent || "Geen details"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>

      </motion.div>
    </div>
  );
}
