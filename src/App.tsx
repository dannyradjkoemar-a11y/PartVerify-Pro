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
  FileDown,
  LogOut,
  Trash2,
  Plus,
  CarFront,
  CheckSquare,
  X,
  Calendar,
  DollarSign,
  Activity,
  Info,
  Save,
  History,
  Gauge,
  Fingerprint,
  Settings,
  HelpCircle,
  QrCode,
  Strikethrough
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
import { BackdoorPanel } from "./components/BackdoorPanel";
import { ManualModal } from "./components/ManualModal";

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
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
  where,
  getDocs,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tfaCode, setTfaCode] = useState("");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordStatus, setForgotPasswordStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginStep, setLoginStep] = useState<'password' | 'tfa' | 'tfa-setup'>('password');
  const [view, setView] = useState<'dashboard' | 'settings' | 'admin'>('dashboard');
  const [calcInput, setCalcInput] = useState("");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [struckThroughIds, setStruckThroughIds] = useState<Set<string>>(new Set());
  const [redPriceStruckThroughIds, setRedPriceStruckThroughIds] = useState<Set<string>>(new Set());

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientPrices, setClientPrices] = useState<Record<string, number[]>>({});

  const [tfaSecret, setTfaSecret] = useState<string | null>(null);
  const [isTfaEnabled, setIsTfaEnabled] = useState<boolean>(false);
  const [showAuthQrCode, setShowAuthQrCode] = useState<boolean>(false);

  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [caseNumber, setCaseNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [kmStand, setKmStand] = useState<string>("");
  const [chassisNumber, setChassisNumber] = useState<string>("");
  const [vehicleData, setVehicleData] = useState<any>(null);
  const [vehicleLoading, setVehicleLoading] = useState<boolean>(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [showRdwModal, setShowRdwModal] = useState<boolean>(false);
  const [removedPartIds, setRemovedPartIds] = useState<Set<string>>(new Set());
  const [manualParts, setManualParts] = useState<AutomotivePart[]>([]);
  const [showRemoved, setShowRemoved] = useState(true);

  // OPTION 2: Dossier Geschiedenis & Toasts
  const [savedDossiers, setSavedDossiers] = useState<any[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lastExtractedText, setLastExtractedText] = useState("");
  const [isBackdoorOpen, setIsBackdoorOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);

  // Set session persistence so closing tab / browser logs out user
  useEffect(() => {
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error("Error setting session persistence:", err);
    });
  }, []);

  // Load dossiers from localStorage on mount
  useEffect(() => {
    const loaded = localStorage.getItem("partverify_dossiers");
    if (loaded) {
      try {
        setSavedDossiers(JSON.parse(loaded));
      } catch (e) {
        console.error("Error reading saved dossiers:", e);
      }
    }
  }, []);

  // Smart Automatic Metadata Extractor and Input Purger for Audatex Calculations
  useEffect(() => {
    if (!calcInput) return;
    
    // Check if the pasted text is a full Audatex calculation report
    const textToParse = calcInput.trim();
    if (textToParse.length < 200) return;
    
    const normalized = textToParse.replace(/\s+/g, '').toUpperCase();
    const isFullReport = normalized.includes("ONDERDELEN") && (normalized.includes("AUDATEX") || normalized.includes("SCHADENUMMER") || normalized.includes("REPARATIEKOSTEN"));
    
    if (!isFullReport) return;

    let extractedPlate = "";
    let extractedVin = "";
    let extractedKm = "";

    // 1. Parse LICENSE PLATE (Kenteken)
    const platePatterns = [
      /k\s*e\s*n\s*t\s*e\s*k\s*e\s*n\s*[\s*:\-=]+\s*([A-Z0-9-]{6,12})/i, // KENTEKEN: HTS-99-K
      /k\s*e\s*n\s*t\s*\.\s*([A-Z0-9-]{6,12})/i, // KENT.   HTS-99-K
      /license\s*plate\s*[\s*:\-=]+\s*([A-Z0-9-]{6,12})/i,
      /kenteken\s+([A-Z0-9-]{6,12})/i,
    ];
    for (const pattern of platePatterns) {
      const match = textToParse.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
        if (candidate.length >= 6 && candidate.length <= 12) {
          extractedPlate = candidate;
          break;
        }
      }
    }

    // 2. Parse CHASSISNUMMER (VIN)
    const vinPatterns = [
      /(?:chassisnr|chassisnummer|identificatienummer|vin|fgstnr|fahrgestellnummer|chassis\s*no|fzg-ident-nr|vtg\.-id\.-nr\.)[\s*:\-=]+([A-HJ-NPR-Z0-9]{17})\b/i,
      /\b([A-HJ-NPR-Z0-9]{17})\b/i
    ];
    for (const pattern of vinPatterns) {
      const match = textToParse.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].toUpperCase();
        const hasDigits = /[0-9]/.test(candidate);
        const hasLetters = /[A-Z]/.test(candidate);
        const isRepetitive = /^(.)\1+$/.test(candidate);
        if (hasDigits && hasLetters && !isRepetitive) {
          extractedVin = candidate;
          break;
        }
      }
    }

    // 3. Parse KILOMETERSTAND (KM-stand)
    const kmPatterns = [
      /kilometerstand\s*:\s*([\d\s\.]+)\s*(?:km|KM)?/i,
      /kilometerstand\s+([\d\s\.]+)\s*(?:km|KM)?/i,
      /km-stand\s*:\s*([\d\s\.]+)/i,
      /km\s*stand\s*:\s*([\d\s\.]+)/i,
      /\b(\d{3,6})\s*[kK][mM]\b/i
    ];
    for (const pattern of kmPatterns) {
      const match = textToParse.match(pattern);
      if (match && match[1]) {
        const digits = match[1].replace(/\D/g, '');
        if (digits && digits.length >= 2 && digits.length <= 7) {
          extractedKm = digits;
          break;
        }
      }
    }

    // 4. Extract only the actual Parts lines
    const lines = textToParse.split('\n');
    const cleanPartsLines: string[] = [];
    let inPartsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const normLine = line.replace(/\s+/g, '').toUpperCase();
      
      // Look for the start of the O N D E R D E L E N block
      if (normLine.includes("ONDERDELEN") && !normLine.includes("TOTAALBEDRAG") && !normLine.includes("SAMENVATTING")) {
        inPartsSection = true;
        continue;
      }

      // Look for the end of the O N D E R D E L E N block
      if (inPartsSection && (normLine.includes("ARBEIDSLOON") || normLine.includes("EINDCALCULATIE"))) {
        inPartsSection = false;
        continue;
      }

      if (inPartsSection) {
        const trimmed = line.trim();
        // Keep lines inside O N D E R D E L E N that start with a 4-digit code (standard Audatex format)
        const isPartLine = /^\d{4}\s+/.test(trimmed) && /[\d\.,\s+\*]+$/.test(trimmed);
        if (isPartLine && !trimmed.includes("CODE-NR") && !trimmed.includes("BENAMING")) {
          cleanPartsLines.push(trimmed);
        }
      }
    }

    const updates: string[] = [];
    if (extractedPlate && extractedPlate !== licensePlate) {
      setLicensePlate(extractedPlate);
      updates.push(`Kenteken: ${extractedPlate}`);
    }
    if (extractedVin && extractedVin !== chassisNumber) {
      setChassisNumber(extractedVin);
      updates.push(`Chassisnummer: ${extractedVin}`);
    }
    if (extractedKm && extractedKm !== kmStand) {
      setKmStand(extractedKm);
      updates.push(`KM-stand: ${parseInt(extractedKm, 10).toLocaleString("nl-NL")} km`);
    }

    const cleanPartsText = cleanPartsLines.join('\n');
    
    // Check if we successfully isolated part lines
    if (cleanPartsText && cleanPartsText !== calcInput) {
      setCalcInput(cleanPartsText);
      updates.push(`Onderdelen opgeschoond (${cleanPartsLines.length} stuks)`);
    }

    if (updates.length > 0) {
      setToastMsg(`Calculatiedata ingeladen:\n${updates.join(", ")}`);
      const timer = setTimeout(() => setToastMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [calcInput, licensePlate, chassisNumber, kmStand]);

  const saveCurrentDossier = () => {
    if (!licensePlate && !caseNumber) {
      alert("Voer minimaal een kenteken of dossiernummer in om het dossier op te slaan.");
      return;
    }
    const clientName = clients.find(c => c.id === selectedClientId)?.name || "Standaard";
    const newDossier = {
      id: `DOS-${Date.now()}`,
      caseNumber: caseNumber || "Onbekend",
      licensePlate: licensePlate || "Onbekend",
      kmStand: kmStand || "",
      chassisNumber: chassisNumber || "",
      vehicleData,
      calcInput,
      invoiceInput,
      selectedClientId,
      clientName,
      manualOverrides,
      manualParts,
      removedPartIds: Array.from(removedPartIds),
      struckThroughIds: Array.from(struckThroughIds),
      redPriceStruckThroughIds: Array.from(redPriceStruckThroughIds),
      stats,
      savedAt: new Date().toISOString()
    };

    const updated = [newDossier, ...savedDossiers.filter(d => 
      !(d.caseNumber === caseNumber && d.licensePlate === licensePlate)
    )].slice(0, 10);

    localStorage.setItem("partverify_dossiers", JSON.stringify(updated));
    setSavedDossiers(updated);
    setToastMsg("Dossier succesvol opgeslagen!");
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadDossier = (dossier: any) => {
    setCaseNumber(dossier.caseNumber === "Onbekend" ? "" : dossier.caseNumber);
    setLicensePlate(dossier.licensePlate === "Onbekend" ? "" : dossier.licensePlate);
    setKmStand(dossier.kmStand || "");
    setChassisNumber(dossier.chassisNumber || "");
    if (dossier.vehicleData) {
      setVehicleData(dossier.vehicleData);
    } else {
      setVehicleData(null);
    }
    setCalcInput(dossier.calcInput || "");
    setInvoiceInput(dossier.invoiceInput || "");
    setSelectedClientId(dossier.selectedClientId || "");
    setManualOverrides(dossier.manualOverrides || {});
    setManualParts(dossier.manualParts || []);
    setRemovedPartIds(new Set(dossier.removedPartIds || []));
    setStruckThroughIds(new Set(dossier.struckThroughIds || []));
    setRedPriceStruckThroughIds(new Set(dossier.redPriceStruckThroughIds || []));

    setToastMsg(`Dossier "${dossier.caseNumber !== "Onbekend" ? dossier.caseNumber : dossier.licensePlate}" geladen!`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const deleteDossier = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedDossiers.filter(d => d.id !== id);
    localStorage.setItem("partverify_dossiers", JSON.stringify(updated));
    setSavedDossiers(updated);
    setToastMsg("Dossier verwijderd uit historie.");
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleFirestoreError = (error: any, operation: string, path: string) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      code: error.code,
      operation,
      path,
      auth: {
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified
      }
    };
    console.error(`[Firestore Error] ${operation} on ${path}:`, JSON.stringify(errInfo));
    return errInfo;
  };

  // Monitor auth state
  useEffect(() => {
    document.title = "PartVerify Pro - De site voor Professionals";
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          let userDoc = await getDoc(doc(db, "users", u.uid));
          let profile = null;

          if (userDoc.exists()) {
            profile = userDoc.data();
          } else {
            // Check via a secure filtered query if any user document has u.email
            const lowerEmail = u.email?.toLowerCase();
            if (lowerEmail) {
              const q = query(collection(db, "users"), where("email", "==", lowerEmail));
              const userSnap = await getDocs(q);
              const foundDoc = userSnap.docs[0];
              if (foundDoc) {
                const matchedData = foundDoc.data();
                profile = {
                  email: u.email,
                  role: matchedData.role || "user",
                  tfaEnabled: matchedData.tfaEnabled || false,
                  tfaSecret: matchedData.tfaSecret || null,
                  createdAt: matchedData.createdAt || serverTimestamp()
                };
                // Save to u.uid so future gets and security rules work perfectly!
                await setDoc(doc(db, "users", u.uid), profile);
                // Safely delete old random-id doc if it's different and not u.uid
                if (foundDoc.id !== u.uid) {
                  try {
                    await deleteDoc(doc(db, "users", foundDoc.id));
                  } catch (delErr) {
                    console.error("Old user doc deletion failed", delErr);
                  }
                }
              }
            }
          }

          if (profile) {
            const lowerEmail = u.email?.toLowerCase();
            const isAdminEmail = lowerEmail === "partverify-pro@outlook.com" || lowerEmail === "dannyradjkoemar@gmail.com";
            
            // Force 2FA for admins/owner (bypassable via god mode settings if set)
            const isBypassed = localStorage.getItem("godmode_bypass_2fa") === "true";
            const effectiveTfaEnabled = isBypassed ? false : (isAdminEmail ? true : (profile.tfaEnabled || false));
            
            setUserProfile(profile);
            setIsTfaEnabled(effectiveTfaEnabled);
            setTfaSecret(profile.tfaSecret || null);
            
            // Handle authorization based on 2FA settings
            if (effectiveTfaEnabled) {
              if (!profile.tfaSecret) {
                // Forced TFA but no secret set yet - block and force setup
                setIsAuthorized(false);
                setLoginStep('tfa-setup');
                const secret = new OTPAuth.Secret().base32;
                setTfaSecret(secret);
              } else {
                setIsAuthorized(false);
                setLoginStep('tfa');
              }
            } else {
              setIsAuthorized(true);
            }
          } else {
            // New user (should only happen via Admin creation usually, but first one can be special)
            const lowerEmail = u.email?.toLowerCase();
            if (lowerEmail === "partverify-pro@outlook.com" || lowerEmail === "dannyradjkoemar@gmail.com") {
              const isBypassed = localStorage.getItem("godmode_bypass_2fa") === "true";
              const initialProfile = {
                email: u.email,
                role: "admin",
                tfaEnabled: isBypassed ? false : true, // Default to true for admins
                createdAt: serverTimestamp()
              };
              try {
                await setDoc(doc(db, "users", u.uid), initialProfile);
                setUserProfile(initialProfile);
                if (isBypassed) {
                  setIsAuthorized(true);
                } else {
                  setIsAuthorized(false);
                  setLoginStep('tfa-setup');
                  const secret = new OTPAuth.Secret().base32;
                  setTfaSecret(secret);
                }
              } catch (setErr) {
                handleFirestoreError(setErr, 'write', `users/${u.uid}`);
                await signOut(auth);
              }
            } else {
              // Automatically initialize as user since "iedereen die wordt toegevoegd automatisch user is"
              const initialProfile = {
                email: u.email,
                role: "user",
                tfaEnabled: false,
                tfaSecret: null,
                createdAt: serverTimestamp()
              };
              try {
                await setDoc(doc(db, "users", u.uid), initialProfile);
                setUserProfile(initialProfile);
                setIsTfaEnabled(false);
                setTfaSecret(null);
                setIsAuthorized(true);
              } catch (setErr) {
                handleFirestoreError(setErr, 'write', `users/${u.uid}`);
                await signOut(auth);
                alert("Er is een fout opgetreden bij het registreren van uw profiel.");
              }
            }
          }
        } catch (err) {
          handleFirestoreError(err, 'get', `users/${u.uid}`);
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

  // Fetch clients
  useEffect(() => {
    if (isAuthorized) {
      const loadClients = async () => {
        try {
          const q = query(collection(db, "clients"));
          const snapshot = await getDocs(q);
          setClients(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
          handleFirestoreError(err, 'get', 'clients');
        }
      };
      loadClients();
    }
  }, [isAuthorized]);

  // Fetch RDW Vehicle Data for license plates
  useEffect(() => {
    const cleanPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanPlate.length < 6) {
      setVehicleData(null);
      setVehicleError(null);
      return;
    }

    const handler = setTimeout(async () => {
      setVehicleLoading(true);
      setVehicleError(null);
      try {
        const res = await fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${cleanPlate}`);
        if (!res.ok) {
          throw new Error('RDW serverfout');
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setVehicleData(data[0]);
        } else {
          setVehicleData(null);
          setVehicleError("Voertuig niet gevonden");
        }
      } catch (err) {
        console.error("RDW ophaalfout:", err);
        setVehicleError("Fout bij ophalen RDW-data");
      } finally {
        setVehicleLoading(false);
      }
    }, 650);

    return () => clearTimeout(handler);
  }, [licensePlate]);

  // Formatting helpers for RDW data
  const formatDateRDW = (dateStr?: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr || "Onbekend";
    const yyyy = dateStr.substring(0, 4);
    const mm = dateStr.substring(4, 6);
    const dd = dateStr.substring(6, 8);
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatCurrency = (valStr?: string) => {
    if (!valStr) return "Onbekend";
    const num = parseFloat(valStr);
    if (isNaN(num)) return valStr;
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(num);
  };

  const capitalizeWords = (str?: string) => {
    if (!str) return "Onbekend";
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const calculateEstimatedDagwaarde = (catalogusprijs?: string, datumToelating?: string, customKm?: string) => {
    if (!catalogusprijs) return null;
    const originalPrice = parseFloat(catalogusprijs);
    if (isNaN(originalPrice) || originalPrice <= 0) return null;

    let years = 0;
    if (datumToelating && datumToelating.length === 8) {
      const year = parseInt(datumToelating.substring(0, 4));
      const month = parseInt(datumToelating.substring(4, 6)) - 1;
      const day = parseInt(datumToelating.substring(6, 8));
      const admissionDate = new Date(year, month, day);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - admissionDate.getTime());
      years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    }

    if (years <= 0) return originalPrice;

    // Advanced car depreciation curve (Nederlandse Richtlijnen)
    // Year 1: approx -22%
    // Year 2-3: approx -14% annually
    // Year 4-6: approx -11% annually
    // Year 7+: approx -8% annually
    let factor = 1.0;
    for (let i = 0; i < Math.floor(years); i++) {
       if (i === 0) {
        factor *= 0.78; // 1st year 22% depreciation
      } else if (i < 3) {
        factor *= 0.86; // Years 2-3: 14% annual depreciation
      } else if (i < 6) {
        factor *= 0.89; // Years 4-6: 11% annual depreciation
      } else {
        factor *= 0.92; // Years 7+: 8% annual depreciation
      }
    }
    // Handle remaining fractional year
    const remainingFraction = years - Math.floor(years);
    const dropRate = Math.floor(years) === 0 ? 0.22 : Math.floor(years) < 3 ? 0.14 : Math.floor(years) < 6 ? 0.11 : 0.08;
    factor *= (1 - (dropRate * remainingFraction));

    let finalValue = originalPrice * factor;

    // Incorporate Mileage (Kilometerstand)
    if (customKm) {
      const km = parseInt(customKm.replace(/\D/g, ''));
      if (!isNaN(km) && km > 0) {
        // Average standard mileage in the Netherlands is ~15,000 km per year.
        const ageInYears = Math.max(years, 0.5); // At least half a year to prevent division by extreme/zero values
        const expectedKm = ageInYears * 15000;
        const kmDifference = km - expectedKm;

        // Apply a highly realistic correction factor:
        // - For every 10,000 km excess mileage, the car loses about 4% of its remaining value.
        // - For every 10,000 km lower mileage, the car gains about 3.5% of its remaining value.
        // This is the premium depreciation adjustment standard in NL (e.g. following ANWB/BOVAG indices).
        let kmAdjustmentFactor = 1.0;
        if (kmDifference > 0) {
          kmAdjustmentFactor = Math.max(0.60, 1.0 - (kmDifference / 10000) * 0.04);
        } else if (kmDifference < 0) {
          kmAdjustmentFactor = Math.min(1.25, 1.0 + (Math.abs(kmDifference) / 10000) * 0.035);
        }
        finalValue *= kmAdjustmentFactor;
      }
    }

    // A car's residual value floor is usually around 8% of original value, minimum of €750
    const floorValue = originalPrice * 0.08;
    return Math.max(finalValue, floorValue, 750);
  };

  const getVehicleYear = (datumStr?: string) => {
    if (!datumStr || datumStr.length < 4) return null;
    const year = parseInt(datumStr.substring(0, 4));
    return isNaN(year) ? null : year;
  };

  const analyzeRadarAdas = (vehicleData: any, calcInputStr: string, invoiceInputStr: string) => {
    if (!vehicleData) return null;
    const year = getVehicleYear(vehicleData.datum_eerste_toelating);
    const catalogPrice = vehicleData.catalogusprijs ? parseFloat(vehicleData.catalogusprijs) : 0;
    const brand = (vehicleData.merk || "").toUpperCase();
    const model = (vehicleData.handelsbenaming || "").toUpperCase();
    
    // ADAS Radar equipment heuristic based on physical stats & EU legislation
    let hasRadar: 'Ja' | 'Nee' | 'Mogelijk' = 'Nee';
    let confidence: 'hoog' | 'gemiddeld' | 'laag' = 'hoog';
    let reasons: string[] = [];
    let sensors: string[] = [];

    if (year) {
      if (year >= 2022) {
        // Emergency braking (AEBS) which uses radar typically is standard on all EU vehicles from 2022
        hasRadar = 'Ja';
        confidence = 'hoog';
        reasons.push("Noodremsystemen (AEB) zijn sinds juli 2022 wettelijk verplicht voor alle nieuwe typegoedkeuringen in de EU.");
        sensors.push("Front-radar (afstandssensor achter voorbumper/grille/embleem)");
        sensors.push("Multifunctionele camera (achter voorruit bij binnenspiegel)");
      } else if (year >= 2018) {
        hasRadar = 'Ja';
        confidence = 'hoog';
        reasons.push(`Gezien het bouwjaar (${year}) is dit model vrijwel gegarandeerd uitgerust met actieve rij-assistentie (ADAS).`);
        sensors.push("Front-radar (afstandssensor)");
        sensors.push("Multifunctionele voorruit-camera");
      } else if (year >= 2014) {
        // 2014-2017: premium brands or expensive cars usually had radar
        const premiumBrands = ["AUDI", "BMW", "MERCEDES-BENZ", "VOLVO", "TESLA", "LEXUS", "LAND ROVER", "JAGUAR", "PORSCHE", "VOLKSWAGEN"];
        const isPremium = premiumBrands.some(pb => brand.includes(pb));
        
        if (isPremium) {
          hasRadar = 'Ja';
          confidence = 'gemiddeld';
          reasons.push(`Premium merk of model (${capitalizeWords(brand)}) met bouwjaar ${year}. Uitrusting met cruise-control radar of noodremsysteem (ACC/AEB) is zeer aannemelijk.`);
          sensors.push("Distronic / ACC Front Radar");
          sensors.push("Lane Assist Camera");
        } else if (catalogPrice > 28000) {
          hasRadar = 'Mogelijk';
          confidence = 'gemiddeld';
          reasons.push(`Hogere catalogusprijs (${formatCurrency(catalogPrice.toString())}) voor bouwjaar ${year}. Mogelijk geleverd met optionele radar.`);
          sensors.push("Mogelijk adaptief radarsysteem");
        } else {
          hasRadar = 'Nee';
          confidence = 'gemiddeld';
          reasons.push(`Voor dit bouwjaar (${year}) en deze prijsklasse is een radar-noodremsysteem hoogst uitzonderlijk of niet aanwezig.`);
        }
      } else {
        // Before 2014: Only luxury cruise-control radars (ACC)
        const ultraLuxury = catalogPrice > 65000 || brand === "TESLA";
        if (ultraLuxury) {
          hasRadar = 'Mogelijk';
          confidence = 'laag';
          reasons.push(`Exclusief segment / hoge catalogusprijs (${formatCurrency(catalogPrice.toString())}) van vóór 2014. Mogelijk optionele Active Cruise Control (ACC) radar.`);
          sensors.push("Vroege generatie ACC Radar (optioneel)");
        } else {
          hasRadar = 'Nee';
          confidence = 'hoog';
          reasons.push(`Bouwjaar (${year}) ligt vóór de grootschalige marktintroductie van ADAS/AEB in dit segment.`);
        }
      }
    } else {
      hasRadar = 'Mogelijk';
      confidence = 'laag';
      reasons.push("Geen bouwjaar bekend uit de RDW-database om de uitrusting te bepalen.");
    }

    // Cross-reference with Estimate or Invoice lines (searching keywords)
    const fullText = `${calcInputStr} ${invoiceInputStr}`.toLowerCase();
    
    // Checks for bumper-area bodywork and ADAS-calibration/radars
    const hasBumperWork = ["bumper", "grille", "rooster", "front", "embleem", "logo", "scherm v", "voorzijde"].some(w => fullText.includes(w));
    const hasCalibration = ["kalibrat", "calibrat", "uitlijn", "afstel", "inleer", "camera af", "aiming", "sensor binden", "adas"].some(w => fullText.includes(w));
    const hasRadarPart = ["radar", "acc s", "afstandssensor", "afstand sensor", "afstandsradar", "distronic"].some(w => fullText.includes(w));

    let alertType: 'warning' | 'info' | 'success' | null = null;
    let alertTitle = "";
    let alertMessage = "";

    if (hasRadar === 'Ja' || (hasRadar === 'Mogelijk' && hasRadarPart)) {
      if (hasBumperWork && !hasCalibration) {
        alertType = 'warning';
        alertTitle = "Mogelijk Ontbrekende ADAS Kalibratie!";
        alertMessage = `Dit voertuig ${capitalizeWords(brand)} heeft een radarsysteem en er is schadeherstel aan de voorzijde gedocumenteerd. Er is echter geen post voor ADAS/radar-kalibratie of sensorafstelling opgenomen op de inkoopfactuur of calculatie. Herkalibratie is essentieel voor de verkeersveiligheid.`;
      } else if (hasBumperWork && hasCalibration) {
        alertType = 'success';
        alertTitle = "ADAS Kalibratie Geverifieerd";
        alertMessage = `Uitstekend. De noodzakelijke radar- of ADAS-kalibratie na frontwerkzaamheden is correct opgenomen op de inkoopfactuur of calculatie.`;
      }
    } else if (hasRadar === 'Nee') {
      if (hasRadarPart || fullText.includes("radar kalib") || fullText.includes("kalibreren radar") || fullText.includes("acc kalib") || fullText.includes("adas kalib")) {
        alertType = 'warning';
        alertTitle = "Verdachte ADAS Waarschuwing";
        alertMessage = `Er is een radar-kalibratie of radarsensor berekend op de documenten, maar dit voertuig (${capitalizeWords(brand)} uit ${year || 'onbekend'}) is volgens de fabrieksspecificaties niet uitgerust met een ADAS-radar. Controleer op onterechte kostendeclaratie.`;
      }
    }

    return {
      hasRadar,
      confidence,
      reasons,
      sensors,
      alert: alertType ? { type: alertType, title: alertTitle, message: alertMessage } : null
    };
  };

  // Fetch prices for selected client
  useEffect(() => {
    if (selectedClientId) {
      const loadPrices = async () => {
        try {
          const snapshot = await getDocs(collection(db, "clients", selectedClientId, "prices"));
          const prices: Record<string, number[]> = {};
          snapshot.docs.forEach(d => {
            const data = d.data();
            const norm = normalizePartNumber(data.partNumber);
            if (!prices[norm]) prices[norm] = [];
            prices[norm].push(data.price);
          });
          setClientPrices(prices);
        } catch (err) {
          handleFirestoreError(err, 'get', `clients/${selectedClientId}/prices`);
        }
      };
      loadPrices();
    } else {
      setClientPrices({});
    }
  }, [selectedClientId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;
    
    setAuthLoading(true);
    try {
      try {
        await addDoc(collection(db, "login_attempts"), {
          email: cleanEmail,
          timestamp: serverTimestamp(),
          userAgent: navigator.userAgent,
          status: "attempted"
        });
      } catch (logErr) {
        handleFirestoreError(logErr, 'create', 'login_attempts');
        // Continue login even if logging fails
      }

      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authError: any) {
        // Auto-register any user on first attempt. Since we cannot read Firestore before logging in,
        // we allow creation for any auth/user-not-found or auth/invalid-credential.
        // If they already exist and type the wrong password, createUser will throw email-already-in-use, which we map to "Onjuist wachtwoord".
        // Unapproved accounts will be instantly deleted and signed out inside onAuthStateChanged.
        const cleanErrCode = authError.code;
        if (cleanErrCode === 'auth/user-not-found' || cleanErrCode === 'auth/invalid-credential' || cleanErrCode === 'auth/invalid-login-credentials') {
          try {
            await createUserWithEmailAndPassword(auth, cleanEmail, password);
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use' || createError.code === 'auth/email-already-exists') {
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
      
      try {
        await addDoc(collection(db, "login_attempts"), {
          email: cleanEmail,
          timestamp: serverTimestamp(),
          status: "failed",
          error: error.message || error.code
        });
      } catch (logErr) {
        handleFirestoreError(logErr, 'create', 'login_attempts');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setForgotPasswordStatus({
        success: false,
        message: "Vul eerst uw e-mailadres in om een herstellink te ontvangen."
      });
      return;
    }

    setForgotPasswordLoading(true);
    setForgotPasswordStatus(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setForgotPasswordStatus({
        success: true,
        message: `Wachtwoordherstellink is succesvol verzonden naar ${cleanEmail}! Controleer uw inbox (en spam) om uw wachtwoord te veranderen.`
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      let message = "Fout bij het verzenden van de herstellink.";
      if (error.code === 'auth/user-not-found') {
        message = "Dit e-mailadres is niet bekend in ons systeem.";
      } else if (error.code === 'auth/invalid-email') {
        message = "Voer een geldig e-mailadres in.";
      } else if (error.code === 'auth/too-many-requests') {
        message = "Te veel verzoeken achter elkaar. Probeer het later opnieuw.";
      }
      setForgotPasswordStatus({
        success: false,
        message
      });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
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
    } else {
      alert("Ongeldige 2FA code!");
    }
  };

  const handleTfaSetupVerify = async (e: React.FormEvent) => {
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

    const delta = totp.validate({ token: tfaCode, window: 1 });
    if (delta !== null) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          tfaEnabled: true,
          tfaSecret: tfaSecret
        });
        setIsTfaEnabled(true);
        setIsAuthorized(true);
        setToastMsg("2FA succesvol ingesteld!");
        setTimeout(() => setToastMsg(null), 3000);
      } catch (err) {
        alert("Fout bij opslaan van 2FA instellingen.");
      }
    } else {
      alert("Ongeldige code. Probeer het opnieuw.");
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
    if (calculationParts.length === 0 && manualParts.length === 0) return [];

    const combined = [...calculationParts, ...manualParts];

    const allResults = combined.map(calcPart => {
      const normalizedCalc = normalizePartNumber(calcPart.partNumber);
      
      // Find matches by part number
      const match = invoiceParts.find(invPart => 
        normalizePartNumber(invPart.partNumber) === normalizedCalc
      );

      // If no part number match, try semantic description match
      const semanticMatch = !match ? invoiceParts.find(invPart => 
        descriptionsMatch(calcPart.description, invPart.description)
      ) : null;

      const clientPriceList = clientPrices[normalizedCalc] || [];
      const matchingPriceClient = clientPriceList.find(p => Math.abs(p - calcPart.price) < 0.005);
      const matchesClientPrice = matchingPriceClient !== undefined;

      const virtualClientMatch = matchesClientPrice ? {
        id: `CLIENT-${calcPart.id}`,
        description: `Prijslijst: ${clients.find(c => c.id === selectedClientId)?.name || 'Opdrachtgever'}`,
        partNumber: calcPart.partNumber,
        price: matchingPriceClient
      } : null;

      const finalMatch = match || semanticMatch || virtualClientMatch;

      const overrideKey = `${calcPart.id}-${calcPart.partNumber}`;
      const manualPrice = manualOverrides[overrideKey];

      const priceDiff = manualPrice !== undefined 
        ? manualPrice - calcPart.price 
        : (finalMatch ? finalMatch.price - calcPart.price : 0);
        
      // Handle floating point precision, ignore differences < 0.005
      const hasRealDiff = Math.abs(priceDiff) > 0.005;

      let status: 'matched' | 'deviation' | 'missing' | 'approved' | 'removed' = 'missing';
      
      if (removedPartIds.has(calcPart.id)) {
        status = 'removed';
      } else if (matchesClientPrice) {
        // Automatically match if it hits the client's price list
        status = 'matched';
      } else if (manualPrice !== undefined) {
        // If manual price equals calculation price, it's effectively "OK"
        const manualDiff = manualPrice - calcPart.price;
        status = Math.abs(manualDiff) < 0.005 ? 'matched' : 'approved';
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

    // Custom sorting: OK -> Deviation -> Missing -> Approved (Manual) -> Removed
    const statusOrder = {
      'matched': 0,
      'deviation': 1,
      'missing': 2,
      'approved': 3,
      'removed': 4
    };

    return allResults.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [calculationParts, manualParts, removedPartIds, invoiceParts, manualOverrides]);

  const stats = useMemo(() => {
    const matched = results.filter(r => r.status === 'matched').length;
    const deviations = results.filter(r => r.status === 'deviation').length;
    const missing = results.filter(r => r.status === 'missing').length;
    const approved = results.filter(r => r.status === 'approved').length;
    const totalPriceDiff = results.reduce((acc, r) => acc + r.priceDiff, 0);
    
    // Sum of all "good" prices: manual overrides OR invoice matches
    const totalVerifiedAmount = results
      .filter(r => r.status !== 'removed' && r.status !== 'missing')
      .reduce((acc, r) => acc + (r.manualPrice ?? r.match?.price ?? 0), 0);

    return { matched, deviations, missing, approved, totalPriceDiff, totalVerifiedAmount };
  }, [results]);

  const filteredResults = useMemo(() => {
    let base = results;
    if (!showRemoved) {
      base = base.filter(r => r.status !== 'removed');
    }
    
    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(r => 
      r.calc.description.toLowerCase().includes(q) || 
      r.calc.partNumber.toLowerCase().includes(q) ||
      r.calc.id.includes(q) ||
      (r.match?.description.toLowerCase().includes(q))
    );
  }, [results, searchQuery, showRemoved]);

  const handleResetAll = () => {
    setCalcInput("");
    setInvoiceInput("");
    setSearchQuery("");
    setManualOverrides({});
    setEditingCell(null);
    setRemovedPartIds(new Set());
    setStruckThroughIds(new Set());
    setRedPriceStruckThroughIds(new Set());
    setManualParts([]);
    setLicensePlate("");
    setCaseNumber("");
    setKmStand("");
    setChassisNumber("");
  };

  const toggleRedPriceStrikethrough = (id: string) => {
    setRedPriceStruckThroughIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRedPriceStrikethrough = () => {
    const visibleIds = filteredResults.map(res => res.calc.id);
    const allChecked = visibleIds.every(id => redPriceStruckThroughIds.has(id));
    
    setRedPriceStruckThroughIds(prev => {
      const next = new Set(prev);
      if (allChecked) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleStrikethrough = (id: string) => {
    setStruckThroughIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRemovePart = (id: string) => {
    setRemovedPartIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addManualPart = () => {
    const newPart: AutomotivePart = {
      id: `MAN-${Date.now()}`,
      description: "Nieuw Onderdeel",
      partNumber: "00000000",
      price: 0
    };
    setManualParts(prev => [...prev, newPart]);
  };

  const updateManualPart = (id: string, field: keyof AutomotivePart, value: any) => {
    setManualParts(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, [field]: field === 'price' ? parseFloat(value) || 0 : value };
      }
      return p;
    }));
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
    if (licensePlate) doc.text(`Kenteken: ${licensePlate.toUpperCase()}`, 14, 33);
    if (caseNumber) doc.text(`Dossiernummer: ${caseNumber}`, 14, 38);
    if (chassisNumber) doc.text(`Chassisnummer: ${chassisNumber.toUpperCase()}`, 14, 43);
    if (kmStand) doc.text(`Kilometerstand: ${parseInt(kmStand.replace(/\D/g, '')).toLocaleString('nl-NL')} km`, 120, 33);
    if (vehicleData) {
      const estimatedValue = calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand);
      if (estimatedValue) {
        doc.text(`Geschatte Dagwaarde: EUR ${estimatedValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 120, 38);
      }
    }
    
    doc.setFont("helvetica", "bold");
    doc.text("Ontwikkeld door: Danny Radjkoemar", 120, 20);
    doc.setFont("helvetica", "normal");
    doc.text("Onderdelen Controle Systeem", 120, 25);

    // Summary Stats - Shift down if chassis number is printed
    doc.setDrawColor(226, 232, 240);
    const lineY = chassisNumber ? 47 : 42;
    doc.line(14, lineY, 196, lineY);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Samenvatting:", 14, lineY + 9);

    doc.setFontSize(10);
    doc.text(`Totaal aantal onderdelen: ${results.length}`, 14, lineY + 16);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text(`Match OK: ${stats.matched}`, 14, lineY + 22);
    doc.setTextColor(245, 158, 11); // Amber-500
    doc.text(`Handmatig Goedgekeurd: ${stats.approved}`, 14, lineY + 28);
    doc.setTextColor(225, 29, 72); // Rose-600
    doc.text(`Afwijkingen: ${stats.deviations}`, 14, lineY + 34);
    doc.setTextColor(244, 63, 94); // Rose-500
    doc.text(`Ontbrekend: ${stats.missing}`, 14, lineY + 40);
    
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.setFontSize(11);
    doc.text(`Totaal Prijsverschil: EUR ${stats.totalPriceDiff.toFixed(2)}`, 14, lineY + 49);
    
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAAL GEVERIFIEERD BEDRAG: EUR ${stats.totalVerifiedAmount.toFixed(2)}`, 14, lineY + 55);
    doc.setFont("helvetica", "normal");

    // Table
    const visibleInPdf = showRemoved ? results : results.filter(r => r.status !== 'removed');
    const tableData = visibleInPdf.map(res => [
      res.status === 'matched' ? 'OK' : 
      res.status === 'approved' ? 'GEWIJZIGD' :
      res.status === 'deviation' ? 'AFWIJKING' : 
      res.status === 'removed' ? 'VERWIJDERD' : 'ONTBREEKT',
      res.calc.id,
      res.calc.description,
      res.calc.partNumber,
      `EUR ${res.calc.price.toFixed(2)}`,
      res.status === 'approved' ? `EUR ${res.manualPrice?.toFixed(2)}*` : (res.match ? `EUR ${res.match.price.toFixed(2)}` : '—'),
      res.priceDiff !== 0 ? (res.priceDiff > 0 ? '+' : '') + res.priceDiff.toFixed(2) : '—'
    ]);

    autoTable(doc, {
      startY: lineY + 63,
      head: [['Status', 'Pos.', 'Onderdeel', 'Partnummer', 'Calc. Prijs', 'Factuur Prijs', 'Verschil']],
      body: tableData,
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 15 },
        2: { cellWidth: 45 },
        3: { cellWidth: 30 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        const item = visibleInPdf[data.row.index];
        if (!item) return;

        if (data.section === 'body') {
          // Soft reddish background for any deviation rows to catch attention
          if (item.status === 'deviation') {
            data.cell.styles.fillColor = [254, 242, 242]; // Light red
          }

          if (data.column.index === 0) {
            if (item.status === 'matched') data.cell.styles.textColor = [16, 185, 129];
            else if (item.status === 'approved') data.cell.styles.textColor = [245, 158, 11];
            else if (item.status === 'deviation') {
              data.cell.styles.textColor = [225, 29, 72];
              data.cell.styles.fontStyle = 'bold';
            }
            else if (item.status === 'missing') data.cell.styles.textColor = [244, 63, 94];
            else if (item.status === 'removed') data.cell.styles.textColor = [150, 150, 150];
          }

          // Pos. column (Index 1) - yellow highlighter highlights for deviation position
          if (data.column.index === 1 && item.status === 'deviation') {
            data.cell.styles.fillColor = [253, 224, 71]; // Bright yellow highlighter
            data.cell.styles.textColor = [15, 23, 42]; // Slate-900 (dark charcoal text)
            data.cell.styles.fontStyle = 'bold';
          }

          // Factuur Prijs column (Index 5)
          if (data.column.index === 5) {
            if (item.status === 'deviation') {
              data.cell.styles.fillColor = [209, 250, 229]; // Soft emerald highlighter
              data.cell.styles.textColor = [16, 185, 129]; // Active green
              data.cell.styles.fontStyle = 'bold';
            } else {
              const val = parseFloat(data.cell.text[0].replace('EUR ', '').replace('+', ''));
              if (val > 0) data.cell.styles.textColor = [16, 185, 129];
            }
          }

          // Price differences (Index 6)
          if (data.column.index === 6) {
            if (item.priceDiff > 0) {
              data.cell.styles.textColor = [225, 29, 72]; // Rose-600 (higher cost)
            } else if (item.priceDiff < 0) {
              data.cell.styles.textColor = [16, 185, 129]; // Emerald (saving details)
            }
          }
        }
      },
      didDrawCell: (data) => {
        const item = visibleInPdf[data.row.index];
        if (!item) return;

        if (data.section === 'body') {
          if (data.column.index === 4 && item.status === 'deviation') {
            const tempDrawColor = doc.getDrawColor(); 
            const tempLineWidth = doc.getLineWidth();

            doc.setDrawColor(225, 29, 72); // Rose-600 red
            doc.setLineWidth(1.2);
            
            const xLeft = data.cell.x + 2;
            const xRight = data.cell.x + data.cell.width - 2;
            const yCenter = data.cell.y + (data.cell.height / 2);
            doc.line(xLeft, yCenter, xRight, yCenter);

            doc.setDrawColor(tempDrawColor);
            doc.setLineWidth(tempLineWidth);
          }
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
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(37,99,235,0.4)] relative">
              <CarFront className="text-white w-10 h-10" />
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
                <ShieldCheck className="text-blue-600 w-4 h-4" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">PartVerify Pro</h1>
            <p className="text-slate-400 mt-2 text-center text-xs">
              {loginStep === 'password' && 'Beveiligde toegang tot onderdelen controle'}
              {loginStep === 'tfa' && 'Voer uw 2FA code in'}
              {loginStep === 'tfa-setup' && 'Stel twee-staps verificatie (2FA) in'}
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
                  <div className="flex justify-end px-1">
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotPasswordLoading}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium hover:underline disabled:opacity-50"
                    >
                      {forgotPasswordLoading ? "Verzenden..." : "Wachtwoord vergeten?"}
                    </button>
                  </div>
                </div>
                {forgotPasswordStatus && (
                  <div className={`p-3.5 rounded-xl text-xs font-semibold border text-left leading-relaxed ${
                    forgotPasswordStatus.success 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  }`}>
                    {forgotPasswordStatus.message}
                  </div>
                )}
                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {authLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Inloggen"}
                </button>
              </motion.form>
            ) : loginStep === 'tfa-setup' ? (
              <motion.form 
                key="tfa-setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleTfaSetupVerify} 
                className="space-y-4 text-left"
              >
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-slate-300 text-xs space-y-3 leading-relaxed">
                  <p className="font-semibold text-white">Scanner / Handmatige Setup:</p>
                  <p>Scan deze QR code met uw Microsoft, Google of een andere Authenticator app:</p>
                  
                  {tfaSecret && (
                    <div className="bg-white p-3 rounded-xl flex justify-center w-[136px] mx-auto">
                      <QRCodeCanvas 
                        value={`otpauth://totp/PartVerify%20Pro:${encodeURIComponent(user?.email || "User")}?secret=${tfaSecret}&issuer=PartVerify%20Pro`}
                        size={112}
                        bgColor="#ffffff"
                        fgColor="#090d16"
                        level="M"
                      />
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400">Of voeg de geheime sleutel handmatig toe:</p>
                  <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 font-mono text-[11px] break-all select-all text-blue-400 text-center select-all">
                    {tfaSecret}
                  </div>
                </div>

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
                  Verifiëren & Activeren
                </button>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2 block text-center"
                >
                  Terug naar inloggen
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

                <div className="pt-3 border-t border-white/5 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowAuthQrCode(!showAuthQrCode)}
                    className="w-full text-blue-400 hover:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer py-1"
                  >
                    <QrCode className="w-4 h-4 shrink-0" />
                    {showAuthQrCode ? "Verberg Authenticator QR-Sleutel" : "Authenticator nog niet gekoppeld? Toon QR & sleutel"}
                  </button>

                  {showAuthQrCode && tfaSecret && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/10 rounded-2xl p-4 text-slate-300 text-[11px] space-y-3 leading-relaxed text-left"
                    >
                      <p className="font-semibold text-white">Scanner / Handmatige Setup:</p>
                      <p>Koppel direct door deze QR-code te scannen met uw Microsoft, Google of een andere Authenticator app:</p>

                      <div className="bg-white p-3 rounded-xl flex justify-center w-[136px] mx-auto shadow-md">
                        <QRCodeCanvas 
                          value={`otpauth://totp/PartVerify%20Pro:${encodeURIComponent(user?.email || "User")}?secret=${tfaSecret}&issuer=PartVerify%20Pro`}
                          size={112}
                          bgColor="#ffffff"
                          fgColor="#090d16"
                          level="M"
                        />
                      </div>

                      <p className="text-[10px] text-slate-400">Of voeg de geheime sleutel handmatig toe:</p>
                      <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 font-mono text-[11px] break-all select-all text-blue-400 text-center select-all font-bold tracking-wide">
                        {tfaSecret}
                      </div>
                    </motion.div>
                  )}
                </div>
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
          <div 
            className="flex items-center gap-3 cursor-pointer select-none active:scale-98 transition-transform"
            onClick={() => {
              if (user?.email?.toLowerCase() !== "partverify-pro@outlook.com") return;
              setLogoClickCount(prev => {
                const next = prev + 1;
                if (next >= 5) {
                  setIsBackdoorOpen(true);
                  setToastMsg("Ontwikkelaarsbypass geactiveerd!");
                  setTimeout(() => setToastMsg(null), 3000);
                  return 0;
                }
                return next;
              });
            }}
          >
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 relative">
              <CarFront className="text-white w-6 h-6" />
              <div className="absolute -bottom-1 -right-1 bg-white rounded-md p-0.5 shadow-sm">
                <ClipboardCheck className="text-blue-600 w-3 h-3" />
              </div>
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
              onClick={() => setIsManualOpen(true)}
              className="px-3.5 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 hover:border-blue-250 rounded-lg flex items-center gap-2 transition-all font-bold text-xs"
              title="Handleiding"
            >
              <HelpCircle size={16} />
              Handleiding
            </button>
            <button 
              onClick={handleLogout}
              className="px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg flex items-center gap-2 transition-all font-bold text-xs"
              title="Uitloggen"
            >
              <LogOut size={16} />
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {view === 'dashboard' ? (
          <>
            {/* Top Bar: Dossier Info */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              <div className="flex-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="w-full">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Kenteken</label>
                  <div className="flex items-center gap-3">
                    {/* Dutch styled license plate input - Upgraded for premium readability & visual rest */}
                    <div className="relative flex items-center bg-[#FFDE00] text-slate-900 font-mono font-black border-[3px] border-slate-900 rounded-2xl overflow-hidden shadow-sm h-16 flex-1 max-w-[280px] transition-all hover:shadow-md focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-slate-900">
                      {/* EU/NL banner - Optimized for height & crisp typography */}
                      <div className="bg-[#0039AE] text-white text-[10px] w-10 h-full flex flex-col items-center justify-center leading-none select-none shrink-0 border-r-2 border-slate-900/15 border-slate-900">
                        <span className="text-[12px] text-[#FFDE00] font-sans leading-none mb-1 select-none">★★</span>
                        <span className="text-[13px] font-sans font-black tracking-normal leading-none select-none">NL</span>
                      </div>
                      
                      {/* Input - Large 2XL soothing high-legibility font with clean letter spacing */}
                      <input 
                        type="text"
                        placeholder="AB-123-C"
                        maxLength={11}
                        className="w-full bg-transparent text-center text-xl md:text-2xl font-black font-mono placeholder:text-slate-900/30 text-slate-900 focus:outline-none uppercase tracking-[0.08em] px-2 selection:bg-slate-900/20"
                        value={licensePlate}
                        onChange={(e) => setLicensePlate(e.target.value)}
                      />
                    </div>
                    {licensePlate.replace(/[^a-zA-Z0-9]/g, '').length >= 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (vehicleData) {
                            setShowRdwModal(true);
                           }
                        }}
                        disabled={vehicleLoading}
                        className={`h-16 px-4 rounded-2xl font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0 select-none ${
                          vehicleData 
                            ? 'bg-yellow-300 text-slate-950 border border-yellow-400 hover:bg-yellow-400 hover:shadow-md' 
                            : vehicleLoading 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50' 
                            : 'bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:text-blue-700'
                        }`}
                        title={vehicleData ? "Bekijk RDW Voertuiggegevens" : "Wacht even tot de RDW data is geladen"}
                      >
                        <CarFront size={14} className={vehicleLoading ? "animate-spin text-blue-500" : "text-current"} />
                        <span>{vehicleLoading ? 'Laden...' : 'RDW'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Dossiernummer</label>
                  <input 
                    type="text"
                    placeholder="Invoeren..."
                    className="w-full h-16 bg-slate-50 border border-slate-100 px-4 rounded-2xl text-lg font-black text-slate-800 focus:outline-none focus:bg-white focus:border-blue-400 transition-all placeholder:text-slate-300 shadow-sm"
                    value={caseNumber}
                    onChange={(e) => setCaseNumber(e.target.value)}
                  />
                </div>

                <div className="w-full">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Opdrachtgever</label>
                  <div className="relative">
                    <select 
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full h-16 bg-slate-50 border border-slate-100 px-4 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-blue-400 transition-all appearance-none cursor-pointer pr-10 shadow-sm"
                    >
                      <option value="">Geen / Standaard</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
                      <Layers size={14} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={saveCurrentDossier}
                  disabled={!licensePlate && !caseNumber}
                  className="px-5 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-250 hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2 active:scale-95 disabled:opacity-55 disabled:pointer-events-none"
                  title="Bewaar dit dossier in de lokale historie"
                >
                  <Save size={18} />
                  <span>Dossier Opslaan</span>
                </button>
                <button 
                  onClick={downloadPDF}
                  disabled={results.length === 0}
                  className="px-5 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:-translate-y-0.5 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <FileDown size={18} />
                  <span>PDF Rapport</span>
                </button>
                <button 
                  onClick={handleResetAll}
                  className="px-5 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95"
                >
                  <RefreshCw size={18} />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Inputs - Side-by-side and placed directly at the top for immediate access */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InputSection 
                title="Eindcalculatie" 
                placeholder="Plak hier uw eindcalculatie gegevens..." 
                value={calcInput} 
                onChange={setCalcInput} 
                icon={<ClipboardCheck className="w-5 h-5 text-blue-600" />}
                partCount={calculationParts.length}
              />
              <InputSection 
                title="Inkoopfacturen" 
                placeholder="Plak hier de gegevens van inkoopfactur(en)..." 
                value={invoiceInput} 
                onChange={setInvoiceInput} 
                icon={<Layers className="w-5 h-5 text-indigo-600" />}
                partCount={invoiceParts.length}
              />
            </div>



            {/* Main Stats: Financials vs Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Primary Financial Overview */}
              <div className="lg:col-span-1 grid grid-cols-1 gap-4">
                <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-100 text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-700">
                    <ClipboardCheck size={120} />
                  </div>
                  <div className="relative z-10 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-100">Totaal Geverifieerd</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold opacity-80">€</span>
                      <h3 className="text-5xl font-black tracking-tighter">{stats.totalVerifiedAmount.toFixed(2)}</h3>
                    </div>
                    <div className="pt-4 border-t border-white/10 flex items-center justify-between text-blue-100">
                      <span className="text-xs font-medium">Inclusief aangepaste regels</span>
                      <CheckCircle2 size={20} className="text-blue-200" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-amber-200 transition-all">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prijsverschil</p>
                    <div className="flex items-center gap-2">
                       <h3 className={`text-2xl font-black ${stats.totalPriceDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        € {stats.totalPriceDiff.toFixed(2)}
                      </h3>
                      <RefreshCw size={18} className={`text-amber-400 ${stats.totalPriceDiff !== 0 ? 'animate-spin-slow' : ''}`} />
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stats.totalPriceDiff > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <AlertCircle size={24} />
                  </div>
                </div>
              </div>

              {/* Status Breakdown Grid */}
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatsCard 
                  label="Totaal Regels" 
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
                <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-200 flex flex-col justify-center items-center text-center space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculatie Bron</p>
                  <p className="text-xs font-bold text-slate-600">Automatisering Actief</p>
                </div>
              </div>
            </div>


            {/* Quick Count Comparison Banner */}
            {(calculationParts.length > 0 || invoiceParts.length > 0) && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Vergelijkingsmeter</h4>
                    <p className="text-[11px] text-slate-500">Snel overzicht van gedetecteerde onderdelen aan beide zijden.</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eindcalculatie</span>
                    <span className="text-sm font-black text-blue-600">{calculationParts.length} stuks</span>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="text-right">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inkoopfacturen</span>
                    <span className="text-sm font-black text-indigo-600">{invoiceParts.length} stuks</span>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verschil</span>
                    <span className={`text-sm font-black ${calculationParts.length === invoiceParts.length ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Math.abs(calculationParts.length - invoiceParts.length)} {calculationParts.length === invoiceParts.length ? '✓' : 'stuks'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* OPTION 3: Visuele Kosten Breakdown (Volledige breedte) - Terminal hacker theme */}
            <div className="w-full bg-slate-950 rounded-3xl border border-slate-800 shadow-[0_4px_30px_rgba(0,0,0,0.4)] p-6 flex flex-col space-y-6 font-mono relative overflow-hidden">
              {/* Scanline grid texture overlay for visual depth */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,190,255,0.015)_95%)] bg-[size:100%_24px] pointer-events-none" />
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 relative z-10">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                  </span>
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest font-mono">[PV-PRO_TELEM_V2.6]</span>
                    <h3 className="text-sm font-black tracking-tight text-slate-100 uppercase">Visuele Kosten & Besparings Analyse</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 px-2.5 py-1 rounded-md animate-pulse uppercase tracking-wider font-extrabold shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                    RECONCILER: ACTIVE
                  </span>
                </div>
              </div>

              {results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 text-left relative z-10">
                  {/* Progress representation */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                      <span className="text-cyan-500 font-bold text-xs">&gt;_</span>
                      <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">FINANCIAL_CORE_METRICS</h4>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Calculations sum bar */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                          <span>[SYS_CALC_REF] Berekende onderdelen:</span>
                          <span className="font-extrabold text-slate-200">
                            € {results.reduce((sum, r) => sum + r.calc.price, 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-5 bg-slate-900 border border-slate-800/80 rounded px-1 flex items-center shadow-inner relative overflow-hidden">
                          <div className="absolute right-2 text-[8px] text-slate-600 font-bold tracking-widest uppercase z-10">[M_TARGET_BASE]</div>
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8 }}
                            className="h-2.5 rounded-sm bg-slate-800 border-r border-slate-700 shadow-[0_0_8px_rgba(100,116,139,0.2)]"
                          />
                        </div>
                      </div>

                      {/* Verified Actual Price */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                          <span>[SYS_ACTUAL_MATCH] Goedgekeurde som:</span>
                          <span className="font-extrabold text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.15)]">
                            € {stats.totalVerifiedAmount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {(() => {
                          const percentage = Math.min(100, (stats.totalVerifiedAmount / Math.max(1, results.reduce((sum, r) => sum + r.calc.price, 0))) * 100);
                          return (
                            <div className="h-5 bg-slate-900 border border-slate-800/80 rounded px-1 flex items-center shadow-inner relative overflow-hidden">
                              <div className="absolute right-2 text-[8px] text-cyan-400 font-black tracking-widest uppercase z-10">{percentage.toFixed(1)}% RATIO</div>
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="h-2.5 rounded-sm bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.45)] border-r border-cyan-400"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Visual Difference Ring or Box */}
                    {stats.totalPriceDiff <= 0 ? (
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 flex items-center justify-between transition-all shadow-[inset_0_0_15px_rgba(16,185,129,0.05),0_0_15px_rgba(16,185,129,0.05)]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <h5 className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                              SYS_STATUS: IN_BUDGET ✓
                            </h5>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                            Dossier met succes reconciled. Kostenbesparing gedetecteerd.
                          </p>
                        </div>
                        <div className="text-right pl-4">
                          <div className="text-[9px] text-slate-500 font-semibold tracking-widest">DELTA_GAIN</div>
                          <span className="text-lg font-black tracking-tight text-emerald-400 select-all">
                            -€ {Math.abs(stats.totalPriceDiff).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-400 flex items-center justify-between transition-all shadow-[inset_0_0_15px_rgba(244,63,94,0.05),0_0_15px_rgba(244,63,94,0.05)]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                            <h5 className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                              SYS_STATUS: OVER_BUDGET ⚠
                            </h5>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                            Afwijkend bedrag gedetecteerd. Vereist beheerderstoestemming.
                          </p>
                        </div>
                        <div className="text-right pl-4">
                          <div className="text-[9px] text-slate-500 font-semibold tracking-widest">DELTA_LOSS</div>
                          <span className="text-lg font-black tracking-tight text-rose-400 select-all">
                            +€ {Math.abs(stats.totalPriceDiff).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Breakdown distribution percentages */}
                  <div className="space-y-5 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                        <span className="text-cyan-500 font-bold text-xs">&gt;_</span>
                        <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">RULE_FLOW_DISTRIBUTION</h4>
                      </div>
                      
                      <div className="flex h-6 rounded overflow-hidden border border-slate-850 shadow-inner bg-slate-900 p-[2px]">
                        {stats.matched > 0 && (
                          <div 
                            style={{ width: `${(stats.matched / results.length) * 100}%` }} 
                            className="bg-emerald-500/80 hover:bg-emerald-400 border border-emerald-500/10 h-full text-center flex items-center justify-center text-[9px] text-slate-950 font-black transition-all cursor-crosshair"
                            title={`Matched OK: ${stats.matched}`}
                          >
                            {Math.round((stats.matched / results.length) * 100)}%
                          </div>
                        )}
                        {stats.approved > 0 && (
                          <div 
                            style={{ width: `${(stats.approved / results.length) * 100}%` }} 
                            className="bg-amber-500/80 hover:bg-amber-400 border border-amber-500/10 h-full text-center flex items-center justify-center text-[9px] text-slate-950 font-black transition-all cursor-crosshair"
                            title={`Handmatig: ${stats.approved}`}
                          >
                            {Math.round((stats.approved / results.length) * 100)}%
                          </div>
                        )}
                        {stats.deviations > 0 && (
                          <div 
                            style={{ width: `${(stats.deviations / results.length) * 100}%` }} 
                            className="bg-rose-500/80 hover:bg-rose-400 border border-rose-500/10 h-full text-center flex items-center justify-center text-[9px] text-slate-950 font-black transition-all cursor-crosshair"
                            title={`Verschil: ${stats.deviations}`}
                          >
                            {Math.round((stats.deviations / results.length) * 100)}%
                          </div>
                        )}
                        {stats.missing > 0 && (
                          <div 
                            style={{ width: `${(stats.missing / results.length) * 100}%` }} 
                            className="bg-pink-500/80 hover:bg-pink-400 border border-pink-500/10 h-full text-center flex items-center justify-center text-[9px] text-slate-950 font-black transition-all cursor-crosshair"
                            title={`Ontbrekend: ${stats.missing}`}
                          >
                            {Math.round((stats.missing / results.length) * 100)}%
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-850 flex-1 flex flex-col justify-center space-y-2 font-mono">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-400 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                          MATCHED_OK
                        </span>
                        <span className="font-extrabold text-slate-200">{stats.matched} regels</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-400 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-sm bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
                          PRICE_MISMATCH
                        </span>
                        <span className="font-extrabold text-rose-400">{stats.deviations} regels</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-400 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-sm bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                          MANUAL_OVERRIDES
                        </span>
                        <span className="font-extrabold text-amber-500">{stats.approved} regels</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-850 bg-slate-950/40 rounded-3xl text-slate-500 space-y-4 relative z-10">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 animate-pulse">
                    <Activity size={24} className="text-cyan-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-cyan-400 tracking-widest">[ANALYSIS_PORT_IDLE]</h4>
                    <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-relaxed mt-1">
                      Wachten op syntactische inputstream. Plak calculatie- en inkoopfactuurgegevens in de bovenstaande buffers om de diagnostische telemetry-matrix te initialiseren.
                    </p>
                  </div>
                </div>
              )}
            </div>



          {/* RDW ADAS / Radar Intelli-Audit Alerts */}
          {(() => {
            const audit = analyzeRadarAdas(vehicleData, calcInput, invoiceInput);
            if (!audit || !audit.alert) return null;
            
            const { type, title, message } = audit.alert;
            return (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 rounded-3xl border text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 ${
                  type === 'warning' 
                    ? 'bg-rose-50 border-rose-100 text-rose-800' 
                    : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2.5 rounded-2xl shrink-0 ${
                    type === 'warning' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {type === 'warning' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight flex items-center gap-2">
                      <span>{title}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        type === 'warning' ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-850'
                      }`}>ADAS Audit</span>
                    </h4>
                    <p className="text-xs font-medium mt-1 leading-relaxed opacity-95">{message}</p>
                  </div>
                </div>
                {/* Action button */}
                <div className="shrink-0 w-full md:w-auto text-right self-center">
                  <button
                    onClick={() => setShowRdwModal(true)}
                    className={`text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl border transition-all active:scale-95 whitespace-nowrap ${
                      type === 'warning' 
                        ? 'bg-rose-100/60 hover:bg-rose-200 text-rose-800 border-rose-200' 
                        : 'bg-emerald-100/60 hover:bg-emerald-200 text-emerald-850 border-emerald-200'
                    }`}
                  >
                    Bekijk Radar Status
                  </button>
                </div>
              </motion.div>
            );
          })()}

            {/* Report Section */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                      <ClipboardCheck size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold leading-none">Verificatie Verslag</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {filteredResults.length} Resultaten gevonden
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={toggleAllRedPriceStrikethrough}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100/80 text-rose-600 border border-rose-100 hover:border-rose-200 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer font-sans"
                      title={filteredResults.length > 0 && filteredResults.every(res => redPriceStruckThroughIds.has(res.calc.id)) ? "Verwijder rood doorstrepen voor alle prijzen" : "Alle calculatieprijzen in één keer rood doorstrepen"}
                    >
                      <Strikethrough size={16} className="text-rose-500 shrink-0" />
                      {filteredResults.length > 0 && filteredResults.every(res => redPriceStruckThroughIds.has(res.calc.id)) ? "Prijzen Herstellen" : "Prijzen Rood Doorstrepen"}
                    </button>

                    <button 
                      onClick={addManualPart}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 font-sans cursor-pointer"
                    >
                      <Plus size={16} />
                      Regel Toevoegen
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={showRemoved} 
                          onChange={(e) => setShowRemoved(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-700 transition-colors uppercase tracking-tight">Verwijderde regels tonen</span>
                    </label>
                  </div>

                  <div className="relative flex-1 md:max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="Zoek op onderdeel, nummer of ID..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/50 w-full transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                      <th className="px-4 py-4 w-10"></th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-center">Pos.</th>
                      <th className="px-6 py-4">Onderdeel (Calculatie)</th>
                      <th className="px-6 py-4">Partnummer</th>
                      <th className="px-6 py-4">
                        <div className="flex items-center gap-1.5 justify-start">
                          <span>Prijs Calc.</span>
                          <button
                            type="button"
                            onClick={toggleAllRedPriceStrikethrough}
                            className={`p-1 rounded transition-all cursor-pointer ${
                              filteredResults.length > 0 && filteredResults.every(res => redPriceStruckThroughIds.has(res.calc.id))
                                ? 'bg-rose-100 text-rose-600 border border-rose-200 shadow-sm'
                                : 'bg-slate-100 hover:bg-rose-50 hover:text-rose-500 text-slate-400 border border-transparent'
                            }`}
                            title={filteredResults.length > 0 && filteredResults.every(res => redPriceStruckThroughIds.has(res.calc.id)) ? "Prijzen herstellen" : "Alle prijzen rood doorstrepen"}
                          >
                            <Strikethrough size={11} />
                          </button>
                        </div>
                      </th>
                      <th className="px-6 py-4">Factuur Match / Prijs</th>
                      <th className="px-6 py-4">Verschil</th>
                      <th className="px-6 py-4 text-right">Acties</th>
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
                            className={`group hover:bg-slate-50/80 transition-all ${res.status === 'removed' ? 'opacity-40 grayscale bg-slate-50/50' : ''} ${struckThroughIds.has(res.calc.id) ? 'opacity-40 grayscale bg-slate-50/30' : ''}`}
                          >
                            <td className="px-4 py-4">
                              {(res.status === 'removed' || res.status === 'approved') && (
                                <button 
                                  onClick={() => toggleStrikethrough(res.calc.id)}
                                  className={`p-2 rounded-lg transition-all ${struckThroughIds.has(res.calc.id) ? 'bg-indigo-100 text-indigo-600' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                  title={struckThroughIds.has(res.calc.id) ? "Standaard weergave" : "Doorstrepen"}
                                >
                                  <CheckSquare size={16} />
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold uppercase tracking-tight">
                              {res.status === 'matched' ? (
                                <div className="flex items-center gap-2 text-emerald-600">
                                  <CheckCircle2 size={16} />
                                  OK
                                </div>
                              ) : res.status === 'approved' ? (
                                <div className="flex items-center gap-2 text-amber-600">
                                  <ShieldCheck size={16} />
                                  AANGEPAST
                                </div>
                              ) : res.status === 'deviation' ? (
                                <div className="flex items-center gap-2 text-rose-600">
                                  <AlertCircle size={16} />
                                  AFWIJKING
                                </div>
                              ) : res.status === 'removed' ? (
                                <div className="flex items-center gap-2 text-slate-400">
                                  <Trash2 size={16} />
                                  VERWIJDERD
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-rose-500">
                                  <XCircle size={16} />
                                  ONTBREEKT
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {res.status === 'deviation' ? (
                                <span className="inline-flex items-center justify-center font-black text-xs px-2.5 py-1 rounded-lg bg-yellow-300 text-slate-950 border-2 border-yellow-400 shadow-md transform hover:scale-105 transition-all outline outline-1 outline-yellow-400/50 animate-pulse">
                                  {res.calc.id}
                                </span>
                              ) : res.status === 'matched' ? (
                                <span className="inline-flex items-center justify-center font-bold text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {res.calc.id}
                                </span>
                              ) : res.status === 'approved' ? (
                                <span className="inline-flex items-center justify-center font-bold text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                  {res.calc.id}
                                </span>
                              ) : res.status === 'removed' ? (
                                <span className="inline-flex items-center justify-center font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200 line-through font-mono">
                                  {res.calc.id}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center font-bold text-xs px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                                  {res.calc.id}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {res.calc.id.startsWith('MAN-') ? (
                                <input 
                                  type="text"
                                  value={res.calc.description}
                                  onChange={(e) => updateManualPart(res.calc.id, 'description', e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm font-semibold focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              ) : (
                                <div className={`font-semibold text-slate-800 text-sm ${struckThroughIds.has(res.calc.id) ? 'line-through decoration-slate-400 decoration-2' : ''}`}>{res.calc.description}</div>
                              )}
                              {res.isSemantic && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium mt-1 inline-block">
                                  Semantische Match
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {res.calc.id.startsWith('MAN-') ? (
                                <input 
                                  type="text"
                                  value={res.calc.partNumber}
                                  onChange={(e) => updateManualPart(res.calc.id, 'partNumber', e.target.value)}
                                  className="w-28 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              ) : (
                                <code className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap border border-slate-200">
                                  {res.calc.partNumber}
                                </code>
                              )}
                            </td>
                            <td className="px-6 py-4 font-black text-slate-900 text-base whitespace-nowrap">
                              {res.calc.id.startsWith('MAN-') ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 text-sm font-bold">€</span>
                                  <input 
                                    type="number"
                                    step="0.01"
                                    value={res.calc.price}
                                    onChange={(e) => updateManualPart(res.calc.id, 'price', e.target.value)}
                                    className="w-24 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-base font-black focus:ring-1 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group/price-cell">
                                  {res.status === 'deviation' ? (
                                    <div className="flex flex-col">
                                      <span className="text-slate-400 line-through decoration-rose-500 decoration-2 text-sm font-black">
                                        € {res.calc.price.toFixed(2)}
                                      </span>
                                      <span className="text-[9px] text-rose-500 font-bold uppercase tracking-wider">AFWIJKING ({res.calc.price.toFixed(2)})</span>
                                    </div>
                                  ) : (
                                    <span className={`text-base font-black transition-all ${
                                      redPriceStruckThroughIds.has(res.calc.id)
                                        ? 'text-slate-400 line-through decoration-rose-500 decoration-2 text-sm'
                                        : 'text-slate-900 font-black'
                                    }`}>
                                      € {res.calc.price.toFixed(2)}
                                    </span>
                                  )}
                                  
                                  <button 
                                    onClick={() => toggleRedPriceStrikethrough(res.calc.id)}
                                    className={`p-1 rounded-lg border transition-all ${
                                      redPriceStruckThroughIds.has(res.calc.id) 
                                        ? 'bg-rose-50 border-rose-200 text-rose-600 opacity-100 shadow-sm' 
                                        : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover/price-cell:opacity-100 focus:opacity-100'
                                    }`}
                                    title={redPriceStruckThroughIds.has(res.calc.id) ? "Streep weghalen" : "Prijs rood doorstrepen"}
                                  >
                                    <Strikethrough size={13} />
                                  </button>
                                </div>
                              )}
                            </td>
                             <td className="px-6 py-4">
                               {editingCell === `${res.calc.id}-${res.calc.partNumber}` ? (
                                 <div className="flex items-center gap-2">
                                   <span className="text-blue-500 font-black">€</span>
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
                                     className="w-28 p-2 border-2 border-blue-400 rounded-lg text-base font-black text-blue-700 focus:outline-none shadow-sm"
                                   />
                                 </div>
                               ) : res.manualPrice !== undefined ? (
                                 <div 
                                   onClick={() => handleManualOverride(res.calc.id, res.calc.partNumber)}
                                   className="p-2.5 rounded-2xl border-2 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 cursor-pointer shadow-sm flex items-center justify-between transition-all"
                                 >
                                   <div className="flex flex-col gap-1">
                                     <div className="flex items-center gap-1.5">
                                       <span className="text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md bg-yellow-300 text-slate-950 border border-yellow-400 shadow-sm leading-none flex items-center justify-center">
                                          {res.calc.id}
                                        </span>
                                       <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/50 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Aangepast</span>
                                     </div>
                                     <div className="text-emerald-700 font-black text-base">
                                       € {res.manualPrice?.toFixed(2)}
                                     </div>
                                   </div>
                                   <button 
                                     onClick={(e) => { e.stopPropagation(); removeOverride(res.calc.id, res.calc.partNumber); }}
                                     className="text-slate-400 hover:text-rose-500 transition-all p-1.5 bg-white hover:bg-rose-50 rounded-lg shadow-sm"
                                     title="Aanpassing ongedaan maken"
                                   >
                                     <RefreshCw size={12} />
                                   </button>
                                 </div>
                               ) : res.match ? (
                                 <div 
                                   onClick={() => handleManualOverride(res.calc.id, res.calc.partNumber)}
                                   className={`p-3 rounded-2xl border-2 cursor-pointer transition-all shadow-md ${
                                     res.status === 'matched' 
                                       ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' 
                                       : 'bg-rose-50 border-rose-300 hover:bg-rose-100 ring-2 ring-rose-500/10'
                                   }`}
                                 >
                                   <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                     <span className="text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md bg-yellow-300 text-slate-950 border border-yellow-400 shadow-sm leading-none flex items-center justify-center">
                                        {res.calc.id}
                                      </span>
                                     <span className="text-slate-700 text-xs font-bold truncate max-w-[150px]" title={res.match.description}>
                                       {res.match.description}
                                     </span>
                                     {res.isSemantic && (
                                       <span title="Intelligente match op beschrijving" className="text-indigo-600 bg-indigo-50 border border-indigo-150 px-1 py-0.5 text-[8px] rounded font-bold uppercase tracking-widest">
                                         Sem
                                       </span>
                                     )}
                                   </div>
                                   
                                   {res.status === 'deviation' ? (
                                      <div className="mt-1.5 p-2.5 bg-emerald-600 rounded-xl text-white shadow-md border border-emerald-500 flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] uppercase font-black tracking-widest text-emerald-100 flex items-center gap-1">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            👉 CORRECTE PRIJS:
                                          </span>
                                          <span className="bg-yellow-300 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md border border-yellow-400 shadow">
                                            {res.calc.id}
                                          </span>
                                        </div>
                                       <span className="font-black text-lg leading-tight">
                                         € {res.match.price.toFixed(2)}
                                       </span>
                                     </div>
                                   ) : (
                                     <div className="flex items-center gap-2">
                                       <span className="font-black text-base text-emerald-600">
                                         € {res.match.price.toFixed(2)}
                                       </span>
                                       <code className="text-[10px] font-mono text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/50 whitespace-nowrap">
                                          {res.match.partNumber}
                                       </code>
                                     </div>
                                   )}
                                 </div>
                               ) : (
                                 <div 
                                   onClick={() => handleManualOverride(res.calc.id, res.calc.partNumber)}
                                   className="p-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all flex items-center gap-2 text-blue-600 hover:text-blue-700 font-bold text-xs"
                                 >
                                   <span className="text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md bg-yellow-300 text-slate-950 border border-yellow-400 shadow-sm leading-none flex items-center justify-center">
                                      {res.calc.id}
                                    </span>
                                   <span>+ Prijs invullen</span>
                                 </div>
                               )}
                             </td>
                            <td className="px-6 py-4">
                              {res.priceDiff !== 0 ? (
                                <span className={`font-black text-base ${res.priceDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {res.priceDiff > 0 ? '+' : ''}{res.priceDiff.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right flex items-center justify-end gap-1">
                              <button 
                                onClick={() => {
                                  if (res.calc.id.startsWith('MAN-')) {
                                    setManualParts(prev => prev.filter(p => p.id !== res.calc.id));
                                  } else {
                                    toggleRemovePart(res.calc.id);
                                  }
                                }}
                                className={`p-2 rounded-lg transition-all ${res.status === 'removed' ? 'bg-amber-100 text-amber-600 ring-2 ring-amber-200' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}
                                title={res.status === 'removed' ? "Herstellen" : "Verwijderen"}
                              >
                                {res.status === 'removed' ? <RefreshCw size={18} className="animate-spin-slow" /> : <Trash2 size={18} />}
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-20 text-center">
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
            currentUserEmail={user?.email || null}
            onOpenBackdoor={() => setIsBackdoorOpen(true)}
          />
        ) : (
          <AdminView 
            onBack={() => setView('dashboard')}
            savedDossiers={savedDossiers}
            loadDossier={(d: any) => {
              loadDossier(d);
              setView('dashboard');
            }}
            deleteDossier={deleteDossier}
          />
        )}

        {/* RDW Voertuiggegevens Uitgebreide Modal */}
        <AnimatePresence>
          {showRdwModal && vehicleData && (
            <div className="fixed inset-0 z-50 overflow-y-auto">
              {/* Backdrop slide/fade */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRdwModal(false)}
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
              />
              
              {/* Modal Box */}
              <div className="flex min-h-screen items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="relative bg-white text-slate-900 rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-100 z-10 flex flex-col max-h-[90vh]"
                >
                  {/* Header: Brand Banner with RDW look & feel */}
                  <div className="bg-gradient-to-r from-slate-900 to-slate-850 p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-850">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center text-slate-950 shadow-md transform rotate-3 shrink-0">
                        <CarFront size={24} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                          <span>RDW Voertuigrapport</span>
                          <span className="px-2 py-0.5 bg-yellow-400 text-slate-950 rounded-md font-black text-[9px] uppercase tracking-widest leading-none">OFFICIEEL</span>
                        </h3>
                        <p className="text-slate-400 text-xs mt-0.5 font-medium">Uitgebreide voertuigspecificaties uit de RDW Open Data database</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Centered stylized license plate */}
                      <div className="bg-[#FFD600] text-black font-mono font-black border-2 border-slate-950 px-4 py-1.5 rounded-xl flex items-center gap-3 tracking-wider text-base shadow-inner h-11 select-none">
                        <div className="bg-[#0039AE] text-white text-[9px] px-1 py-0.5 rounded-md flex flex-col items-center justify-center leading-none font-sans h-5 self-center">
                          <span className="text-[7px] font-black tracking-tighter">NL</span>
                        </div>
                        <span className="text-sm tracking-[0.05em]">{licensePlate.toUpperCase().replace(/[^a-zA-Z0-9]/g, '').replace(/(.{2})(.{2})(.{2})/, '$1-$2-$3')}</span>
                      </div>

                      <button 
                        onClick={() => setShowRdwModal(false)}
                        className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                        title="Sluiten"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* General Vehicle Info Card */}
                    <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/20 p-6 rounded-3xl border border-blue-100/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-left">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest bg-blue-100/50 px-2.5 py-1 rounded-full border border-blue-100">Merk & Model</span>
                        <h4 className="text-2xl font-black text-slate-900 mt-2">
                          {capitalizeWords(vehicleData.merk)} {capitalizeWords(vehicleData.handelsbenaming)}
                        </h4>
                        <p className="text-sm text-slate-500 font-medium">{capitalizeWords(vehicleData.inrichting) || "Niet gespecificeerd"} ({vehicleData.voertuigsoort})</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {/* Insured Status Pill */}
                        <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${vehicleData.wam_verzekerd === 'Ja' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
                          <span className="text-xs font-bold text-slate-600">
                            Verzekerd: <span className={vehicleData.wam_verzekerd === 'Ja' ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>{vehicleData.wam_verzekerd || 'Onbekend'}</span>
                          </span>
                        </div>
                        
                        {/* APK Expiration Pill */}
                        <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-2">
                          <Calendar size={14} className="text-blue-500" />
                          <span className="text-xs font-bold text-slate-600">
                            APK tot: <span className="text-slate-900 font-black">{formatDateRDW(vehicleData.vervaldatum_apk)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Kilometerstand Input Card */}
                    <div className="bg-slate-50 border border-slate-250/60 p-5 rounded-3xl text-left flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                          <Gauge size={20} />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-slate-800">Kilometerstand Verificatie</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Beïnvloedt de actuele dagwaarde direct op basis van gebruik.</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
                        {/* KM Input */}
                        <div className="relative">
                          <input 
                            type="text"
                            placeholder="Bijv. 120.000"
                            value={kmStand ? parseInt(kmStand.replace(/\D/g, '')).toLocaleString('nl-NL') : ""}
                            onChange={(e) => {
                              const rawVal = e.target.value.replace(/\D/g, '');
                              setKmStand(rawVal);
                            }}
                            className="w-full sm:w-48 bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl py-2 pl-4 pr-12 text-slate-800 font-bold text-sm focus:outline-none transition-all placeholder:text-slate-400"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 select-none">KM</span>
                        </div>
                        
                        {/* Dynamic status helper */}
                        <div className="text-xs font-medium text-slate-600 flex items-center justify-center min-h-[36px] bg-white border border-slate-100 shadow-sm px-4 rounded-xl">
                          {(() => {
                            const years = (() => {
                              const datum = vehicleData.datum_eerste_toelating;
                              if (datum && datum.length === 8) {
                                const year = parseInt(datum.substring(0, 4));
                                const month = parseInt(datum.substring(4, 6)) - 1;
                                const day = parseInt(datum.substring(6, 8));
                                const admissionDate = new Date(year, month, day);
                                const today = new Date();
                                return Math.max(0.1, Math.abs(today.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
                              }
                              return 1;
                            })();
                            const expected = Math.round(years * 15000);
                            const current = kmStand ? parseInt(kmStand.replace(/\D/g, '')) : 0;
                            
                            if (!kmStand || isNaN(current) || current <= 0) {
                              return (
                                <span className="text-slate-400 italic">Verwacht gem.: {expected.toLocaleString('nl-NL')} km</span>
                              );
                            }
                            
                            const diff = current - expected;
                            if (diff > 5000) {
                              return (
                                <span className="text-rose-600 font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  <span>+{Math.abs(diff).toLocaleString('nl-NL')} km t.o.v. gem.</span>
                                </span>
                              );
                            } else if (diff < -5000) {
                              return (
                                <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>-{Math.abs(diff).toLocaleString('nl-NL')} km t.o.v. gem.</span>
                                </span>
                              );
                            } else {
                              return (
                                <span className="text-blue-600 font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  <span>Conform landelijk gemiddelde</span>
                                </span>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Chassisnummer / Voertuigidentificatienummer (VIN) Input Card */}
                    <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-3xl text-left flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                          <Fingerprint size={20} className="text-indigo-500 animate-pulse" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            <span>Chassisnummer (VIN)</span>
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-black uppercase tracking-wider">Lokaal Opgeslagen</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium">Vanwege privacywetgeving en anti-frauderichtlijnen (kentekencloning) is het chassisnummer wettelijk niet openbaar beschikbaar via open RDW-data. Voer dit desgewenst handmatig in voor dossieropslag.</p>
                        </div>
                      </div>
                      
                      <div className="w-full md:w-auto relative">
                        <input 
                          type="text"
                          placeholder="Voer 17-cijferige VIN in..."
                          value={chassisNumber}
                          onChange={(e) => setChassisNumber(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
                          maxLength={17}
                          className="w-full sm:w-64 bg-white border border-slate-200 focus:border-indigo-550 focus:ring-2 focus:ring-indigo-150 rounded-xl py-2 px-4 text-slate-850 font-mono font-black text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal focus:outline-none transition-all placeholder:text-slate-400"
                        />
                        {chassisNumber && (
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-black text-slate-400 bg-slate-50 border px-1.5 py-0.5 rounded">
                            {chassisNumber.length}/17
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RDW ADAS & Radar Sensor Analyse Card */}
                    {(() => {
                      const audit = analyzeRadarAdas(vehicleData, calcInput, invoiceInput);
                      if (!audit) return null;
                      return (
                        <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-3xl text-left space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                                <CarFront size={20} className="text-indigo-500 animate-pulse" />
                              </div>
                              <div>
                                <h4 className="text-sm font-black text-slate-800">ADAS & Radarsensoren Analyse (RDW)</h4>
                                <p className="text-[11px] text-slate-500 font-medium">Bepaald op basis van bouwjaar, merkklasse, catalogusprijs en EU criteria.</p>
                              </div>
                            </div>

                            {/* Badge */}
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full ${
                                audit.hasRadar === 'Ja' 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : audit.hasRadar === 'Mogelijk'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-200 text-slate-600 border border-slate-305'
                              }`}>
                                Front Radar: {audit.hasRadar}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 capitalize">
                                ({audit.confidence} betrouwbaarheid)
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-2">
                              <p className="font-bold text-slate-700">Heuristische Analyse Criteria:</p>
                              <ul className="list-disc list-inside space-y-1.5 text-slate-500 font-medium pl-1">
                                {audit.reasons.map((r, idx) => (
                                  <li key={idx} className="leading-relaxed">{r}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-2 bg-white p-3.5 rounded-2xl border border-slate-150">
                              <p className="font-bold text-slate-705 flex items-center gap-1.5">
                                <ShieldCheck size={14} className="text-indigo-600 animate-bounce" />
                                <span>Verwachte Beveiligingscamera & Sensoren:</span>
                              </p>
                              {audit.sensors.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {audit.sensors.map((s, idx) => (
                                    <span key={idx} className="bg-indigo-50/50 border border-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded-lg text-[10px]">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-400 italic font-medium">Geen premium ADAS sensoren verwacht op basis van voertuigleeftijd.</p>
                              )}
                              <p className="text-[10px] text-slate-400 pt-1 leading-normal font-medium">
                                *Let op: Voorbumper herstellingen aan auto's met radarsystemen vereisen ALTIJD kalibratie.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Highly prominent 'Geschatte Dagwaarde' banner */}
                    {calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-[2rem] p-6 text-white flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg shadow-emerald-500/10 relative overflow-hidden group"
                      >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full translate-x-12 -translate-y-12 pointer-events-none group-hover:scale-110 transition-transform duration-550" />
                        <div className="flex items-center gap-4 text-left relative z-10">
                          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-inner select-none">
                            <DollarSign size={28} className="text-emerald-300" />
                          </div>
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-100 bg-emerald-500/40 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">Calculatie Hulp</span>
                            <h4 className="text-base font-black text-white mt-1">Geschatte Actuele Dagwaarde</h4>
                          </div>
                        </div>
                        <div className="text-right relative z-10">
                          <span className="text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-sm select-all">
                            {formatCurrency(calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand)?.toString())}
                          </span>
                          <p className="text-[9px] text-emerald-100 font-bold mt-1 uppercase tracking-wider opacity-90">Berekend op basis van degressieve afschrijving, leeftijd & kilometerstand</p>
                        </div>
                      </motion.div>
                    )}

                    {/* Grid of details categorized */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                      {/* Panel 1: Basis & Registratiegegevens */}
                      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-4">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-3">
                          <Calendar size={14} className="text-blue-600" />
                          <span>Registratie & Historie</span>
                        </h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Datum eerste toelating" value={formatDateRDW(vehicleData.datum_eerste_toelating)} />
                          <DetailRow label="Datum eerste afgifte NL" value={formatDateRDW(vehicleData.datum_eerste_afgifte_nederland)} />
                          <DetailRow label="Datum laatste tenaamstelling" value={formatDateRDW(vehicleData.datum_tenaamstelling)} />
                          <DetailRow label="Vervaldatum APK" value={formatDateRDW(vehicleData.vervaldatum_apk)} valueColor={
                            vehicleData.vervaldatum_apk && parseInt(vehicleData.vervaldatum_apk) < parseInt(new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, ''))
                              ? 'text-rose-600 font-black'
                              : 'text-blue-600 font-black'
                          } />
                          <DetailRow label="Kleur" value={capitalizeWords(vehicleData.eerste_kleur)} />
                          <DetailRow label="Tweede kleur" value={capitalizeWords(vehicleData.tweede_kleur) === "Niet Geregistreerd" ? "Geen" : capitalizeWords(vehicleData.tweede_kleur)} />
                        </div>
                      </div>

                      {/* Panel 2: Technische Specificaties */}
                      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-4">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-3">
                          <Activity size={14} className="text-blue-600" />
                          <span>Techniek & Motor</span>
                        </h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Cilinderinhoud" value={vehicleData.cilinderinhoud ? `${vehicleData.cilinderinhoud} cc` : "Onbekend"} />
                          <DetailRow label="Aantal cilinders" value={vehicleData.aantal_cilinders || "Onbekend"} />
                          <DetailRow label="Aantal zitplaatsen" value={vehicleData.aantal_zitplaatsen || "Onbekend"} />
                          <DetailRow label="Aantal deuren" value={vehicleData.aantal_deuren || "Onbekend"} />
                          <DetailRow label="Aantal wielen" value={vehicleData.aantal_wielen || "Onbekend"} />
                          <DetailRow label="Inrichting" value={capitalizeWords(vehicleData.inrichting)} />
                        </div>
                      </div>

                      {/* Panel 3: Financiële Informatie */}
                      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-4">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-3">
                          <DollarSign size={14} className="text-blue-600" />
                          <span>Financieel & Belasting</span>
                        </h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Catalogusprijs" value={formatCurrency(vehicleData.catalogusprijs)} valueColor="text-emerald-600 font-black" />
                          <DetailRow label="Bruto BPM" value={formatCurrency(vehicleData.bruto_bpm)} valueColor="text-blue-600 font-black" />
                          {calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand) && (
                            <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 bg-slate-100/60 p-2 rounded-xl">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-500 flex items-center gap-1">
                                  <span>Geschatte Dagwaarde</span>
                                  <span className="bg-blue-105 text-blue-700 font-black text-[8px] px-1 py-0.5 rounded uppercase" title="Berekend op basis van degressieve afschrijving, leeftijd & kilometerstand">INFORMATIEF</span>
                                </span>
                                <span className="font-black text-slate-900">
                                  {formatCurrency(calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand)?.toString())}
                                </span>
                              </div>
                            </div>
                          )}
                          <DetailRow label="Zuinigheidslabel" value={vehicleData.zuinigheidslabel ? vehicleData.zuinigheidslabel.toUpperCase() : "Niet geregistreerd"} />
                          <DetailRow label="Taxi indicator" value={vehicleData.taxi_indicator || "Nee"} />
                          <DetailRow label="Export indicator" value={vehicleData.export_indicator || "Nee"} />
                        </div>
                      </div>

                      {/* Panel 4: Gewichten & Limieten */}
                      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-4">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-3">
                          <Info size={14} className="text-blue-600" />
                          <span>Massa & Trekgewicht</span>
                        </h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Rijklaar gewicht" value={vehicleData.massa_rijklaar ? `${vehicleData.massa_rijklaar} kg` : "Onbekend"} />
                          <DetailRow label="Ledig gewicht" value={vehicleData.massa_ledig_voertuig ? `${vehicleData.massa_ledig_voertuig} kg` : "Onbekend"} />
                          <DetailRow label="Toegestane max. massa" value={vehicleData.toegestane_maximum_massa ? `${vehicleData.toegestane_maximum_massa} kg` : "Onbekend"} />
                          <DetailRow label="Aanhangwagen geremd" value={vehicleData.maximum_massa_trekken_geremd ? `${vehicleData.maximum_massa_trekken_geremd} kg` : "Niet toegestaan"} />
                          <DetailRow label="Aanhangwagen ongeremd" value={vehicleData.maximum_massa_trekken_ongeremd ? `${vehicleData.maximum_massa_trekken_ongeremd} kg` : "Niet toegestaan"} />
                          <DetailRow label="Openstaande terugroepactie" value={vehicleData.openstaande_terugroepactie_indicator || "Nee"} valueColor={vehicleData.openstaande_terugroepactie_indicator === "Ja" ? "text-rose-600 font-bold animate-pulse" : "text-slate-800 font-bold"} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer of modal */}
                  <div className="bg-slate-50 px-8 py-5 flex items-center justify-between border-t border-slate-100 rounded-b-[2.5rem] shrink-0">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                      <ShieldCheck size={14} className="text-blue-500" />
                      <span>Danny Radjkoemar Compliance Suite</span>
                    </div>
                    <button 
                      onClick={() => setShowRdwModal(false)}
                      className="px-6 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-colors active:scale-95"
                    >
                      Sluiten
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>
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
      {/* Toast Alert popup notification block */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white font-bold text-sm px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-xl whitespace-pre-wrap"
          >
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5">
              <CheckCircle2 size={14} className="text-white" />
            </div>
            <div className="flex-1 pr-2 leading-relaxed">
              {toastMsg}
            </div>
            <button 
              onClick={() => setToastMsg(null)}
              className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg shrink-0 -mt-1 -mr-1"
              id="close-toast-btn"
              title="Sluiten"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBackdoorOpen && (
          <BackdoorPanel 
            isOpen={isBackdoorOpen}
            onClose={() => setIsBackdoorOpen(false)}
            db={db}
            currentUserEmail={user?.email || null}
            onToast={(msg) => {
              setToastMsg(msg);
              setTimeout(() => setToastMsg(null), 5000);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isManualOpen && (
          <ManualModal 
            isOpen={isManualOpen}
            onClose={() => setIsManualOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsView({ isTfaEnabled, tfaSecret, onSetupTfa, onConfirmTfa, onDisableTfa, onBack, currentUserEmail, onOpenBackdoor }: any) {
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

      {currentUserEmail?.toLowerCase() === 'partverify-pro@outlook.com' && (
        <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>Developer Portaal</span>
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md text-[9px] font-black tracking-widest uppercase">GOD MODE ACTIEF</span>
            </h3>
            <p className="text-slate-400 text-xs">U bent ingelogd als partverify-pro@outlook.com. Gebruik dit controlepaneel om database-parameters en security-overrides direct aan te passen.</p>
          </div>
          <button 
            onClick={onOpenBackdoor}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/40 transition-all shrink-0 uppercase tracking-widest h-11"
          >
            <Settings size={14} />
            Open Backdoor Console
          </button>
        </div>
      )}
    </motion.div>
  );
}

function AdminView({ onBack, savedDossiers, loadDossier, deleteDossier }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [attempts, setAttempts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'clients' | 'logs' | 'history'>('clients');
  const [historySearch, setHistorySearch] = useState("");

  const filteredDossiers = useMemo(() => {
    if (!savedDossiers) return [];
    if (!historySearch.trim()) return savedDossiers;
    const cleanQuery = historySearch.toLowerCase().replace(/[^a-z0-9]/g, '');
    return savedDossiers.filter((d: any) => {
      const caseNum = (d.caseNumber || "").toLowerCase();
      const licPlate = (d.licensePlate || "").toLowerCase();
      const cleanLicPlate = licPlate.replace(/[^a-z0-9]/g, '');
      const cleanCaseNum = caseNum.replace(/[^a-z0-9]/g, '');
      return caseNum.includes(historySearch.toLowerCase()) || 
             licPlate.includes(historySearch.toLowerCase()) ||
             cleanLicPlate.includes(cleanQuery) ||
             cleanCaseNum.includes(cleanQuery);
    });
  }, [savedDossiers, historySearch]);

  // Client management state
  const [newClientName, setNewClientName] = useState("");
  const [selectedAdminClient, setSelectedAdminClient] = useState<string | null>(null);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartDescription, setNewPartDescription] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");

  const loadData = async () => {
    const uDocs = await getDocs(collection(db, "users"));
    setUsers(uDocs.docs.map(d => ({ id: d.id, ...d.data() })));

    const aDocs = await getDocs(query(collection(db, "login_attempts")));
    setAttempts(aDocs.docs.map(d => d.data()).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));

    const cDocs = await getDocs(collection(db, "clients"));
    setClients(cDocs.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedAdminClient) {
      const loadPrices = async () => {
        const pDocs = await getDocs(collection(db, "clients", selectedAdminClient, "prices"));
        setClientPrices(pDocs.docs.map(d => ({ id: d.id, ...d.data() })));
      };
      loadPrices();
    }
  }, [selectedAdminClient]);

  const createUser = async () => {
    alert("Om beveiligingsredenen moet u de gebruiker eerst aanmaken in de Firebase Console.\nZodra aangemaakt, voeg ik hier de rol toe aan Firestore.");
    await addDoc(collection(db, "users"), {
      email: newEmail,
      role: "user",
      createdAt: serverTimestamp()
    });
    setNewEmail("");
    loadData();
  };

  const createClient = async () => {
    if (!newClientName.trim()) return;
    await addDoc(collection(db, "clients"), {
      name: newClientName,
      createdAt: serverTimestamp()
    });
    setNewClientName("");
    loadData();
  };

  const addPrice = async () => {
    if (!selectedAdminClient || !newPartNumber || !newPartPrice) return;
    await addDoc(collection(db, "clients", selectedAdminClient, "prices"), {
      partNumber: newPartNumber,
      description: newPartDescription,
      price: parseFloat(newPartPrice.replace(',', '.')),
      updatedAt: serverTimestamp()
    });
    setNewPartNumber("");
    setNewPartDescription("");
    setNewPartPrice("");
    // Reload prices
    const pDocs = await getDocs(collection(db, "clients", selectedAdminClient, "prices"));
    setClientPrices(pDocs.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const deletePrice = async (priceId: string) => {
    if (!selectedAdminClient) return;
    await deleteDoc(doc(db, "clients", selectedAdminClient, "prices", priceId));
    setClientPrices(prev => prev.filter(p => p.id !== priceId));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-amber-600">Beheerderspaneel</h2>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('clients')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'clients' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Opdrachtgevers
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Gebruikers
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'logs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Logs
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Dossier Historie
            </button>
          </div>
        </div>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 font-medium text-sm">Terug naar Dashboard</button>
      </div>

      {activeTab === 'clients' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Client List */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Nieuwe Opdrachtgever</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Naam (bv. Allianz)" 
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
                <button 
                  onClick={createClient}
                  className="p-3 bg-amber-600 text-white rounded-xl hover:bg-amber-500"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Opdrachtgevers</h3>
              <div className="space-y-2">
                {clients.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedAdminClient(c.id)}
                    className={`w-full p-4 text-left rounded-2xl border transition-all ${selectedAdminClient === c.id ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                  >
                    <div className="font-bold text-slate-800">{c.name}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-tight mt-1">
                      {c.id}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Price Management */}
          <div className="lg:col-span-2">
            {selectedAdminClient ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Prijslijst: {clients.find(c => c.id === selectedAdminClient)?.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase bg-slate-100 px-3 py-1 rounded-full">
                    Tip: Voeg meerdere regels toe voor verschillende varianten (bv. luxe/normaal)
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Partnummer</label>
                    <input 
                      type="text" 
                      value={newPartNumber}
                      onChange={(e) => setNewPartNumber(e.target.value)}
                      placeholder="bv. 12345"
                      className="w-full p-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Omschrijving</label>
                    <input 
                      type="text" 
                      value={newPartDescription}
                      onChange={(e) => setNewPartDescription(e.target.value)}
                      placeholder="bv. Kentekenplaat"
                      className="w-full p-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Standaard Prijs</label>
                    <input 
                      type="text" 
                      value={newPartPrice}
                      onChange={(e) => setNewPartPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-1 flex items-end">
                    <button 
                      onClick={addPrice}
                      className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800"
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {clientPrices.length > 0 ? (
                    clientPrices.map(p => (
                      <div key={p.id} className="py-4 flex items-center justify-between group">
                        <div className="flex items-center gap-8">
                          <code className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded w-32">{p.partNumber}</code>
                          <div className="w-48 text-sm font-medium text-slate-700">{p.description}</div>
                          <div className="text-sm font-black text-slate-900">€ {p.price.toFixed(2)}</div>
                        </div>
                        <button 
                          onClick={() => deletePrice(p.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-300 italic text-sm">Geen onderdelen gedefinieerd voor deze opdrachtgever.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-20 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-medium">
                Selecteer een opdrachtgever om de prijslijst te beheren
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'users' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
            <h3 className="text-lg font-bold">Nieuwe Gebruiker Registreren</h3>
            <div className="space-y-4">
              <input 
                type="email" 
                placeholder="Emailadres" 
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-inner shadow-slate-100"
              />
              <button 
                onClick={createUser}
                className="w-full bg-amber-600 text-white py-4 rounded-xl font-bold hover:bg-amber-500 transition-all shadow-lg shadow-amber-100"
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
      ) : activeTab === 'logs' ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8">
          <h3 className="text-lg font-bold mb-6 text-slate-800">Recente Inlogpogingen</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 uppercase tracking-widest font-black border-b border-slate-100">
                  <th className="py-4 px-2">Datum/Tijd</th>
                  <th className="py-4 px-2">Email</th>
                  <th className="py-4 px-2">Status</th>
                  <th className="py-4 px-2">Locatie/Browser</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {attempts.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-all">
                    <td className="py-4 px-2">{a.timestamp?.toDate().toLocaleString('nl-NL')}</td>
                    <td className="py-4 px-2 font-bold">{a.email}</td>
                    <td className="py-4 px-2">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${a.status === 'attempted' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-slate-400 max-w-xs truncate">{a.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <History size={24} />
              </div>
              <div className="text-left font-sans">
                <h3 className="text-lg font-black text-slate-800">Lokal Dossier Historie</h3>
                <p className="text-xs text-slate-500 font-medium font-bold uppercase">Overzicht van recent bewaarde dossiers op dit apparaat.</p>
              </div>
            </div>
            <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 uppercase tracking-widest block shrink-0 leading-none">
              {savedDossiers?.length || 0} dossiers
            </span>
          </div>

          {savedDossiers && savedDossiers.length > 0 && (
            <div className="relative max-w-md text-left">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Zoeken op kenteken of dossiernummer..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-2xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none transition-all shadow-sm"
                id="dossier-history-search"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  title="Wissen"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {savedDossiers && savedDossiers.length > 0 ? (
            filteredDossiers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDossiers.map((d: any) => {
                  const totalDiff = d.stats?.totalPriceDiff ?? 0;
                  return (
                    <div 
                      key={d.id}
                      onClick={() => loadDossier(d)}
                      className="group border border-slate-200 hover:border-blue-400 p-6 rounded-[2rem] bg-slate-50/30 hover:bg-white cursor-pointer transition-all flex flex-col justify-between shadow-sm hover:shadow-lg hover:-translate-y-1 relative duration-350"
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1 text-left">
                            <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded leading-none">
                              {d.clientName}
                            </span>
                            <h4 className="text-base font-black text-slate-950 truncate max-w-[150px]">
                              {d.caseNumber !== "Onbekend" ? d.caseNumber : "Geen Dossiernr"}
                            </h4>
                          </div>
                          {d.licensePlate !== "Onbekend" && (
                            <div className="bg-[#FFD600] text-slate-950 font-mono font-extrabold text-[10px] px-2.5 py-1 rounded border-1.5 border-slate-950 shadow-inner flex shrink-0 leading-none items-center h-6">
                              {d.licensePlate.toUpperCase().replace(/[^a-zA-Z0-9]/g, '')}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-100/80 pt-3 space-y-2 text-left">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Aanmaakdatum:</span>
                            <span className="font-bold text-slate-700">{new Date(d.savedAt).toLocaleDateString('nl-NL')}</span>
                          </div>
                          {d.stats && (
                            <>
                              <div className="flex justify-between text-xs text-slate-500">
                                <span>Goedgekeurd Bedrag:</span>
                                <span className="font-bold text-slate-800">€{d.stats.totalVerifiedAmount?.toFixed(2) || "0.00"}</span>
                              </div>
                              <div className="flex justify-between text-xs text-slate-500">
                                <span>Afwijkingen:</span>
                                <span className={`font-semibold ${d.stats.deviations > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                  {d.stats.deviations} {d.stats.deviations === 1 ? 'regel' : 'regels'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100/80 pt-4 mt-4 flex items-center justify-between gap-4">
                        {d.stats?.totalPriceDiff !== undefined ? (
                          <div className="text-left">
                            <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider font-bold">Resultaat</span>
                            <span className={`text-sm font-black tracking-tight ${
                              totalDiff > 0 ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {totalDiff > 0 ? 'Kostenstijging' : 'Besparing'} €{Math.abs(totalDiff).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <div className="h-6" />
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              loadDossier(d);
                            }}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                          >
                            Laden
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDossier(d.id, e);
                            }}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                            title="Verwijder uit historie"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 space-y-4">
                <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                  <Search size={36} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black uppercase text-slate-500 tracking-wider font-bold">Geen Dossiers Gevonden</h4>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Geen bewaarde dossiers gevonden die overeenkomen met "{historySearch}".
                  </p>
                </div>
                <button
                  onClick={() => setHistorySearch("")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                >
                  Wissen
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 space-y-4">
              <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                <History size={36} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black uppercase text-slate-500 tracking-wider font-bold">Geen Opgeslagen Dossiers</h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Er zijn nog geen dossiers opgeslagen in uw lokale historie op dit apparaat. Gebruik de knop "Dossier Opslaan" op het dashboard om dossiers op te slaan.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
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

function InputSection({ title, placeholder, value, onChange, icon, partCount }: { title: string, placeholder: string, value: string, onChange: (v: string) => void, icon?: React.ReactNode, partCount?: number }) {
  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            {icon}
            {title}
          </label>
          {partCount !== undefined && partCount > 0 && (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              title === "Eindcalculatie" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"
            }`}>
              {partCount} {partCount === 1 ? 'onderdeel' : 'onderdelen'}
            </span>
          )}
        </div>
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
          className="w-full h-52 bg-white border border-slate-200 rounded-3xl p-6 text-sm font-mono text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm resize-none"
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

function DetailRow({ label, value, valueColor = "text-slate-800 font-extrabold" }: { label: string, value: any, valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 text-xs">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className={`${valueColor} text-right break-all`}>{value || "Onbekend"}</span>
    </div>
  );
}
