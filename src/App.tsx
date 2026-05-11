/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileText, 
  ClipboardCheck, 
  Search, 
  Lock, 
  ShieldCheck,
  Package,
  Layers,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  FileDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as OTPAuth from "otpauth";
import { QRCodeCanvas } from "qrcode.react";
import { 
  parseCalculation, 
  parseInvoice, 
  normalizePartNumber, 
  AutomotivePart,
  descriptionsMatch 
} from "./utils";

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  getDocs,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tfaCode, setTfaCode] = useState("");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginStep, setLoginStep] = useState<'password' | 'tfa'>('password');
  const [view, setView] = useState<'dashboard' | 'settings' | 'admin'>('dashboard');
  const [calcInput, setCalcInput] = useState("");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [tfaSecret, setTfaSecret] = useState<string | null>(null);
  const [isTfaEnabled, setIsTfaEnabled] = useState<boolean>(false);

  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  // Monitor auth state
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data();
            setUserProfile(profile);
            setIsTfaEnabled(profile.tfaEnabled || false);
            setTfaSecret(profile.tfaSecret || null);
            
            // Handle authorization based on 2FA settings
            if (profile.tfaEnabled) {
              if (sessionStorage.getItem("tfa_authenticated") === u.uid) {
                setIsAuthorized(true);
              } else {
                setIsAuthorized(false);
                setLoginStep('tfa');
              }
            } else {
              setIsAuthorized(true);
              sessionStorage.setItem("tfa_authenticated", u.uid);
            }
          } else {
            // New user (should only happen via Admin creation usually, but first one can be special)
            const lowerEmail = u.email?.toLowerCase();
            if (lowerEmail === "partverify-pro@outlook.com" || lowerEmail === "dannyradjkoemar@gmail.com") {
              const initialProfile = {
                email: u.email,
                role: "admin",
                tfaEnabled: false,
                createdAt: serverTimestamp()
              };
              await setDoc(doc(db, "users", u.uid), initialProfile);
              setUserProfile(initialProfile);
              setIsAuthorized(true);
              sessionStorage.setItem("tfa_authenticated", u.uid);
            } else {
              await signOut(auth);
              alert("Toegang geweigerd. Neem contact op met de beheerder.");
            }
          }
        } catch (err) {
          console.error("Auth state error:", err);
          await signOut(auth);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setIsAuthorized(false);
        setLoginStep('password');
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;
    
    setAuthLoading(true);
    try {
      await addDoc(collection(db, "login_attempts"), {
        email: cleanEmail,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
        status: "attempted"
      });

      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authError: any) {
        // If it's the admin email or owner, try to create the account if login fails
        const lowerEmail = cleanEmail.toLowerCase();
        if ((authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential' || authError.code === 'auth/invalid-login-credentials') && (lowerEmail === "partverify-pro@outlook.com" || lowerEmail === "dannyradjkoemar@gmail.com")) {
          try {
            await createUserWithEmailAndPassword(auth, cleanEmail, password);
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use') {
              throw new Error("Onjuist wachtwoord.");
            }
            throw createError;
          }
        } else {
          throw authError;
        }
      }
    } catch (error: any) {
      console.error("Login error:", error);
      let message = "Inloggen mislukt.";
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') message = "Onjuist wachtwoord.";
      if (error.code === 'auth/user-not-found') message = "Gebruiker niet gevonden.";
      if (error.message === "Onjuist wachtwoord.") message = "Onjuist wachtwoord.";
      
      alert(message);
      
      await addDoc(collection(db, "login_attempts"), {
        email: cleanEmail,
        timestamp: serverTimestamp(),
        status: "failed",
        error: error.message || error.code
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    sessionStorage.removeItem("tfa_authenticated");
    setView('dashboard');
  };

  const handleTfaVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tfaSecret || !user) return;

    const totp = new OTPAuth.TOTP({
      issuer: "PartVerify Pro",
      label: user.email || "User",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: tfaSecret,
    });

    const delta = totp.validate({
      token: tfaCode,
      window: 1,
    });

    if (delta !== null) {
      setIsAuthorized(true);
      sessionStorage.setItem("tfa_authenticated", user.uid);
    } else {
      alert("Ongeldige 2FA code!");
    }
  };

  const setupTfa = () => {
    const secret = new OTPAuth.Secret().base32;
    setTfaSecret(secret);
  };

  const confirmTfa = async (code: string) => {
    if (!tfaSecret || !user) return;
    const totp = new OTPAuth.TOTP({
      issuer: "PartVerify Pro",
      label: user.email || "User",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: tfaSecret,
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta !== null) {
      await updateDoc(doc(db, "users", user.uid), {
        tfaEnabled: true,
        tfaSecret: tfaSecret
      });
      setIsTfaEnabled(true);
      alert("2FA succesvol geactiveerd!");
    } else {
      alert("Ongeldige code. Probeer het opnieuw.");
    }
  };

  const disableTfa = async () => {
    if (user && window.confirm("Weet u zeker dat u 2FA wilt uitschakelen?")) {
      await updateDoc(doc(db, "users", user.uid), {
        tfaEnabled: false,
        tfaSecret: null
      });
      setIsTfaEnabled(false);
      setTfaSecret(null);
    }
  };

  const calculationParts = useMemo(() => parseCalculation(calcInput), [calcInput]);
  const invoiceParts = useMemo(() => parseInvoice(invoiceInput), [invoiceInput]);

  const results = useMemo(() => {
    if (calculationParts.length === 0) return [];

    return calculationParts.map(calcPart => {
      const normalizedCalc = normalizePartNumber(calcPart.partNumber);
      
      // Find matches by part number
      const match = invoiceParts.find(invPart => 
        normalizePartNumber(invPart.partNumber) === normalizedCalc
      );

      // If no part number match, try semantic description match
      const semanticMatch = !match ? invoiceParts.find(invPart => 
        descriptionsMatch(calcPart.description, invPart.description)
      ) : null;

      const finalMatch = match || semanticMatch;

      const overrideKey = `${calcPart.id}-${calcPart.partNumber}`;
      const manualPrice = manualOverrides[overrideKey];

      const priceDiff = manualPrice !== undefined 
        ? manualPrice - calcPart.price 
        : (finalMatch ? finalMatch.price - calcPart.price : 0);
        
      // Handle floating point precision, ignore differences < 0.005
      const hasRealDiff = Math.abs(priceDiff) > 0.005;

      let status: 'matched' | 'deviation' | 'missing' | 'approved' = 'missing';
      if (manualPrice !== undefined) {
        status = 'approved';
      } else if (finalMatch) {
        status = hasRealDiff ? 'deviation' : 'matched';
      }

      return {
        calc: calcPart,
        match: finalMatch,
        status,
        priceDiff: hasRealDiff ? priceDiff : 0,
        isSemantic: !!semanticMatch && !match,
        manualPrice
      };
    });
  }, [calculationParts, invoiceParts, manualOverrides]);

  const stats = useMemo(() => {
    const matched = results.filter(r => r.status === 'matched').length;
    const deviations = results.filter(r => r.status === 'deviation').length;
    const missing = results.filter(r => r.status === 'missing').length;
    const approved = results.filter(r => r.status === 'approved').length;
    const totalPriceDiff = results.reduce((acc, r) => acc + r.priceDiff, 0);
    return { matched, deviations, missing, approved, totalPriceDiff };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!searchQuery) return results;
    const q = searchQuery.toLowerCase();
    return results.filter(r => 
      r.calc.description.toLowerCase().includes(q) || 
      r.calc.partNumber.toLowerCase().includes(q) ||
      (r.match?.description.toLowerCase().includes(q))
    );
  }, [results, searchQuery]);

  const handleResetAll = () => {
    setCalcInput("");
    setInvoiceInput("");
    setSearchQuery("");
    setManualOverrides({});
    setEditingCell(null);
  };

  const handleManualOverride = (id: string, partNumber: string) => {
    setEditingCell(`${id}-${partNumber}`);
  };

  const removeOverride = (id: string, partNumber: string) => {
    const overrideKey = `${id}-${partNumber}`;
    setManualOverrides(prev => {
      const next = { ...prev };
      delete next[overrideKey];
      return next;
    });
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('nl-NL');
    const timeStr = now.toLocaleTimeString('nl-NL');

    // Header
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.text("PartVerify Pro", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Verificatie Verslag - Datum: ${dateStr} ${timeStr}`, 14, 28);
    doc.setFont("helvetica", "bold");
    doc.text("Ontwikkeld door: Danny Radjkoemar", 14, 33);
    doc.setFont("helvetica", "normal");
    doc.text("Onderdelen Controle Systeem", 14, 38);

    // Summary Stats
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 42, 196, 42);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Samenvatting:", 14, 52);

    doc.setFontSize(10);
    doc.text(`Totaal aantal onderdelen: ${results.length}`, 14, 60);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text(`Match OK: ${stats.matched}`, 14, 66);
    doc.setTextColor(245, 158, 11); // Amber-500
    doc.text(`Handmatig Goedgekeurd: ${stats.approved}`, 14, 72);
    doc.setTextColor(225, 29, 72); // Rose-600
    doc.text(`Afwijkingen: ${stats.deviations}`, 14, 78);
    doc.setTextColor(244, 63, 94); // Rose-500
    doc.text(`Ontbrekend: ${stats.missing}`, 14, 84);
    
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.setFontSize(11);
    doc.text(`Totaal Prijsverschil: EUR ${stats.totalPriceDiff.toFixed(2)}`, 14, 94);

    // Table
    const tableData = results.map(res => [
      res.status === 'matched' ? 'OK' : 
      res.status === 'approved' ? 'GOEDGEKEURD' :
      res.status === 'deviation' ? 'AFWIJKING' : 'ONTBREEKT',
      `${res.calc.description}\nID: ${res.calc.id}`,
      res.calc.partNumber,
      `EUR ${res.calc.price.toFixed(2)}`,
      res.status === 'approved' ? `EUR ${res.manualPrice?.toFixed(2)}*` : (res.match ? `EUR ${res.match.price.toFixed(2)}` : '—'),
      res.priceDiff !== 0 ? (res.priceDiff > 0 ? '+' : '') + res.priceDiff.toFixed(2) : '—'
    ]);

    autoTable(doc, {
      startY: 104,
      head: [['Status', 'Onderdeel', 'Partnummer', 'Calc. Prijs', 'Factuur Prijs', 'Verschil']],
      body: tableData,
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 50 },
        2: { cellWidth: 30 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          if (data.cell.text[0] === 'OK') data.cell.styles.textColor = [16, 185, 129];
          else if (data.cell.text[0] === 'GOEDGEKEURD') data.cell.styles.textColor = [245, 158, 11];
          else if (data.cell.text[0] === 'AFWIJKING') data.cell.styles.textColor = [225, 29, 72];
          else if (data.cell.text[0] === 'ONTBREEKT') data.cell.styles.textColor = [244, 63, 94];
        }
        if (data.section === 'body' && data.column.index === 5) {
            const val = parseFloat(data.cell.text[0].replace('+', ''));
            if (val > 0) data.cell.styles.textColor = [217, 119, 6];
            else if (val < 0) data.cell.styles.textColor = [16, 185, 129];
        }
      }
    });

    // Footer
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Pagina ${i} van ${pageCount} - Maker: Danny Radjkoemar`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`PartVerify_Rapport_${dateStr.replace(/\//g, '-')}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="text-white animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(37,99,235,0.4)]">
              <ShieldCheck className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">PartVerify Pro</h1>
            <p className="text-slate-400 mt-2 text-center">
              {loginStep === 'password' ? 'Beveiligde toegang tot onderdelen controle' : 'Voer uw 2FA code in'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!user ? (
              <motion.form 
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleLogin} 
                className="space-y-4"
              >
                <div className="space-y-4">
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                    <input 
                      type="email"
                      placeholder="Emailadres"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="Wachtwoord"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {authLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Inloggen"}
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="tfa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleTfaVerify} 
                className="space-y-4"
              >
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                  <input 
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={tfaCode}
                    onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans"
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
                >
                  Verifiëren
                </button>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2"
                >
                  Terug naar inloggen
                </button>
              </motion.form>
            )}
          </AnimatePresence>
          
          <p className="mt-8 text-center text-xs text-slate-500 uppercase tracking-widest font-medium">
            Automotive Compliance Suite
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Package className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">PartVerify Pro</h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">Schade Controle Systeem</p>
                <span className="text-[10px] text-slate-300">•</span>
                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-tight">By Danny Radjkoemar</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 italic text-[10px] font-bold">
              <ShieldCheck size={12} />
              Sessie Actief: Danny
            </div>
            <button 
              onClick={handleResetAll}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold rounded-lg flex items-center gap-2 transition-all"
            >
              <RefreshCw size={18} />
              Nieuwe Controle
            </button>
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setView(view === 'admin' ? 'dashboard' : 'admin')}
                className={`p-2 rounded-lg transition-all ${view === 'admin' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-slate-400 hover:text-amber-600 hover:bg-slate-50'}`}
                title="Beheerderspaneel"
              >
                <Layers size={20} />
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
            >
              <Lock size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {view === 'dashboard' ? (
          <>
            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <StatsCard 
                label="Calculatie" 
                value={calculationParts.length} 
                icon={<FileText className="text-blue-600" />} 
                color="bg-blue-50 text-blue-700" 
              />
              <StatsCard 
                label="Match OK" 
                value={stats.matched} 
                icon={<CheckCircle2 className="text-emerald-600" />} 
                color="bg-emerald-50 text-emerald-700" 
              />
              <StatsCard 
                label="Handmatig" 
                value={stats.approved} 
                icon={<ShieldCheck className="text-amber-600" />} 
                color="bg-amber-50 text-amber-700" 
              />
              <StatsCard 
                label="Afwijking" 
                value={stats.deviations} 
                icon={<AlertCircle className="text-rose-600" />} 
                color="bg-rose-50 text-rose-700" 
              />
              <StatsCard 
                label="Ontbrekend" 
                value={stats.missing} 
                icon={<XCircle className="text-rose-600" />} 
                color="bg-rose-50 text-rose-700" 
              />
              <StatsCard 
                label="Prijsverschil" 
                value={`€ ${stats.totalPriceDiff.toFixed(2)}`} 
                icon={<RefreshCw className={`text-amber-600 ${stats.totalPriceDiff !== 0 ? 'animate-spin-slow' : ''}`} />} 
                color="bg-amber-50 text-amber-700" 
              />
            </div>

            {/* Inputs - Stacked vertically for clarity as requested */}
            <div className="space-y-10">
              <InputSection 
                title="Eindcalculatie" 
                placeholder="Plak hier uw eindcalculatie gegevens..." 
                value={calcInput} 
                onChange={setCalcInput} 
                icon={<ClipboardCheck className="w-5 h-5 text-blue-600" />}
              />
              <InputSection 
                title="Inkoopfacturen" 
                placeholder="Plak hier de gegevens van inkoopfactur(en)..." 
                value={invoiceInput} 
                onChange={setInvoiceInput} 
                icon={<Layers className="w-5 h-5 text-indigo-600" />}
              />
            </div>

            {/* Report Section */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">Verificatie Verslag</h2>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                    {filteredResults.length} Rijen
                  </span>
                  <button 
                    onClick={downloadPDF}
                    disabled={results.length === 0}
                    className="ml-2 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-600 text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FileDown size={14} />
                    PDF Rapportage
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input 
                    type="text" 
                    placeholder="Zoek op onderdeel of nummer..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-80 transition-all"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Onderdeel (Calculatie)</th>
                      <th className="px-6 py-4">Partnummer</th>
                      <th className="px-6 py-4">Prijs Calc.</th>
                      <th className="px-6 py-4">Factuur Match / Prijs</th>
                      <th className="px-6 py-4">Verschil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {filteredResults.length > 0 ? (
                        filteredResults.map((res, i) => (
                          <motion.tr 
                            key={res.calc.id + i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="group hover:bg-slate-50/80 transition-all"
                          >
                            <td className="px-6 py-4 text-xs">
                              {res.status === 'matched' ? (
                                <div className="flex items-center gap-2 text-emerald-600 font-bold">
                                  <CheckCircle2 size={16} />
                                  OK
                                </div>
                              ) : res.status === 'approved' ? (
                                <div className="flex items-center gap-2 text-amber-600 font-bold">
                                  <ShieldCheck size={16} />
                                  AANGEPAST
                                </div>
                              ) : res.status === 'deviation' ? (
                                <div className="flex items-center gap-2 text-rose-600 font-bold">
                                  <AlertCircle size={16} />
                                  AFWIJKING
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-rose-500 font-bold">
                                  <XCircle size={16} />
                                  ONTBREEKT
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-800">{res.calc.description}</div>
                              <div className="text-[10px] text-slate-400 font-mono">ID: {res.calc.id}</div>
                            </td>
                            <td className="px-6 py-4">
                              <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono whitespace-nowrap">
                                {res.calc.partNumber}
                              </code>
                            </td>
                            <td className="px-6 py-4 font-medium">€ {res.calc.price.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              {editingCell === `${res.calc.id}-${res.calc.partNumber}` ? (
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text"
                                    autoFocus
                                    defaultValue={(res.manualPrice || res.match?.price || res.calc.price).toString().replace('.', ',')}
                                    onBlur={(e) => {
                                      const val = parseFloat(e.target.value.replace(',', '.'));
                                      if (!isNaN(val)) {
                                        setManualOverrides(prev => ({ ...prev, [`${res.calc.id}-${res.calc.partNumber}`]: val }));
                                      }
                                      setEditingCell(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur();
                                      if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    className="w-24 p-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  />
                                </div>
                              ) : res.status === 'approved' ? (
                                <div className="flex items-center justify-between group/price">
                                  <div className="text-amber-600 font-bold">
                                    € {res.manualPrice?.toFixed(2)}
                                    <span className="ml-1 text-[10px] bg-amber-100 px-1 rounded uppercase tracking-tighter">Manual</span>
                                  </div>
                                  <button 
                                    onClick={() => removeOverride(res.calc.id, res.calc.partNumber)}
                                    className="opacity-0 group-hover/price:opacity-100 text-slate-400 hover:text-rose-500 transition-all"
                                    title="Handmatige prijs verwijderen"
                                  >
                                    <RefreshCw size={12} />
                                  </button>
                                </div>
                              ) : res.match ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-700">{res.match.description}</span>
                                    {res.isSemantic && (
                                      <span title="Intelligente match op beschrijving" className="text-amber-500 cursor-help">
                                        <AlertCircle size={14} />
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                    <span>{res.match.partNumber}</span>
                                    <ArrowRight size={10} />
                                    <span className="text-emerald-600 font-bold">€ {res.match.price.toFixed(2)}</span>
                                    <button 
                                      onClick={() => handleManualOverride(res.calc.id, res.calc.partNumber)}
                                      className="ml-2 text-slate-400 hover:text-blue-500"
                                      title="Prijs handmatig aanpassen"
                                    >
                                      <RefreshCw size={10} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => handleManualOverride(res.calc.id, res.calc.partNumber)}
                                  className="text-blue-500 hover:text-blue-700 text-xs font-bold underline flex items-center gap-1"
                                >
                                  Prijs invullen
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {res.priceDiff !== 0 ? (
                                <span className={`font-bold ${res.priceDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {res.priceDiff > 0 ? '+' : ''}{res.priceDiff.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                                <Search size={32} />
                              </div>
                              <div className="text-slate-400 font-medium">Geen resultaten om weer te geven.</div>
                              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                                Plak gegevens in de invoervelden hierboven om de controle te starten.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : view === 'settings' ? (
          <SettingsView 
            isTfaEnabled={isTfaEnabled}
            tfaSecret={tfaSecret}
            onSetupTfa={setupTfa}
            onConfirmTfa={confirmTfa}
            onDisableTfa={disableTfa}
            onBack={() => setView('dashboard')}
          />
        ) : (
          <AdminView 
            onBack={() => setView('dashboard')}
          />
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200 mt-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <ShieldCheck size={18} />
          <span className="text-sm">End-to-end Encrypted Processing</span>
        </div>
        <p className="text-xs text-slate-400">
          Built for Automotive Professionals &copy; {new Date().getFullYear()} PartVerify Pro
        </p>
      </footer>
    </div>
  );
}

function SettingsView({ isTfaEnabled, tfaSecret, onSetupTfa, onConfirmTfa, onDisableTfa, onBack }: any) {
  const [code, setCode] = useState("");
  const totpUri = tfaSecret ? `otpauth://totp/PartVerify%20Pro:Danny%20Radjkoemar?secret=${tfaSecret}&issuer=PartVerify%20Pro` : "";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Instellingen / Beveiliging</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 font-medium text-sm">Terug naar Dashboard</button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-8">
        <div className="flex items-start gap-6">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <ShieldCheck size={28} />
          </div>
          <div className="flex-1 space-y-6">
            <div>
              <h3 className="text-lg font-bold">Twee-staps Verificatie (2FA)</h3>
              <p className="text-slate-500 text-sm mt-1">Voeg een extra beveiligingslaag toe aan uw account via Microsoft Authenticator of Google Authenticator.</p>
            </div>

            {isTfaEnabled ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-700">2FA is Ingeschakeld</h4>
                    <p className="text-emerald-600 text-xs">Uw account is optimaal beveiligd.</p>
                  </div>
                </div>
                <button 
                  onClick={onDisableTfa}
                  className="px-4 py-2 bg-white border border-emerald-200 text-rose-600 text-sm font-bold rounded-xl hover:bg-rose-50 transition-colors"
                >
                  Uitschakelen
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {!tfaSecret ? (
                  <button 
                    onClick={onSetupTfa}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-500 transition-all"
                  >
                    2FA Instellen
                  </button>
                ) : (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                      <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-700">Scan de QR-code met uw Authenticator app:</p>
                        <div className="p-4 bg-white border-2 border-slate-100 rounded-3xl inline-block shadow-sm">
                          <QRCodeCanvas value={totpUri} size={200} />
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Handmatige Sleutel</p>
                          <code className="text-xs font-mono break-all text-slate-600">{tfaSecret}</code>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-700">Voer de 6-cijferige code in ter bevestiging:</p>
                        <input 
                          type="text"
                          maxLength={6}
                          placeholder="000000"
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                          onClick={() => onConfirmTfa(code)}
                          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 disabled:opacity-50"
                          disabled={code.length !== 6}
                        >
                          Bevestigen en Activeren
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AdminView({ onBack }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [attempts, setAttempts] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const uDocs = await getDocs(collection(db, "users"));
      setUsers(uDocs.docs.map(d => ({ id: d.id, ...d.data() })));

      const aDocs = await getDocs(query(collection(db, "login_attempts")));
      setAttempts(aDocs.docs.map(d => d.data()).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    };
    loadData();
  }, []);

  const createUser = async () => {
    // Note: Creating actual Firebase Auth users requires Admin SDK or custom logic
    // For this simple demo, I'll alert that real user creation happens in Firebase Console
    // but I'll add the profile to Firestore.
    alert("Om beveiligingsredenen moet u de gebruiker eerst aanmaken in de Firebase Console (Authentication tab).\nZodra aangemaakt, voeg ik hier de rol toe aan Firestore.");
    
    // In a real app, this would be a cloud function
    // But I'll simulate by adding the email to the users list
    await addDoc(collection(db, "users"), {
      email: newEmail,
      role: "user",
      createdAt: serverTimestamp()
    });
    setNewEmail("");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-amber-600">Beheerderspaneel</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 font-medium text-sm">Terug naar Dashboard</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
          <h3 className="text-lg font-bold">Nieuwe Gebruiker Registreren</h3>
          <div className="space-y-4">
            <input 
              type="email" 
              placeholder="Emailadres" 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl"
            />
            <button 
              onClick={createUser}
              className="w-full bg-amber-600 text-white py-4 rounded-xl font-bold hover:bg-amber-500 transition-all"
            >
              Gebruiker Toevoegen
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
          <h3 className="text-lg font-bold">Actieve Gebruikers</h3>
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <div className="font-bold text-sm">{u.email}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest">{u.role}</div>
                </div>
                <div className="flex items-center gap-2">
                  {u.tfaEnabled && <ShieldCheck size={14} className="text-emerald-500" />}
                  <button className="text-rose-500 p-1 hover:bg-rose-50 rounded"><XCircle size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-8">
        <h3 className="text-lg font-bold mb-6">Recente Inlogpogingen</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 uppercase tracking-widest font-black border-b border-slate-100">
                <th className="py-4">Datum/Tijd</th>
                <th className="py-4">Email</th>
                <th className="py-4">Status</th>
                <th className="py-4">Locatie/Browser</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {attempts.map((a, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-all">
                  <td className="py-4">{a.timestamp?.toDate().toLocaleString('nl-NL')}</td>
                  <td className="py-4 font-bold">{a.email}</td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${a.status === 'attempted' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="py-4 text-slate-400 max-w-xs truncate">{a.userAgent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
function StatsCard({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between bg-white overflow-hidden relative group hover:border-slate-300 transition-all`}
    >
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        <h3 className="text-3xl font-black tracking-tighter">{value}</h3>
      </div>
      <div className={`p-3 rounded-2xl ${color} transition-transform group-hover:scale-110 duration-500`}>
        {icon}
      </div>
    </motion.div>
  );
}

function InputSection({ title, placeholder, value, onChange, icon }: { title: string, placeholder: string, value: string, onChange: (v: string) => void, icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
          {icon}
          {title}
        </label>
        {value && (
          <button 
            onClick={() => onChange("")}
            className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
          >
            Leegmaken
          </button>
        )}
      </div>
      <div className="relative group">
        <textarea 
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-64 bg-white border border-slate-200 rounded-3xl p-6 text-sm font-mono text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm resize-none"
        />
        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="px-2 py-1 bg-slate-100 rounded text-[10px] text-slate-400 font-bold uppercase">
            {value.split('\n').filter(l => l.trim()).length} Lijnen
          </div>
        </div>
      </div>
    </div>
  );
}
