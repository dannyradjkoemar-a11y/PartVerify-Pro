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
  Strikethrough,
  Camera,
  GraduationCap,
  Check,
  ChevronDown,
  Edit2,
  Upload,
  Link
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
  descriptionsMatch,
  formatCalculationText,
  detectCalibrationAndAlignment,
  scanAudatexCodes
} from "./utils";
import { BackdoorPanel } from "./components/BackdoorPanel";
import { ManualModal } from "./components/ManualModal";
import { PhotoAnalysisTab } from "./components/PhotoAnalysisTab";
import { AudatexCodesModal } from "./components/AudatexCodesModal";

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

// Eenvoudige IndexedDB helper voor lokale PDF opslag per opdrachtgever
const openPdfDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PartVerifyPdfDB", 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("pdfs")) {
        db.createObjectStore("pdfs", { keyPath: "clientId" });
      }
    };
    request.onsuccess = (e) => {
      resolve((e.target as IDBOpenDBRequest).result);
    };
    request.onerror = (e) => {
      reject((e.target as IDBOpenDBRequest).error);
    };
  });
};

const savePdfToLocal = async (clientId: string, fileName: string, base64Data: string): Promise<void> => {
  const db = await openPdfDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("pdfs", "readwrite");
    const store = transaction.objectStore("pdfs");
    const request = store.put({ clientId, fileName, base64Data, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getPdfFromLocal = async (clientId: string): Promise<{ fileName: string, base64Data: string } | null> => {
  try {
    const db = await openPdfDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pdfs", "readonly");
      const store = transaction.objectStore("pdfs");
      const request = store.get(clientId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB get error:", err);
    return null;
  }
};

const deletePdfFromLocal = async (clientId: string): Promise<void> => {
  const db = await openPdfDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("pdfs", "readwrite");
    const store = transaction.objectStore("pdfs");
    const request = store.delete(clientId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

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
  const [dashboardTab, setDashboardTab] = useState<'verification' | 'photo_analysis' | 'training_center'>('verification');
  const [readoutPre, setReadoutPre] = useState(false);
  const [readoutPost, setReadoutPost] = useState(false);
  const [alignmentStatus, setAlignmentStatus] = useState<'none' | 'intern' | 'extern'>('none');
  const [calibrationStatus, setCalibrationStatus] = useState<'none' | 'intern' | 'extern'>('none');
  const [calcInput, setCalcInput] = useState("");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [struckThroughIds, setStruckThroughIds] = useState<Set<string>>(new Set());
  const [redPriceStruckThroughIds, setRedPriceStruckThroughIds] = useState<Set<string>>(new Set());

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Premium Design Studio Styles state variables
  const [layoutShape, setLayoutShape] = useState<string>(() => localStorage.getItem("partverify_layout_shape") || "slightly-rounded");
  const [layoutFont, setLayoutFont] = useState<string>(() => localStorage.getItem("partverify_layout_font") || "Plus Jakarta Sans");
  const [layoutSize, setLayoutSize] = useState<string>(() => localStorage.getItem("partverify_layout_size") || "standard");
  const [layoutStyle, setLayoutStyle] = useState<string>(() => localStorage.getItem("partverify_layout_style") || "platinum-executive");
  const [cardShadow, setCardShadow] = useState<string>(() => localStorage.getItem("partverify_card_shadow") || "soft");
  const [bgPattern, setBgPattern] = useState<string>(() => localStorage.getItem("partverify_bg_pattern") || "solid");
  const [buttonStyle, setButtonStyle] = useState<string>(() => localStorage.getItem("partverify_button_style") || "classic");
  const [inputFlatStyle, setInputFlatStyle] = useState<string>(() => localStorage.getItem("partverify_input_flat") || "rounded");
  const [headerStyle, setHeaderStyle] = useState<string>(() => localStorage.getItem("partverify_header_style") || "standard");
  const [pdfTheme, setPdfTheme] = useState<string>(() => localStorage.getItem("partverify_pdf_theme") || "theme-matched");
  const [crtEffect, setCrtEffect] = useState<boolean>(() => localStorage.getItem("partverify_crt_effect") === "true");
  const [audioFeedback, setAudioFeedback] = useState<boolean>(() => localStorage.getItem("partverify_audio_feedback") === "true");
  const [glowText, setGlowText] = useState<boolean>(() => localStorage.getItem("partverify_glow_text") === "true");
  const [fontSizeScale, setFontSizeScale] = useState<number>(() => parseFloat(localStorage.getItem("partverify_font_size_scale") || "1.0"));

  const PRESET_THEMES = useMemo(() => [
    {
      id: "maybach-obsidian",
      name: "Maybach Obsidian & Champagne Rose Gold",
      desc: "Pure luxe en premium perfectie: gitzwarte obsidiaan, titaangrijze lijnen en vorstelijk champagne-roségoud.",
      primary: "#e2b867",
      primaryHover: "#caa14e",
      bgPage: "#0a0b0e",
      cardBg: "#12141c",
      textColor: "#e1ded6",
      font: "Plus Jakarta Sans",
      shape: "slightly-rounded",
      size: "compact"
    },
    {
      id: "platinum-executive",
      name: "Chamber of Commerce Platinum",
      desc: "Smetteloos directeurs-wit, diep geslepen titaangrijs, royale margins en diep koninklijk platina-slatestaal.",
      primary: "#0f172a",
      primaryHover: "#1e293b",
      bgPage: "#f4f5f7",
      cardBg: "#ffffff",
      textColor: "#0f172a",
      font: "Plus Jakarta Sans",
      shape: "slightly-rounded",
      size: "comfortable"
    },
    {
      id: "classic-blue",
      name: "Classic Corporate Blue",
      desc: "Het vertrouwde originele PartVerify Pro blauw",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      bgPage: "#f8fafc",
      cardBg: "#ffffff",
      textColor: "#0f172a",
      font: "Inter",
      shape: "smooth",
      size: "standard"
    },
    {
      id: "royal-navy",
      name: "Royal Velvet Navy",
      desc: "Diep koninklijk blauw met rijke donkere details",
      primary: "#1e3a8a",
      primaryHover: "#172554",
      bgPage: "#f1f5f9",
      cardBg: "#ffffff",
      textColor: "#0f172a",
      font: "Outfit",
      shape: "smooth",
      size: "comfortable"
    },
    {
      id: "cyber-emerald",
      name: "Cyberpunk Emerald",
      desc: "Technisch diepgroen met futuristische accenten",
      primary: "#10b981",
      primaryHover: "#059669",
      bgPage: "#0f172a",
      cardBg: "#1e293b",
      textColor: "#f8fafc",
      font: "JetBrains Mono",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "amethyst-jewel",
      name: "Royal Amethyst Purple",
      desc: "Paars voor een vorstelijke uitstraling",
      primary: "#7c3aed",
      primaryHover: "#6d28d9",
      bgPage: "#faf5ff",
      cardBg: "#ffffff",
      textColor: "#1e1b4b",
      font: "Space Grotesk",
      shape: "pill",
      size: "standard"
    },
    {
      id: "modern-amber",
      name: "Titanium Amber",
      desc: "Verfijnd antraciet met vurig oker/amber gloed",
      primary: "#f59e0b",
      primaryHover: "#d97706",
      bgPage: "#18181b",
      cardBg: "#27272a",
      textColor: "#f4f4f5",
      font: "Plus Jakarta Sans",
      shape: "smooth",
      size: "standard"
    },
    {
      id: "crimson-exec",
      name: "Crimson Executive",
      desc: "Chique bordeauxrood met gestroomlijnde details",
      primary: "#be123c",
      primaryHover: "#9f1239",
      bgPage: "#fff1f2",
      cardBg: "#ffffff",
      textColor: "#4c0519",
      font: "Playfair Display",
      shape: "slightly-rounded",
      size: "comfortable"
    },
    {
      id: "forest-moss",
      name: "Eucalyptus Forest",
      desc: "Kalmerende bosrijke tinten en zachte contrasten",
      primary: "#047857",
      primaryHover: "#065f46",
      bgPage: "#f0fdf4",
      cardBg: "#ffffff",
      textColor: "#052e16",
      font: "DM Sans",
      shape: "smooth",
      size: "comfortable"
    },
    {
      id: "sunset-warmth",
      name: "Peach Sunset",
      desc: "Warme terracotta en zacht perzik-oranje tinten",
      primary: "#f97316",
      primaryHover: "#ea580c",
      bgPage: "#fff7ed",
      cardBg: "#ffffff",
      textColor: "#431407",
      font: "Lexend",
      shape: "pill",
      size: "standard"
    },
    {
      id: "ocean-breeze",
      name: "Vibrant Cyan Ocean",
      desc: "Kristalhelder aquablauw en frisse oceaanlucht",
      primary: "#06b6d4",
      primaryHover: "#0891b2",
      bgPage: "#ecfeff",
      cardBg: "#ffffff",
      textColor: "#083344",
      font: "Sora",
      shape: "smooth",
      size: "standard"
    },
    {
      id: "midnight-stealth",
      name: "Midnight Carbon",
      desc: "Matzwart met minimalistische neon details",
      primary: "#3b82f6",
      primaryHover: "#2563eb",
      bgPage: "#090d16",
      cardBg: "#111827",
      textColor: "#f3f4f6",
      font: "Space Grotesk",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "swiss-minimal",
      name: "Swiss Minimalist",
      desc: "Strikte typografie, pure grijstinten en wit",
      primary: "#000000",
      primaryHover: "#171717",
      bgPage: "#fafafa",
      cardBg: "#ffffff",
      textColor: "#171717",
      font: "Inter",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "gold-executive",
      name: "Chrysler Gold & Black",
      desc: "Exclusief champagne goud en chique antraciet",
      primary: "#d4af37",
      primaryHover: "#aa8c2c",
      bgPage: "#0a0a0a",
      cardBg: "#161616",
      textColor: "#eae9e0",
      font: "Clash Display",
      shape: "slightly-rounded",
      size: "standard"
    },
    {
      id: "retro-phosphor",
      name: "Vintronic Green-Screen",
      desc: "Nostalgisch monotoom groen van oude beeldbuizen",
      primary: "#22c55e",
      primaryHover: "#16a34a",
      bgPage: "#050c05",
      cardBg: "#091509",
      textColor: "#4ade80",
      font: "Fira Code",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "coffee-cream",
      name: "Roast Coffee & Milk",
      desc: "Gezellige hazelnoot, mokka en romig wit",
      primary: "#78350f",
      primaryHover: "#451a03",
      bgPage: "#fdf8f5",
      cardBg: "#ffffff",
      textColor: "#451a03",
      font: "Quicksand",
      shape: "smooth",
      size: "standard"
    },
    {
      id: "lavender-romance",
      name: "Lavender Mist",
      desc: "Zachte dromerige lavendel tinten en parelwit",
      primary: "#8b5cf6",
      primaryHover: "#7c3aed",
      bgPage: "#f5f3ff",
      cardBg: "#ffffff",
      textColor: "#311042",
      font: "Nunito",
      shape: "pill",
      size: "comfortable"
    },
    {
      id: "baby-pastels",
      name: "Sweet Sherbet Pastels",
      desc: "Zachte snoepkleurtjes, vriendelijk en speels",
      primary: "#ec4899",
      primaryHover: "#db2777",
      bgPage: "#fff5f7",
      cardBg: "#ffffff",
      textColor: "#4d0016",
      font: "Quicksand",
      shape: "pill",
      size: "standard"
    },
    {
      id: "warm-terracotta",
      name: "Sahara Clay",
      desc: "Elegante terracotta, okergoud en beige zand",
      primary: "#c2410c",
      primaryHover: "#9a3412",
      bgPage: "#faf6f0",
      cardBg: "#ffffff",
      textColor: "#431407",
      font: "Lexend",
      shape: "slightly-rounded",
      size: "comfortable"
    },
    {
      id: "nordic-winter",
      name: "Nordic Alpine Frost",
      desc: "Gletsjer mint, koud ijsblauw en zilvergrijs",
      primary: "#0ea5e9",
      primaryHover: "#0284c7",
      bgPage: "#f0f9ff",
      cardBg: "#ffffff",
      textColor: "#0c4a6e",
      font: "Plus Jakarta Sans",
      shape: "smooth",
      size: "comfortable"
    },
    {
      id: "imperial-purple",
      name: "Byzantine Dynasty",
      desc: "Diep koninklijk bordeaux paars en goud details",
      primary: "#581c87",
      primaryHover: "#3b0764",
      bgPage: "#faf5ff",
      cardBg: "#ffffff",
      textColor: "#2e0854",
      font: "Playfair Display",
      shape: "slightly-rounded",
      size: "standard"
    },
    {
      id: "cyberpunk-carbon",
      name: "Carbon Toxic Yellow",
      desc: "Elektrisch giftig geel op zwaar industrieel antraciet",
      primary: "#facc15",
      primaryHover: "#eab308",
      bgPage: "#121319",
      cardBg: "#171923",
      textColor: "#f7f9fa",
      font: "Sora",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "terminal-nerd",
      name: "1337 Green Hacker Terminal 🖥️",
      desc: "Diep gitzwart met felle neon-groene phosphor letters, perfect voor echte nerds",
      primary: "#00ff66",
      primaryHover: "#00cc52",
      bgPage: "#020402",
      cardBg: "#050a05",
      textColor: "#3bf577",
      font: "JetBrains Mono",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "dracula-dark",
      name: "Dracula Developer Core 🧛",
      desc: "De legendarische donkere modus favoriet van developers wereldwijd",
      primary: "#ff79c6",
      primaryHover: "#bd93f9",
      bgPage: "#282a36",
      cardBg: "#20222b",
      textColor: "#f8f8f2",
      font: "JetBrains Mono",
      shape: "slightly-rounded",
      size: "standard"
    },
    {
      id: "cyber-neon-sunset",
      name: "Synthwave Sunset Boulevard 🌅",
      desc: "Elektriserend hot-pink, neon violet en gloeiende oranje contrasten",
      primary: "#ff007f",
      primaryHover: "#d9006c",
      bgPage: "#120822",
      cardBg: "#1f0f3d",
      textColor: "#f3e8ff",
      font: "Sora",
      shape: "smooth",
      size: "comfortable"
    },
    {
      id: "hotdog-stand",
      name: "1990 Hot Dog Stand 🌭",
      desc: "Schreeuwende hardcore rood/geel retro nostalgie (waarschuwing: oogverblindend!)",
      primary: "#ff0000",
      primaryHover: "#cc0000",
      bgPage: "#ffff00",
      cardBg: "#ffffff",
      textColor: "#ff0000",
      font: "Space Grotesk",
      shape: "sharp",
      size: "standard"
    },
    {
      id: "msdos-prompt",
      name: "MS-DOS Command Prompt 💾",
      desc: "Monochroom amber-oranje letters op absolute commandline-duisternis",
      primary: "#ffb000",
      primaryHover: "#cbd5e1",
      bgPage: "#0a0a0a",
      cardBg: "#121212",
      textColor: "#ffb000",
      font: "JetBrains Mono",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "commodore-64",
      name: "Commodore 64 Classic 🕹️",
      desc: "Nostalgisch blauw-op-blauw met retro-computerkantoor uitstraling",
      primary: "#3a86ff",
      primaryHover: "#2a6fdf",
      bgPage: "#101030",
      cardBg: "#1a1a50",
      textColor: "#83c5be",
      font: "JetBrains Mono",
      shape: "sharp",
      size: "standard"
    },
    {
      id: "gameboy-classic",
      name: "GameBoy Pocket 1989 👾",
      desc: "Compleet monochroom retro LCD scherm in groenachtige tinten",
      primary: "#306230",
      primaryHover: "#0f380f",
      bgPage: "#9bbc0f",
      cardBg: "#8bac0f",
      textColor: "#0f380f",
      font: "JetBrains Mono",
      shape: "sharp",
      size: "compact"
    },
    {
      id: "monokai-pro",
      name: "Professional Monokai Soda 🎨",
      desc: "Zacht okergeel, neon roze en turkooise accenten op warm antraciet",
      primary: "#f1c40f",
      primaryHover: "#f39c12",
      bgPage: "#272822",
      cardBg: "#1e1f1c",
      textColor: "#f8f8f2",
      font: "JetBrains Mono",
      shape: "smooth",
      size: "standard"
    },
    {
      id: "steampunk-brass",
      name: "Victoriana Steampunk Brass ⚙️",
      desc: "Warm geöxideerd messingsgoud, ouderwets koper en perkament papier",
      primary: "#b45309",
      primaryHover: "#92400e",
      bgPage: "#fbf2e9",
      cardBg: "#e7d4be",
      textColor: "#451a03",
      font: "Georgia",
      shape: "slightly-rounded",
      size: "comfortable"
    },
    {
      id: "macos-1984",
      name: "System 1.0 Cupertino 1984 🍏",
      desc: "Vlakke retro grijstinten, dambordvullingen, vintage Macintosh gevoel",
      primary: "#1c1c1c",
      primaryHover: "#000000",
      bgPage: "#f4f4eb",
      cardBg: "#ffffff",
      textColor: "#1c1c1c",
      font: "Inter",
      shape: "sharp",
      size: "compact"
    }
  ], []);

  const dynamicCss = useMemo(() => {
    const selectedTheme = PRESET_THEMES.find(t => t.id === layoutStyle) || PRESET_THEMES[0];
    
    let radius = "16px";
    if (layoutShape === "sharp") radius = "0px";
    else if (layoutShape === "slightly-rounded") radius = "6px";
    else if (layoutShape === "smooth") radius = "16px";
    else if (layoutShape === "pill") radius = "28px";
    
    let textScale = "1";
    let paddingScale = "1";
    if (layoutSize === "compact") {
      textScale = "0.9";
      paddingScale = "0.8";
    } else if (layoutSize === "comfortable") {
      textScale = "1.08";
      paddingScale = "1.12";
    } else if (layoutSize === "prominent") {
      textScale = "1.18";
      paddingScale = "1.25";
    }

    const { primary, primaryHover, bgPage, cardBg, textColor } = selectedTheme;
    const isDark = bgPage === "#0f172a" || bgPage === "#18181b" || bgPage === "#090d16" || bgPage === "#0a0a0a" || bgPage === "#050c05" || bgPage === "#121319" || bgPage === "#171923" || bgPage === "#0a0b0e";

    let shadowCss = "";
    if (cardShadow === "flat") {
      shadowCss = `
        .shadow-sm, .shadow-xl, .shadow-2xl, .shadow-lg, .shadow-md, .shadow-inner, .shadow-amber-100 {
          box-shadow: none !important;
          border: 1px solid rgba(148, 163, 184, 0.2) !important;
        }
      `;
    } else if (cardShadow === "soft") {
      shadowCss = `
        .shadow-sm, .shadow-xl, .shadow-2xl, .shadow-lg, .shadow-md {
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05) !important;
        }
      `;
    } else if (cardShadow === "deep") {
      shadowCss = `
        .shadow-sm, .shadow-xl, .shadow-2xl, .shadow-lg, .shadow-md {
          box-shadow: 0 20px 40px -4px rgba(15, 23, 42, 0.12), 0 4px 14px -2px rgba(15, 23, 42, 0.04) !important;
        }
      `;
    } else if (cardShadow === "glow") {
      shadowCss = `
        .shadow-sm, .shadow-xl, .shadow-2xl, .shadow-lg, .shadow-md {
          box-shadow: 0 0 22px 2px ${primary}25 !important;
          border: 1.5px solid ${primary}35 !important;
        }
      `;
    }

    let patternCss = "";
    if (bgPattern === "dots") {
      patternCss = `
        .bg-slate-50, body {
          background-color: ${bgPage} !important;
          background-image: radial-gradient(#94a3b830 1.2px, transparent 1.2px) !important;
          background-size: 18px 18px !important;
        }
      `;
    } else if (bgPattern === "grid") {
      patternCss = `
        .bg-slate-50, body {
          background-color: ${bgPage} !important;
          background-image: linear-gradient(#94a3b80d 1px, transparent 1px), linear-gradient(90deg, #94a3b80d 1px, transparent 1px) !important;
          background-size: 24px 24px !important;
        }
      `;
    } else if (bgPattern === "abstract") {
      patternCss = `
        .bg-slate-50, body {
          background-color: ${bgPage} !important;
          background-image: radial-gradient(circle at 10% 20%, ${primary}0c 0%, transparent 40%), radial-gradient(circle at 90% 80%, ${primary}06 0%, transparent 50%) !important;
          background-attachment: fixed !important;
        }
      `;
    }

    let btnCss = "";
    if (buttonStyle === "soft") {
      btnCss = `
        .bg-blue-600, .bg-blue-550, .bg-blue-500, .bg-slate-900, .bg-emerald-600 {
          background-color: ${primary}13 !important;
          color: ${primary} !important;
          border: 1.5px solid ${primary}30 !important;
          text-shadow: none !important;
        }
        .bg-slate-900 {
          background-color: rgba(71, 85, 105, 0.12) !important;
          color: #475569 !important;
          border: 1.5px solid rgba(71, 85, 105, 0.2) !important;
        }
        .bg-amber-600 {
          background-color: rgba(217, 119, 6, 0.13) !important;
          color: #d97706 !important;
          border: 1.5px solid rgba(217, 119, 6, 0.25) !important;
        }
        .bg-amber-600:hover {
          background-color: rgba(217, 119, 6, 0.22) !important;
        }
        .hover\\:bg-blue-700:hover, .hover\\:bg-blue-550:hover, .hover\\:bg-blue-500:hover, .hover\\:bg-blue-800:hover, .hover\\:bg-slate-800:hover, .hover\\:bg-emerald-700:hover {
          background-color: ${primary}22 !important;
          color: ${primary} !important;
        }
      `;
    } else if (buttonStyle === "outlined") {
      btnCss = `
        .bg-blue-600, .bg-blue-550, .bg-blue-500, .bg-slate-900, .bg-emerald-600 {
          background-color: transparent !important;
          color: ${primary} !important;
          border: 2px solid ${primary} !important;
        }
        .bg-slate-900 {
          border: 2px solid #475569 !important;
          color: #475569 !important;
        }
        .bg-amber-600 {
          border: 2px solid #d97706 !important;
          color: #d97706 !important;
          background-color: transparent !important;
        }
        .bg-amber-600:hover {
          background-color: rgba(217, 119, 6, 0.1) !important;
        }
        .hover\\:bg-blue-700:hover, .hover\\:bg-blue-550:hover, .hover\\:bg-blue-500:hover, .hover\\:bg-blue-800:hover, .hover\\:bg-slate-800:hover, .hover\\:bg-emerald-700:hover {
          background-color: ${primary}10 !important;
          color: ${primary} !important;
        }
      `;
    } else if (buttonStyle === "vintage") {
      btnCss = `
        .bg-blue-600, .bg-blue-550, .bg-blue-500, .bg-slate-900, .bg-amber-600, .bg-emerald-600 {
          background-color: ${primary} !important;
          color: ${isDark ? '#000000' : '#ffffff'} !important;
          border: 2px solid #0f172a !important;
          box-shadow: 3px 3px 0px 0px #0f172a !important;
          transform: translate(0px, 0px);
        }
        .bg-slate-900 {
          background-color: #0f172a !important;
          color: #ffffff !important;
        }
        .bg-amber-600 {
          background-color: #d97706 !important;
        }
        .bg-blue-600:hover, .bg-blue-550:hover, .bg-blue-500:hover, .bg-slate-900:hover, .bg-amber-600:hover, .bg-emerald-600:hover {
          transform: translate(-1.5px, -1.5px) !important;
          box-shadow: 4.5px 4.5px 0px 0px #0f172a !important;
        }
      `;
    }

    let inputCss = "";
    if (inputFlatStyle === "underline") {
      inputCss = `
        input, textarea, select {
          border-top: none !important;
          border-left: none !important;
          border-right: none !important;
          border-bottom: 2px solid #cbd5e1 !important;
          border-radius: 0px !important;
          padding-left: 6px !important;
          background-color: transparent !important;
        }
        input:focus, textarea:focus, select:focus {
          border-bottom-color: ${primary} !important;
          box-shadow: none !important;
        }
      `;
    } else if (inputFlatStyle === "bordered") {
      inputCss = `
        input, textarea, select {
          border: 2px solid #0f172a !important;
          border-radius: 4px !important;
        }
      `;
    }

    let headerCss = "";
    if (headerStyle === "floating") {
      headerCss = `
        header {
          margin: 18px auto !important;
          max-width: 95% !important;
          border-radius: 20px !important;
          box-shadow: 0 10px 25px -4px rgba(0,0,0,0.06) !important;
          border: 1px solid rgba(148,163,184,0.18) !important;
        }
      `;
    } else if (headerStyle === "hybrid") {
      headerCss = `
        header {
          background-color: rgba(255, 255, 255, 0.8) !important;
          backdrop-filter: blur(14px) !important;
          border-bottom: 1px solid rgba(148,163,184,0.15) !important;
        }
      `;
    }

    return `
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;900&family=Outfit:wght@400;500;700;900&family=Plus+Jakarta+Sans:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lexend:wght@400;600;700;900&family=Sora:wght@400;600;800&family=Clash+Display:wght@400;600;700&family=Quicksand:wght@400;600;700&family=Inter:wght@400;500;700;900&family=Nunito:wght@400;600;800&display=swap');

      :root {
        --selected-primary: ${primary};
        --selected-primary-hover: ${primaryHover};
        --selected-bg-page: ${bgPage};
        --selected-card-bg: ${cardBg};
        --selected-text: ${textColor};
        --font-scale: ${parseFloat(textScale) * fontSizeScale};
        --pad-scale: ${paddingScale};
        --radius: ${radius};
      }

      body, button, input, textarea, select, h1, h2, h3, h4, h5, h6, div, span, p, label, table, th, td {
        font-family: "${layoutFont}", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }

      .bg-slate-50 {
        background-color: ${bgPage} !important;
      }
      .bg-white {
        background-color: ${cardBg} !important;
      }

      ${isDark ? `
        .text-slate-900, .text-slate-800, .text-slate-700, .text-slate-950, .text-gray-900, .text-slate-600 {
          color: ${textColor} !important;
        }
        .text-slate-500, .text-slate-400, .text-gray-500, .text-slate-450 {
          color: #94a3b8 !important;
        }
        .border-slate-200, .border-slate-100, .border-gray-200 {
          border-color: #334155 !important;
        }
        .bg-slate-100, .bg-slate-50, .bg-slate-50\\/50, .bg-gray-50 {
          background-color: #1e293b !important;
        }
        .bg-slate-50\\/40, .bg-slate-50\\/10 {
          background-color: rgba(30, 41, 59, 0.4) !important;
        }
        .bg-slate-200 {
          background-color: #475569 !important;
        }
        input, textarea, select {
          background-color: #1e293b !important;
          color: #f8fafc !important;
          border-color: #475569 !important;
        }
        header.bg-white {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        header .text-slate-500 {
          color: #94a3b8 !important;
        }
        .shadow-sm {
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.3) !important;
        }
        .text-slate-705 {
          color: ${textColor} !important;
        }
      ` : ''}

      /* Extreme overrides for realistic Dutch yellow license plates under any theme */
      .dutch-plate-container, [class*="dutch-plate-container"] {
        background-color: #FFDE00 !important;
        background-image: none !important;
        color: #0f172a !important;
        border-color: #0f172a !important;
      }
      .dutch-plate-container *:not(.dutch-plate-eu):not(.dutch-plate-eu *) {
        background-color: #FFDE00 !important;
        background-image: none !important;
        color: #0f172a !important;
        border-color: #0f172a !important;
      }
      /* Keep the blue EU banner genuine */
      .dutch-plate-eu, .dutch-plate-container .dutch-plate-eu, [class*="dutch-plate-container"] .dutch-plate-eu {
        background-color: #0039AE !important;
        color: #ffffff !important;
        border-color: rgba(15, 23, 42, 0.15) !important;
      }
      .dutch-plate-eu *, .dutch-plate-container .dutch-plate-eu *, [class*="dutch-plate-container"] .dutch-plate-eu * {
        background-color: transparent !important;
        color: #ffffff !important;
      }
      /* Keep EU stars yellow */
      .dutch-plate-stars, .dutch-plate-container .dutch-plate-stars {
        color: #FFDE00 !important;
      }
      input.dutch-plate-input, .dutch-plate-container input, .dutch-plate-input {
        color: #0f172a !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      .dutch-plate-container input::placeholder, .dutch-plate-input::placeholder {
        color: rgba(15, 23, 42, 0.3) !important;
      }

      .bg-blue-600, .bg-blue-500 {
        background-color: ${primary} !important;
      }
      .hover\\:bg-blue-700:hover, .hover\\:bg-blue-550:hover, .hover\\:bg-blue-500:hover, .hover\\:bg-blue-800:hover, .hover\\:bg-blue-900:hover, .hover\\:bg-slate-800:hover {
        background-color: ${primaryHover} !important;
      }
      .text-blue-600, .text-blue-500 {
        color: ${primary} !important;
      }
      .border-blue-600 {
        border-color: ${primary} !important;
      }
      .border-blue-100 {
        border-color: ${primary}15 !important;
      }
      .bg-blue-50 {
        background-color: ${primary}10 !important;
      }
      .text-blue-800 {
        color: ${primary} !important;
      }

      .rounded-3xl {
        border-radius: var(--radius) !important;
      }
      .rounded-2xl {
        border-radius: calc(var(--radius) * 0.75) !important;
      }
      .rounded-xl {
        border-radius: calc(var(--radius) * 0.5) !important;
      }
      .rounded-lg {
        border-radius: calc(var(--radius) * 0.35) !important;
      }
      .rounded-md {
        border-radius: calc(var(--radius) * 0.25) !important;
      }
      .rounded-full {
        border-radius: 9999px !important;
      }

      .text-xs { font-size: calc(12px * var(--font-scale)) !important; }
      .text-sm { font-size: calc(14px * var(--font-scale)) !important; }
      .text-base { font-size: calc(16px * var(--font-scale)) !important; }
      .text-lg { font-size: calc(18px * var(--font-scale)) !important; }
      .text-xl { font-size: calc(20px * var(--font-scale)) !important; }
      .text-2xl { font-size: calc(24px * var(--font-scale)) !important; }
      .text-3xl { font-size: calc(30px * var(--font-scale)) !important; }

      .p-6 { padding: calc(24px * var(--pad-scale)) !important; }
      .p-5 { padding: calc(20px * var(--pad-scale)) !important; }
      .p-4 { padding: calc(16px * var(--pad-scale)) !important; }
      .p-3 { padding: calc(12px * var(--pad-scale)) !important; }
      .p-2 { padding: calc(8px * var(--pad-scale)) !important; }
      .p-8 { padding: calc(32px * var(--pad-scale)) !important; }

      .transition-all {
        transition-duration: 200ms !important;
      }

      ${shadowCss}
      ${patternCss}
      ${btnCss}
      ${inputCss}
      ${headerCss}

      ${crtEffect ? `
        body::before {
          content: " ";
          display: block;
          position: fixed;
          top: 0; left: 0; bottom: 0; right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.22) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.05), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.05));
          z-index: 999999;
          background-size: 100% 3px, 3px 100%;
          pointer-events: none;
        }
        body {
          animation: crt-flicker 0.15s infinite;
          text-shadow: 0 0 3px currentColor !important;
        }
        @keyframes crt-flicker {
          0% { opacity: 0.99; }
          50% { opacity: 0.995; }
          100% { opacity: 0.99; }
        }
        .bg-slate-50 {
          filter: contrast(1.08) brightness(1.02);
        }
      ` : ''}

      ${glowText ? `
        h1, h2, h3, h4, .font-black, .font-bold {
          text-shadow: 0 0 10px ${primary}50, 0 0 20px ${primary}20 !important;
        }
      ` : ''}
    `;
  }, [layoutShape, layoutFont, layoutSize, layoutStyle, cardShadow, bgPattern, buttonStyle, inputFlatStyle, headerStyle, crtEffect, glowText, fontSizeScale, PRESET_THEMES]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

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
  const [dimUnchanged, setDimUnchanged] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'approved' | 'deviation' | 'missing'>('all');

  // OPTION 2: Dossier Geschiedenis & Toasts
  const [savedDossiers, setSavedDossiers] = useState<any[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lastExtractedText, setLastExtractedText] = useState("");
  const [isBackdoorOpen, setIsBackdoorOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isAudatexCodesOpen, setIsAudatexCodesOpen] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);

  // Set session persistence so closing tab / browser logs out user
  useEffect(() => {
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error("Error setting session persistence:", err);
    });
  }, []);

  // Secure photo analysis tab tab-switching safety check limit to admin only
  useEffect(() => {
    if (userProfile && userProfile.role !== "admin" && (dashboardTab === "photo_analysis" || dashboardTab === "training_center")) {
      setDashboardTab("verification");
    }
  }, [userProfile, dashboardTab]);

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

  // Listen for Enter key to dismiss toast Msg notification popups (such as calculation cleaned)
  useEffect(() => {
    if (!toastMsg) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setToastMsg(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toastMsg]);

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
    } else if (cleanPartsLines.length === 0) {
      updates.push("❌ Let op: Geen onderdelen gevonden in deze calculatie!");
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

    const targetCaseNumber = caseNumber || "Onbekend";
    const targetLicensePlate = licensePlate || "Onbekend";

    const existing = savedDossiers.find(d => 
      d.caseNumber === targetCaseNumber && d.licensePlate === targetLicensePlate
    );

    if (existing) {
      const confirmOverwrite = window.confirm(
        `Er bestaat al een dossier met kenteken "${targetLicensePlate}" en dossiernummer "${targetCaseNumber}". Wilt u het bestaande dossier overschrijven met de huidige gegevens?`
      );
      if (!confirmOverwrite) {
        return;
      }
    }

    const clientName = clients.find(c => c.id === selectedClientId)?.name || "Standaard";
    const newDossier = {
      id: `DOS-${Date.now()}`,
      caseNumber: targetCaseNumber,
      licensePlate: targetLicensePlate,
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
      !(d.caseNumber === targetCaseNumber && d.licensePlate === targetLicensePlate)
    )].slice(0, 10);

    localStorage.setItem("partverify_dossiers", JSON.stringify(updated));
    setSavedDossiers(updated);
    setToastMsg("Dossier succesvol opgeslagen!");
    setTimeout(() => setToastMsg(null), 3000);
  };

  const playCyberBeep = (freq = 800, duration = 0.08, type = "sine") => {
    if (!audioFeedback) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type as OscillatorType;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (err) {
      // Ignore audio block error
    }
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
    let activeId = selectedClientId;
    
    // Auto-detect or match if client name is saved instead of ID
    if (activeId && clients.length > 0) {
      const found = clients.find(c => c.id === activeId || c.name?.toLowerCase() === activeId.toLowerCase());
      if (found) {
        activeId = found.id;
        if (selectedClientId !== found.id) {
          setSelectedClientId(found.id);
        }
      }
    }

    if (activeId) {
      const loadPrices = async () => {
        try {
          const snapshot = await getDocs(collection(db, "clients", activeId, "prices"));
          const prices: any[] = [];
          snapshot.docs.forEach(d => {
            const data = d.data();
            prices.push({
              id: d.id,
              partNumber: data.partNumber || "",
              description: data.description || "",
              price: Number(data.price) || 0
            });
          });
          setClientPrices(prices);
        } catch (err) {
          handleFirestoreError(err, 'get', `clients/${activeId}/prices`);
        }
      };
      loadPrices();
    } else {
      setClientPrices([]);
    }
  }, [selectedClientId, clients]);

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
    const matchedInvoiceIds = new Set<string>();

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

      const calcLower = calcPart.description.toLowerCase();
      const calcPartNoClean = calcPart.partNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      const calcDigits = calcPart.partNumber.replace(/[^0-9]/g, "");

      const matchingClientPriceItems = Array.isArray(clientPrices) ? clientPrices.filter(p => {
        const pNumClean = (p.partNumber || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
        const pDescLower = (p.description || "").toLowerCase();
        const pDigits = (p.partNumber || "").replace(/[^0-9]/g, "");

        // Rule 1: Clean part number exact match or substring match (helps match "0707070707" with "0707070707 V")
        if (pNumClean && calcPartNoClean) {
          if (pNumClean === calcPartNoClean || pNumClean.includes(calcPartNoClean) || calcPartNoClean.includes(pNumClean)) {
            return true;
          }
        }

        // Rule 2: Digits match if they are at least 5 digits (such as standard "0707070707" for license plates)
        if (pDigits.length >= 5 && calcDigits.length >= 5) {
          if (pDigits === calcDigits || pDigits.includes(calcDigits) || calcDigits.includes(pDigits)) {
            return true;
          }
        }

        // Rule 3: Semantic description match
        if (pDescLower && (
          descriptionsMatch(calcPart.description, p.description) ||
          calcLower.includes(pDescLower) ||
          pDescLower.includes(calcLower)
        )) {
          return true;
        }

        // Rule 4: Broad check for standard license plates (kentekens / nummerplaten)
        const isCalcKenteken = calcLower.includes("kenteken") || calcLower.includes("license plate") || calcLower.includes("nummerplaat") || calcPartNoClean.includes("KENTEKEN") || calcPartNoClean.startsWith("0707070707");
        const isClientKenteken = pDescLower.includes("kenteken") || pDescLower.includes("license plate") || pDescLower.includes("nummerplaat") || pNumClean.includes("KENTEKEN") || pNumClean.includes("0707070707");
        
        if (isCalcKenteken && isClientKenteken) {
          return true;
        }

        // Rule 5: Match if client part number is a keyword in calculation description
        if (pNumClean && pNumClean.length >= 4 && calcLower.includes(pNumClean.toLowerCase())) {
          return true;
        }

        return false;
      }) : [];

      const matchingClientPriceItem = matchingClientPriceItems.find(p => Math.abs((Number(p.price) || 0) - calcPart.price) < 0.005) 
         || matchingClientPriceItems[0];

      const matchesClientPrice = matchingClientPriceItem && Math.abs((Number(matchingClientPriceItem.price) || 0) - calcPart.price) < 0.005 ? true : false;
      const matchingPriceClient = matchingClientPriceItem?.price;

      const registeredClient = clients.find(c => c.id === selectedClientId || c.name?.toLowerCase() === selectedClientId?.toLowerCase());
      const virtualClientMatch = matchingPriceClient !== undefined ? {
        id: `CLIENT-${calcPart.id}`,
        description: `Prijslijst: ${registeredClient?.name || 'Opdrachtgever'}`,
        partNumber: calcPart.partNumber,
        price: matchingPriceClient
      } : null;

      const finalMatch = match || semanticMatch || virtualClientMatch;

      // Track matched invoice parts
      const realMatch = match || semanticMatch;
      if (realMatch && realMatch.id) {
        matchedInvoiceIds.add(realMatch.id);
      }

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

    const combinedResults = allResults;

    // Custom sorting: OK -> Deviation -> Missing -> Approved (Manual) -> Removed
    const statusOrder = {
      'matched': 0,
      'deviation': 1,
      'missing': 2,
      'approved': 3,
      'removed': 4
    };

    return combinedResults.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [calculationParts, manualParts, removedPartIds, invoiceParts, manualOverrides, clientPrices, selectedClientId, clients]);

  const stats = useMemo(() => {
    const matched = results.filter(r => r.status === 'matched').length;
    const deviations = results.filter(r => r.status === 'deviation').length;
    const missing = results.filter(r => r.status === 'missing').length;
    const approved = results.filter(r => r.status === 'approved').length;
    const totalPriceDiff = results
      .filter(r => r.status !== 'removed')
      .reduce((acc, r) => acc + r.priceDiff, 0);
    
    // Sum of all "good" prices: manual overrides OR invoice matches
    const totalVerifiedAmount = results
      .filter(r => r.status !== 'removed' && r.status !== 'missing')
      .reduce((acc, r) => acc + (r.manualPrice ?? r.match?.price ?? 0), 0);

    return { matched, deviations, missing, approved, totalPriceDiff, totalVerifiedAmount };
  }, [results]);

  const calibrationData = useMemo(() => {
    return detectCalibrationAndAlignment(calcInput);
  }, [calcInput]);

  const detectedAudatexCodes = useMemo(() => {
    return scanAudatexCodes(calcInput);
  }, [calcInput]);

  const filteredResults = useMemo(() => {
    let base = results;
    if (!showRemoved) {
      base = base.filter(r => r.status !== 'removed');
    }
    if (statusFilter !== 'all') {
      base = base.filter(r => r.status === statusFilter);
    }
    
    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(r => 
      r.calc.description.toLowerCase().includes(q) || 
      r.calc.partNumber.toLowerCase().includes(q) ||
      r.calc.id.includes(q) ||
      (r.match?.description.toLowerCase().includes(q))
    );
  }, [results, searchQuery, showRemoved, statusFilter]);

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
    setStatusFilter('all');
    setReadoutPre(false);
    setReadoutPost(false);
    setAlignmentStatus('none');
    setCalibrationStatus('none');
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

    // Convert active theme hex color to rgb
    const hexToRgb = (hexStr: string) => {
      const match = hexStr.replace('#', '').match(/.{1,2}/g);
      if (!match) return { r: 37, g: 99, b: 235 };
      return {
        r: parseInt(match[0], 16),
        g: parseInt(match[1], 16),
        b: parseInt(match[2], 16)
      };
    };
    
    const activeThemeConfig = PRESET_THEMES.find(t => t.id === layoutStyle) || PRESET_THEMES[0];
    let brandRgb = hexToRgb(activeThemeConfig.primary);

    if (pdfTheme === "classic-navy") {
      brandRgb = { r: 15, g: 23, b: 42 };
    } else if (pdfTheme === "monochrome") {
      brandRgb = { r: 71, g: 85, b: 105 };
    }

    const isPrinterFriendly = pdfTheme === "printer-friendly";

    // Draw Elegant Top Header Banner (Styled dynamically matching app layout!)
    if (isPrinterFriendly) {
      doc.setFillColor(250, 250, 250);
      doc.rect(0, 0, 210, 32, "F");
      doc.setDrawColor(226, 232, 240);
      doc.line(0, 32, 210, 32);
    } else {
      doc.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
      doc.rect(0, 0, 210, 32, "F");
    }

    // Corporate Title & Subtitle inside details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    if (isPrinterFriendly) {
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setTextColor(255, 255, 255);
    }
    doc.text("PartVerify Pro", 14, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (isPrinterFriendly) {
      doc.setTextColor(71, 85, 105);
    } else {
      doc.setTextColor(203, 213, 225);
    }
    doc.text("Eindcalculatie & Inkoopfactuur Verificatieverslag", 14, 25);

    // Right details inside banner
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    if (isPrinterFriendly) {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(251, 191, 36);
    }
    doc.text("Developed by Danny Radjkoemar", 130, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Uitvoerdraad: ${dateStr} ${timeStr}`, 130, 19);
    
    const activeClient = clients.find(c => c.id === selectedClientId || c.name?.toLowerCase() === selectedClientId?.toLowerCase());
    const clientNameText = activeClient ? activeClient.name : "Standaard";
    doc.text(`Opdrachtgever: ${clientNameText}`, 130, 24);

    // Let's draw side-by-side rounded panels for Voertuig & Audit Samenvatting
    const boxY = 38;
    const boxHeight = 52;
    const boxWidth = 88;

    // Card 1: Voertuig- & Dossiergegevens
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(14, boxY, boxWidth, boxHeight, 3, 3, "FD");

    // Card 2: Audit Samenvatting
    doc.roundedRect(108, boxY, boxWidth, boxHeight, 3, 3, "FD");

    // Left Card Text (Voertuig- & Dossiergegevens)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // Slate-700
    doc.text("VOERTUIG- & DOSSIERGEGEVENS", 19, boxY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    
    let leftY = boxY + 13;
    const itemSpacing = 5.2;

    const printMetaLine = (label: string, val: string, x: number, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105); // Slate-600
      doc.text(label + ":", x, y);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text(val, x + 24, y);
    };

    printMetaLine("Kenteken", licensePlate ? licensePlate.toUpperCase() : "Onbekend", 19, leftY);
    leftY += itemSpacing;
    printMetaLine("DossierNr", caseNumber || "Niet opgegeven", 19, leftY);
    leftY += itemSpacing;
    printMetaLine("ChassisNr", chassisNumber ? chassisNumber.toUpperCase() : "Onbekend", 19, leftY);
    leftY += itemSpacing;
    printMetaLine("KM-stand", kmStand ? parseInt(kmStand.replace(/\D/g, '')).toLocaleString('nl-NL') + " km" : "Onbekend", 19, leftY);
    leftY += itemSpacing;
    
    let vehicleDesc = "Onbekend";
    if (vehicleData) {
      const brand = vehicleData.merk || "";
      const model = vehicleData.handelsbenaming || "";
      vehicleDesc = `${capitalizeWords(brand)} ${capitalizeWords(model)}`.trim() || "Onbekend";
    }
    printMetaLine("Voertuig", vehicleDesc.length > 25 ? vehicleDesc.substring(0, 25) + "..." : vehicleDesc, 19, leftY);
    leftY += itemSpacing;

    let dagwaardeStr = "Onbekend";
    if (vehicleData) {
      const estValue = calculateEstimatedDagwaarde(vehicleData.catalogusprijs, vehicleData.datum_eerste_toelating, kmStand);
      if (estValue) dagwaardeStr = `EUR ${estValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    printMetaLine("Dagwaarde", dagwaardeStr, 19, leftY);

    // Right Card Text (Audit Samenvatting)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text("AUDIT RESULTAAT & TOTALEN", 113, boxY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);

    let rightY = boxY + 13;
    
    // Total Verified Amount (Theme highlights)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
    doc.text("Geverifieerd Totaal:", 113, rightY);
    doc.text(`EUR ${stats.totalVerifiedAmount.toFixed(2)}`, 147, rightY);
    rightY += itemSpacing;

    doc.setFont("helvetica", "normal");
    
    // Total Price Diff (Rose or Green)
    doc.setFont("helvetica", "bold");
    if (stats.totalPriceDiff > 0) {
      doc.setTextColor(225, 29, 72); // Rose-650
    } else if (stats.totalPriceDiff < 0) {
      doc.setTextColor(16, 185, 129); // Emerald-600
    } else {
      doc.setTextColor(71, 85, 105);
    }
    doc.text("Totaal Verschil:", 113, rightY);
    doc.text(`EUR ${stats.totalPriceDiff.toFixed(2)}`, 147, rightY);
    rightY += itemSpacing;

    // Normalizing spacing for summary counters
    const printStatusCounter = (label: string, count: number, color: [number, number, number], x: number, y: number) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(label + ":", x, y);
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(String(count), x + 25, y);
    };

    printStatusCounter("Match OK", stats.matched, [16, 185, 129], 113, rightY);
    rightY += itemSpacing;
    printStatusCounter("Handmatig OK", stats.approved, [245, 158, 11], 113, rightY);
    rightY += itemSpacing;
    printStatusCounter("Afwijkingen", stats.deviations, [225, 29, 72], 113, rightY);
    rightY += itemSpacing;
    printStatusCounter("Ontbrekend", stats.missing, [244, 63, 94], 113, rightY);

    // Slide in the Price Agreements line
    let agreementsY = 94;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252); // extremely soft slate
    doc.roundedRect(14, agreementsY, 182, 11, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42); // slate-900 (ultra high-contrast dark slate)
    doc.text("GEREGISTREERDE PRIJSAFPRAKEN OPDRACHTGEVER:", 18, agreementsY + 7.2);

    const prUitlezen = activeClient?.priceUitlezen;
    const unitUitlezen = activeClient?.unitUitlezen || "€";
    const prUitlijnen = activeClient?.priceUitlijnen;
    const prKoelvloeistof = activeClient?.priceKoelvloeistof;
    const prAntiroest = activeClient?.priceAntiroest;
    const prPortierfolie = activeClient?.pricePortierfolie;
    const prDempingsmatten = activeClient?.priceDempingsmatten;

    let agreementsParts = [];
    if (prUitlezen) agreementsParts.push(`OBD: ${unitUitlezen === "Ae" ? `${prUitlezen} Ae` : `€${Number(prUitlezen).toFixed(2)}`}`);
    if (prUitlijnen) agreementsParts.push(`Uitlijnen: €${Number(prUitlijnen).toFixed(2)}`);
    if (prKoelvloeistof) agreementsParts.push(`Koelvloeistof: €${Number(prKoelvloeistof).toFixed(2)}`);
    if (prAntiroest) agreementsParts.push(`Antiroest: €${Number(prAntiroest).toFixed(2)}`);
    if (prPortierfolie) agreementsParts.push(`Portierfolie: €${Number(prPortierfolie).toFixed(2)}`);
    if (prDempingsmatten) agreementsParts.push(`Dempingsmatten: €${Number(prDempingsmatten).toFixed(2)}`);
    if (agreementsParts.length === 0) agreementsParts.push("Geen vaste prijsafspraken geregistreerd");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFontSize(6.8); // Slightly smaller font to fit all possible 6 items
    doc.text(agreementsParts.join("   |   "), 93, agreementsY + 7.2);

    // Checklist diagnostics panel
    let diagnosticY = 109;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252); // extrêmement soft slate background
    doc.roundedRect(14, diagnosticY, 182, 11, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42); // slate-900 (ultra high-contrast dark slate)
    doc.text("DIAGNOSTISCHE EXTRAS & VERREKENINGEN:", 18, diagnosticY + 7.2);

    const checkListItems = [];
    if (readoutPre) checkListItems.push("Diagnose VOOR: OK");
    if (readoutPost) checkListItems.push("Diagnose NA: OK");
    if (alignmentStatus !== 'none') checkListItems.push(`Uitlijnen: ${alignmentStatus === 'intern' ? 'Interne post' : 'Externe post'}`);
    if (calibrationStatus !== 'none') checkListItems.push(`ADAS: ${calibrationStatus === 'intern' ? 'Interne post' : 'Externe post'}`);
    if (checkListItems.length === 0) checkListItems.push("Geen extra checklist-posten verwerkt");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105); // emerald-700 (premium deep emerald green for solid contrast)
    doc.text(checkListItems.join("  |  "), 93, diagnosticY + 7.2);

    // Reset general font settings
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");

    // Table
    const scannedCodes = scanAudatexCodes(calcInput);
    let tableStartY = 125;
    if (scannedCodes.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const codeStrList = scannedCodes.slice(0, 5).map(c => `${c.code}: ${c.description}`).join(', ');
      doc.text(`Gedetecteerde Audatex Codes: ${scannedCodes.length > 5 ? `${codeStrList}...` : codeStrList}`, 14, 125);
      tableStartY = 129;
    }

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
      startY: tableStartY,
      head: [['Status', 'Pos.', 'Onderdeel', 'Partnummer', 'Calc. Prijs', 'Factuur Prijs', 'Verschil']],
      body: tableData,
      headStyles: { 
        fillColor: [30, 41, 59], // Elegant Slate Navy
        textColor: 255, 
        fontSize: 8.5, 
        fontStyle: 'bold',
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 }
      },
      bodyStyles: { 
        fontSize: 7.5,
        textColor: [51, 65, 85], // Slate-700
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }
      },
      alternateRowStyles: { 
        fillColor: [248, 250, 252] // light Slate-50 alternating rows
      },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold' },
        1: { cellWidth: 12, halign: 'center' },
        2: { cellWidth: 46 },
        3: { cellWidth: 28 },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        const item = visibleInPdf[data.row.index];
        if (!item) return;

        if (data.section === 'body') {
          // Highlight rows with deviations nicely and softly
          if (item.status === 'deviation') {
            data.cell.styles.fillColor = [254, 244, 244]; // extremely soft ruby background
          } else if (item.status === 'missing') {
            data.cell.styles.fillColor = [255, 241, 242]; // soft reddish pink
          }

          // Column specific visual styles for high-fidelity text-colors
          if (data.column.index === 0) {
            // Status label cell styling
            if (item.status === 'matched') {
              data.cell.styles.textColor = [16, 185, 129]; // Emerald 600
            } else if (item.status === 'approved') {
              data.cell.styles.textColor = [217, 119, 6]; // Amber 600
            } else if (item.status === 'deviation') {
              data.cell.styles.textColor = [225, 29, 72]; // Rose 600
            } else if (item.status === 'missing') {
              data.cell.styles.textColor = [244, 63, 94]; // Rose 500
            } else if (item.status === 'removed') {
              data.cell.styles.textColor = [148, 163, 184]; // Slate 400
            }
          }

          // Position highlight for high priority items
          if (data.column.index === 1 && item.status === 'deviation') {
            data.cell.styles.textColor = [15, 23, 42]; // dark slate
            data.cell.styles.fontStyle = 'bold';
          }

          // Calc price striker column or colors
          if (data.column.index === 4 && item.status === 'deviation') {
            data.cell.styles.textColor = [100, 116, 139]; // Mute original price slightly
          }

          // Verified Invoice Price highlights
          if (data.column.index === 5) {
            if (item.status === 'deviation') {
              data.cell.styles.textColor = [16, 185, 129]; // Clean emerald highlight for approved overrides
              data.cell.styles.fillColor = [236, 253, 245]; // soft emerald background for verified price
            } else {
              const valText = data.cell.text[0] || "";
              const val = parseFloat(valText.replace('EUR ', '').replace('+', ''));
              if (val > 0) data.cell.styles.textColor = [16, 185, 129];
            }
          }

          // Difference price highlights
          if (data.column.index === 6) {
            if (item.priceDiff > 0) {
              data.cell.styles.textColor = [225, 29, 72]; // Higher cost matches warning rose
            } else if (item.priceDiff < 0) {
              data.cell.styles.textColor = [16, 185, 129]; // Savings green
            }
          }
        }
      },
      didDrawCell: (data) => {
        const item = visibleInPdf[data.row.index];
        if (!item) return;

        if (data.section === 'body') {
          // Line strike-through for calculation price to indicate it was overridden or changed
          if (data.column.index === 4 && item.status === 'deviation') {
            const tempDrawColor = doc.getDrawColor(); 
            const tempLineWidth = doc.getLineWidth();

            doc.setDrawColor(225, 29, 72); // elegant warning crimson line
            doc.setLineWidth(1.0);
            
            // Strike through the price cell elegantly
            const xLeft = data.cell.x + 3;
            const xRight = data.cell.x + data.cell.width - 3;
            const yCenter = data.cell.y + (data.cell.height / 2);
            doc.line(xLeft, yCenter, xRight, yCenter);

            doc.setDrawColor(tempDrawColor);
            doc.setLineWidth(tempLineWidth);
          }
        }
      }
    });

    // Footer with branded subtitle & page numbers
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // Slate-400
        
        // Brand string left side
        doc.text("PartVerify Pro  |  Developed by Danny Radjkoemar", 14, doc.internal.pageSize.height - 10);
        
        // Page num right side
        doc.text(`Pagina ${i} van ${pageCount}`, doc.internal.pageSize.width - 32, doc.internal.pageSize.height - 10);
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

  const renderDossierBar = () => {
    const isCalibMissing = calibrationData.needsCalibration && calibrationStatus === 'none';
    const isAlignMissing = calibrationData.needsAlignment && alignmentStatus === 'none';

    return (
      <div className="flex flex-col lg:flex-row gap-4 items-stretch mb-6 animate-fade-in">
        {/* Left Card: Inputs (Top) and ADAS Requirements alerts (Bottom) to fill the empty space */}
        <div className="flex-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between gap-5">
          {/* Inputs Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
            <div className="w-full">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Kenteken</label>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center bg-[#FFDE00] text-slate-900 font-mono font-black border-[3px] border-slate-900 rounded-2xl overflow-hidden shadow-sm h-14 flex-1 max-w-[280px] transition-all hover:shadow-md focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-slate-900 dutch-plate-container">
                  <div className="bg-[#0039AE] text-white text-[10px] w-8 h-full flex flex-col items-center justify-center leading-none select-none shrink-0 border-r-2 border-slate-900/15 border-slate-900 dutch-plate-eu">
                    <span className="text-[10px] text-[#FFDE00] font-sans leading-none mb-1 select-none dutch-plate-stars">★★</span>
                    <span className="text-[11px] font-sans font-black tracking-normal leading-none select-none">NL</span>
                  </div>
                  
                  <input 
                    type="text"
                    placeholder="AB-123-C"
                    maxLength={11}
                    className="w-full bg-transparent text-center text-lg md:text-xl font-black font-mono placeholder:text-slate-900/30 text-slate-900 focus:outline-none uppercase tracking-[0.08em] px-2 selection:bg-slate-900/20 dutch-plate-input"
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
                    className={`h-14 px-3.5 rounded-2xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0 select-none ${
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
                className="w-full h-14 bg-slate-50 border border-slate-100 px-4 rounded-2xl text-base font-black text-slate-800 focus:outline-none focus:bg-white focus:border-blue-400 transition-all placeholder:text-slate-300 shadow-sm"
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
                  className="w-full h-14 bg-slate-50 border border-slate-100 px-4 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-blue-400 transition-all appearance-none cursor-pointer pr-10 shadow-sm"
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

          {/* Real-time Calculation Difference Box */}
          {(() => {
            const activeResults = results.filter(r => r.status !== 'removed');
            const totalOriginalCalc = activeResults.reduce((acc, r) => acc + r.calc.price, 0);
            const totalInvoices = activeResults.reduce((acc, r) => acc + (r.manualPrice ?? r.match?.price ?? r.calc.price), 0);
            const realTimeDiff = totalInvoices - totalOriginalCalc;
            const hasData = activeResults.length > 0;

            if (!hasData) {
              return (
                <div className="bg-slate-50 border border-slate-100/80 rounded-2xl py-3 px-4 text-center text-xs font-semibold text-slate-400/80 tracking-wide select-none">
                  Voeg een voorcalculatie-tekst toe om de real-time prijsvergelijking te starten.
                </div>
              );
            }

            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-50/50 border border-slate-200/50 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center shadow-xs"
              >
                {/* original calc */}
                <div className="flex flex-col text-left">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                    Totaal Voorcalculatie
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-sm font-black text-slate-800">
                      € {totalOriginalCalc.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">({activeResults.length} {activeResults.length === 1 ? 'regel' : 'regels'})</span>
                  </div>
                </div>

                {/* matched invoices / overrides */}
                <div className="flex flex-col text-left border-t md:border-t-0 md:border-x border-slate-100 pt-3 md:pt-0 md:px-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                    Totaal Inkoop / Tarieven
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5 animate-pulse-slow">
                    <span className="text-sm font-black text-blue-600">
                      € {totalInvoices.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      ({activeResults.filter(r => r.match || r.manualPrice !== undefined).length} geverifieerd)
                    </span>
                  </div>
                </div>

                {/* live difference */}
                <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0">
                  <div className="text-left md:text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 block">
                      Financieel Verschil (Netto)
                    </span>
                    <span className={`text-base font-black tracking-tight ${
                      realTimeDiff < -0.005 
                        ? 'text-emerald-600' 
                        : realTimeDiff > 0.005 
                        ? 'text-rose-600 font-extrabold' 
                        : 'text-slate-500'
                    }`}>
                      {realTimeDiff < -0.005 ? '-' : realTimeDiff > 0.005 ? '+' : ''}€ {Math.abs(realTimeDiff).toFixed(2)}
                    </span>
                  </div>

                  <div className={`p-2 rounded-xl shrink-0 ${
                    realTimeDiff < -0.005 
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' 
                      : realTimeDiff > 0.005 
                      ? 'bg-rose-50 border border-rose-100 text-rose-600 animate-pulse' 
                      : 'bg-slate-100 border border-slate-200 text-slate-400'
                  }`}>
                    {realTimeDiff < -0.005 ? (
                      <CheckCircle2 size={16} />
                    ) : realTimeDiff > 0.005 ? (
                      <AlertCircle size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {/* ADAS/Alignment Alerts Section (Fills the former empty space perfectly below) */}
          <div className="border-t border-slate-100 pt-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Systeemvereisten (uit calculatie)
              </span>
              {(isCalibMissing || isAlignMissing) ? (
                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-rose-50 border border-rose-100 text-rose-600 animate-pulse">
                  ⚠️ Vereisten Ontbreken in checklist
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-emerald-50 border border-emerald-100 text-emerald-600">
                  ✓ Geen Ontbrekende ACTIES
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Calibration Banner */}
              <div className={`p-2.5 rounded-xl border transition-all flex items-start gap-2.5 min-h-[58px] ${
                isCalibMissing 
                  ? 'bg-rose-50/75 border-rose-200 text-rose-900 shadow-xs animate-pulse-slow' 
                  : calibrationData.needsCalibration
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                  : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-white shadow-xs border border-transparent">
                  {isCalibMissing ? (
                    <AlertCircle size={14} className="text-rose-650 animate-bounce" />
                  ) : calibrationData.needsCalibration ? (
                    <CheckSquare size={14} className="text-emerald-600" />
                  ) : (
                    <Info size={14} className="text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[10px] tracking-tight uppercase">ADAS KALIBRATIE</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none ${
                       isCalibMissing 
                        ? 'bg-rose-200/50 text-rose-700 font-black' 
                        : calibrationData.needsCalibration
                        ? 'bg-emerald-100/50 text-emerald-800 animate-fade-in'
                        : 'bg-slate-200 text-slate-550'
                    }`}>
                      {isCalibMissing ? 'ONTBREEKT' : calibrationData.needsCalibration ? 'OK' : 'NVT'}
                    </span>
                  </div>
                  <p className="text-[9px] font-medium mt-1 leading-tight truncate text-slate-500" title={calibrationData.calibrationReason || undefined}>
                    {isCalibMissing 
                      ? `⚠️ Vereist: "${calibrationData.calibrationReason || 'Kalibratie code gedetecteerd'}"`
                      : calibrationData.needsCalibration
                      ? `✓ Ingediend in Checklist ("${calibrationData.calibrationReason || 'Kalibratie'}")`
                      : 'Geen kalibratie vereist volgens calculatie.'}
                  </p>
                </div>
              </div>

              {/* Alignment Banner */}
              <div className={`p-2.5 rounded-xl border transition-all flex items-start gap-2.5 min-h-[58px] ${
                isAlignMissing 
                  ? 'bg-rose-50/75 border-rose-200 text-rose-900 shadow-xs animate-pulse-slow' 
                  : calibrationData.needsAlignment
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                  : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-white shadow-xs border border-transparent">
                  {isAlignMissing ? (
                    <AlertCircle size={14} className="text-rose-650 animate-bounce" />
                  ) : calibrationData.needsAlignment ? (
                    <CheckSquare size={14} className="text-emerald-600" />
                  ) : (
                    <Info size={14} className="text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[10px] tracking-tight uppercase">UITLIJNEN (GEOMETRIE)</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none ${
                      isAlignMissing 
                        ? 'bg-rose-200/50 text-rose-700 font-black' 
                        : calibrationData.needsAlignment
                        ? 'bg-emerald-100/50 text-emerald-800 animate-fade-in'
                        : 'bg-slate-200 text-slate-550'
                    }`}>
                      {isAlignMissing ? 'ONTBREEKT' : calibrationData.needsAlignment ? 'OK' : 'NVT'}
                    </span>
                  </div>
                  <p className="text-[9px] font-medium mt-1 leading-tight truncate text-slate-500" title={calibrationData.alignmentReason || undefined}>
                    {isAlignMissing 
                      ? `⚠️ Vereist: "${calibrationData.alignmentReason || 'Uitlijn code'}"`
                      : calibrationData.needsAlignment
                      ? `✓ Ingediend in Checklist ("${calibrationData.alignmentReason || 'Uitlijnen'}")`
                      : 'Geen uitlijning vereist volgens calculatie.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Right Card: Checklist & Actions */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between md:min-w-[340px] lg:max-w-[380px] gap-4">
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between border-b pb-1.5 border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Voertuig Checklist</p>
            <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-1.5 rounded-full">Stappen</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button 
              type="button"
              onClick={() => setReadoutPre(!readoutPre)}
              className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 select-none active:scale-95 text-xs font-bold ${
                readoutPre 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800' 
                  : 'border-slate-150 bg-slate-50 hover:bg-slate-100 text-slate-500'
              }`}
            >
              <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                readoutPre ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
              }`}>
                {readoutPre && <Check size={10} strokeWidth={3} />}
              </div>
              <span className="truncate">Uitlezen VOOR</span>
            </button>

            <button 
              type="button"
              onClick={() => setReadoutPost(!readoutPost)}
              className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 select-none active:scale-95 text-xs font-bold ${
                readoutPost 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800' 
                  : 'border-slate-150 bg-slate-50 hover:bg-slate-100 text-slate-500'
              }`}
            >
              <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                readoutPost ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
              }`}>
                {readoutPost && <Check size={10} strokeWidth={3} />}
              </div>
              <span className="truncate">Uitlezen NA</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-550 uppercase tracking-wider">Uitlijnen (Geometrie):</span>
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                alignmentStatus === 'none' ? 'text-slate-400' : 'text-emerald-600'
              }`}>
                {alignmentStatus === 'none' && 'Nee'}
                {alignmentStatus === 'intern' && 'Ja (Intern)'}
                {alignmentStatus === 'extern' && 'Ja (Extern)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold">
              <button 
                type="button"
                onClick={() => setAlignmentStatus('none')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  alignmentStatus === 'none' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Nee
              </button>
              <button 
                type="button"
                onClick={() => setAlignmentStatus('intern')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  alignmentStatus === 'intern' ? 'bg-emerald-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Intern
              </button>
              <button 
                type="button"
                onClick={() => setAlignmentStatus('extern')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  alignmentStatus === 'extern' ? 'bg-blue-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Extern
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-550 uppercase tracking-wider">Kalibratie (ADAS):</span>
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                calibrationStatus === 'none' ? 'text-slate-400' : 'text-emerald-600'
              }`}>
                {calibrationStatus === 'none' && 'Nee'}
                {calibrationStatus === 'intern' && 'Ja (Intern)'}
                {calibrationStatus === 'extern' && 'Ja (Extern)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold">
              <button 
                type="button"
                onClick={() => setCalibrationStatus('none')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  calibrationStatus === 'none' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Nee
              </button>
              <button 
                type="button"
                onClick={() => setCalibrationStatus('intern')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  calibrationStatus === 'intern' ? 'bg-emerald-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Intern
              </button>
              <button 
                type="button"
                onClick={() => setCalibrationStatus('extern')}
                className={`py-1 rounded-lg text-center transition-all select-none ${
                  calibrationStatus === 'extern' ? 'bg-blue-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Extern
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t pt-3 border-slate-100 shrink-0">
          <button 
            type="button"
            onClick={saveCurrentDossier}
            disabled={!licensePlate && !caseNumber}
            className="py-2.5 px-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-blue-500 transition-all shadow-md shadow-blue-200 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            title="Bewaar dit dossier in de lokale historie"
          >
            <Save size={14} />
            <span>Opslaan</span>
          </button>
          <button 
            type="button"
            onClick={downloadPDF}
            disabled={results.length === 0}
            className="py-2.5 px-2 bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-100 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-45"
          >
            <FileDown size={14} />
            <span>PDF Rapport</span>
          </button>
          <button 
            type="button"
            onClick={handleResetAll}
            className="py-2.5 px-2 bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-1 active:scale-95"
          >
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <style dangerouslySetInnerHTML={{ __html: dynamicCss }} />
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
              <div className="relative">
                <select
                  value={view === 'dashboard' ? dashboardTab : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setView('dashboard');
                      setDashboardTab(e.target.value as any);
                      playCyberBeep(700, 0.1);
                    }
                  }}
                  className="h-10 pl-3 pr-8 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-black uppercase tracking-wider text-slate-800 transition-all appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="verification">📊 Calculatie Verificatie</option>
                  <option value="photo_analysis">📸 CarVerify Pro</option>
                  <option value="training_center">🎓 Training Center</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
              </div>
            )}
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => {
                  setView(view === 'admin' ? 'dashboard' : 'admin');
                  playCyberBeep(950, 0.07);
                }}
                className={`p-2 rounded-lg transition-all ${view === 'admin' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-slate-400 hover:text-amber-600 hover:bg-slate-50'}`}
                title="Beheerderspaneel"
              >
                <Layers size={20} />
              </button>
            )}

            <button 
              onClick={() => {
                setView(view === 'settings' ? 'dashboard' : 'settings');
                playCyberBeep(850, 0.07);
              }}
              className={`p-2 rounded-lg transition-all ${view === 'settings' ? 'bg-blue-600 text-white shadow-lg shadow-blue-250' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-50'}`}
              title="Instellingen / Beveiliging (2FA)"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={() => {
                handleLogout();
                playCyberBeep(400, 0.15, "triangle");
              }}
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
            {/* Top Bar: Dossier Info wrapped in false */}
            {false && (
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              <div className="flex-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="w-full">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Kenteken</label>
                  <div className="flex items-center gap-3">
                    {/* Dutch styled license plate input - Upgraded for premium readability & visual rest */}
                    <div className="relative flex items-center bg-[#FFDE00] text-slate-900 font-mono font-black border-[3px] border-slate-900 rounded-2xl overflow-hidden shadow-sm h-16 flex-1 max-w-[280px] transition-all hover:shadow-md focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-slate-900 dutch-plate-container">
                      {/* EU/NL banner - Optimized for height & crisp typography */}
                      <div className="bg-[#0039AE] text-white text-[10px] w-10 h-full flex flex-col items-center justify-center leading-none select-none shrink-0 border-r-2 border-slate-900/15 border-slate-900 dutch-plate-eu">
                        <span className="text-[12px] text-[#FFDE00] font-sans leading-none mb-1 select-none dutch-plate-stars">★★</span>
                        <span className="text-[13px] font-sans font-black tracking-normal leading-none select-none">NL</span>
                      </div>
                      
                      {/* Input - Large 2XL soothing high-legibility font with clean letter spacing */}
                      <input 
                        type="text"
                        placeholder="AB-123-C"
                        maxLength={11}
                        className="w-full bg-transparent text-center text-xl md:text-2xl font-black font-mono placeholder:text-slate-900/30 text-slate-900 focus:outline-none uppercase tracking-[0.08em] px-2 selection:bg-slate-900/20 dutch-plate-input"
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

              {/* Right Card: Checklist & Actions */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between md:min-w-[340px] lg:max-w-[380px] gap-4">
                {/* Checklist Reminders */}
                <div className="space-y-3 font-sans">
                  <div className="flex items-center justify-between border-b pb-1.5 border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Voertuig Checklist</p>
                    <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-1.5 rounded-full">Stappen</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* Uitlezen Voor */}
                    <button 
                      onClick={() => setReadoutPre(!readoutPre)}
                      className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 select-none active:scale-95 text-xs font-bold ${
                        readoutPre 
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800' 
                          : 'border-slate-150 bg-slate-50 hover:bg-slate-100 text-slate-500'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        readoutPre ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                      }`}>
                        {readoutPre && <Check size={10} strokeWidth={3} />}
                      </div>
                      <span className="truncate">Uitlezen VOOR</span>
                    </button>

                    {/* Uitlezen Na */}
                    <button 
                      onClick={() => setReadoutPost(!readoutPost)}
                      className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 select-none active:scale-95 text-xs font-bold ${
                        readoutPost 
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800' 
                          : 'border-slate-150 bg-slate-50 hover:bg-slate-100 text-slate-500'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        readoutPost ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                      }`}>
                        {readoutPost && <Check size={10} strokeWidth={3} />}
                      </div>
                      <span className="truncate">Uitlezen NA</span>
                    </button>
                  </div>

                  {/* Alignment Toggle */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-500 uppercase tracking-wider">Uitlijnen (Geometrie):</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                        alignmentStatus === 'none' ? 'text-slate-400' : 'text-emerald-600'
                      }`}>
                        {alignmentStatus === 'none' && 'Nee'}
                        {alignmentStatus === 'intern' && 'Ja (Intern)'}
                        {alignmentStatus === 'extern' && 'Ja (Extern)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold">
                      <button 
                        onClick={() => setAlignmentStatus('none')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          alignmentStatus === 'none' ? 'bg-white text-slate-850 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Nee
                      </button>
                      <button 
                        onClick={() => setAlignmentStatus('intern')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          alignmentStatus === 'intern' ? 'bg-emerald-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-705'
                        }`}
                      >
                        Intern
                      </button>
                      <button 
                        onClick={() => setAlignmentStatus('extern')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          alignmentStatus === 'extern' ? 'bg-blue-600 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-705'
                        }`}
                      >
                        Extern
                      </button>
                    </div>
                  </div>

                  {/* Calibration Toggle */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-504 uppercase tracking-wider">Kalibratie (ADAS):</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                        calibrationStatus === 'none' ? 'text-slate-400' : 'text-emerald-600'
                      }`}>
                        {calibrationStatus === 'none' && 'Nee'}
                        {calibrationStatus === 'intern' && 'Ja (Intern)'}
                        {calibrationStatus === 'extern' && 'Ja (Extern)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold">
                      <button 
                        onClick={() => setCalibrationStatus('none')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          calibrationStatus === 'none' ? 'bg-white text-slate-850 shadow-sm' : 'text-slate-505 hover:text-slate-700'
                        }`}
                      >
                        Nee
                      </button>
                      <button 
                        onClick={() => setCalibrationStatus('intern')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          calibrationStatus === 'intern' ? 'bg-emerald-600 text-white shadow-sm font-extrabold' : 'text-slate-505 hover:text-slate-705'
                        }`}
                      >
                        Intern
                      </button>
                      <button 
                        onClick={() => setCalibrationStatus('extern')}
                        className={`py-1 rounded-lg text-center transition-all select-none ${
                          calibrationStatus === 'extern' ? 'bg-blue-600 text-white shadow-sm font-extrabold' : 'text-slate-505 hover:text-slate-705'
                        }`}
                      >
                        Extern
                      </button>
                    </div>
                  </div>
                </div>

                {/* Compact Action Buttons */}
                <div className="grid grid-cols-3 gap-2 border-t pt-3 border-slate-100 shrink-0">
                  <button 
                    onClick={saveCurrentDossier}
                    disabled={!licensePlate && !caseNumber}
                    className="py-2.5 px-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-blue-500 transition-all shadow-md shadow-blue-200 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    title="Bewaar dit dossier in de lokale historie"
                  >
                    <Save size={14} />
                    <span>Opslaan</span>
                  </button>
                  <button 
                    onClick={downloadPDF}
                    disabled={results.length === 0}
                    className="py-2.5 px-2 bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-100 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-45"
                  >
                    <FileDown size={14} />
                    <span>PDF Rapport</span>
                  </button>
                  <button 
                    onClick={handleResetAll}
                    className="py-2.5 px-2 bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    <RefreshCw size={14} />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </div>
            )}

            {dashboardTab === 'verification' ? (
              <>
                {/* Dossier Bar - Placed completely at the top */}
                {renderDossierBar()}

                {/* Inputs - Side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <InputSection 
                title="Eindcalculatie" 
                placeholder="Plak hier uw eindcalculatie gegevens..." 
                value={calcInput} 
                onChange={setCalcInput} 
                icon={<ClipboardCheck className="w-5 h-5 text-blue-600" />}
                partCount={calculationParts.length}
                onFormat={() => setCalcInput(formatCalculationText(calcInput))}
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

            {/* Compact Performance Statistics Toolbar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch">
              {/* Totaal Geverifieerd Bedrag */}
              <div className="bg-blue-600 p-4 rounded-2xl text-white relative overflow-hidden flex flex-col justify-center min-h-[72px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-105">Geverifieerd</p>
                <p className="text-xl font-black">€ {stats.totalVerifiedAmount.toFixed(2)}</p>
              </div>

              {/* Totaal Regels */}
              <button 
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all select-none active:scale-98 min-h-[72px] ${
                  statusFilter === 'all' ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-2 ring-blue-100' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Totaal Regels</p>
                <p className="text-lg font-black text-slate-800">{calculationParts.length}</p>
              </button>

              {/* Match OK */}
              <button 
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'matched' ? 'all' : 'matched')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all select-none active:scale-98 min-h-[72px] ${
                  statusFilter === 'matched' ? 'border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-100' : 'border-slate-100 bg-slate-50 hover:bg-emerald-50/10'
                }`}
              >
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Match OK</p>
                <p className="text-lg font-black text-emerald-700">{stats.matched}</p>
              </button>

              {/* Handmatig */}
              <button 
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-center transition-all select-none active:scale-98 min-h-[72px] ${
                  statusFilter === 'approved' ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-100' : 'border-slate-100 bg-slate-50 hover:bg-amber-50/10'
                }`}
              >
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Handmatig</p>
                <p className="text-lg font-black text-amber-700">{stats.approved}</p>
              </button>

              {/* Afwijking */}
              <button 
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'deviation' ? 'all' : 'deviation')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all select-none active:scale-98 min-h-[72px] ${
                  statusFilter === 'deviation' ? 'border-rose-500 bg-rose-50 border-rose-200 shadow-sm ring-2 ring-rose-100' : 'border-slate-100 bg-slate-50 hover:bg-rose-50/10'
                }`}
              >
                <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Afwijking</p>
                <p className="text-lg font-black text-rose-700">{stats.deviations}</p>
              </button>

              {/* Ontbrekend */}
              <button 
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all select-none active:scale-98 min-h-[72px] ${
                  statusFilter === 'missing' ? 'border-rose-500 bg-rose-50 border-rose-200 shadow-sm ring-2 ring-rose-100' : 'border-slate-100 bg-slate-50 hover:bg-rose-50/10'
                }`}
              >
                <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Ontbrekend</p>
                <p className="text-lg font-black text-rose-700">{stats.missing}</p>
              </button>
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
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {filteredResults.length} Resultaten gevonden
                        </p>
                        {statusFilter !== 'all' && (
                          <span 
                            onClick={() => setStatusFilter('all')}
                            className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 px-2 py-0.5 rounded cursor-pointer hover:bg-orange-100 transition-colors border border-orange-100/50"
                            title="Filter wissen"
                          >
                            <span>Filter: {statusFilter === 'matched' ? 'Match OK' : statusFilter === 'approved' ? 'Handmatig' : statusFilter === 'deviation' ? 'Afwijking' : 'Ontbrekend'}</span>
                            <span className="font-mono text-[9px]">×</span>
                          </span>
                        )}
                      </div>
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
                  <div className="flex flex-wrap items-center gap-6">
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

                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={dimUnchanged} 
                          onChange={(e) => setDimUnchanged(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-700 transition-colors uppercase tracking-tight flex items-center gap-1.5">
                        <span>Correcte delen verdonkeren</span>
                        <span className="px-1.5 py-0.5 text-[8px] font-black bg-blue-50 text-blue-605 rounded uppercase tracking-wider">Focus</span>
                      </span>
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
                      <th className="px-6 py-4 text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {filteredResults.length > 0 ? (
                        filteredResults.map((res, i) => {
                          const isCurrentlyEditing = editingCell?.startsWith(res.calc.id);
                          const isUnchanged = res.status === 'matched' && !isCurrentlyEditing && res.manualPrice === undefined;
                          const shouldDim = dimUnchanged && isUnchanged;
                          return (
                            <motion.tr 
                              key={res.calc.id + i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.02 }}
                              className={`group hover:bg-slate-50/80 transition-all ${
                                res.status === 'removed' ? 'opacity-40 grayscale bg-slate-50/50' : ''
                              } ${
                                struckThroughIds.has(res.calc.id) ? 'opacity-40 grayscale bg-slate-50/30' : ''
                              } ${
                                shouldDim ? 'opacity-[0.14] grayscale saturate-0 contrast-75 hover:opacity-100 hover:grayscale-0 hover:saturate-100 hover:contrast-100 focus-within:opacity-100 focus-within:grayscale-0 transition-all duration-300' : ''
                              }`}
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
                                <span className="inline-flex items-center justify-center font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-405 border border-slate-200 line-through font-mono">
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
                                <div className={`font-semibold text-sm text-slate-800 ${struckThroughIds.has(res.calc.id) ? 'line-through decoration-slate-400 decoration-2' : ''}`}>{res.calc.description}</div>
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
                                <div className="flex items-center gap-2 group/price-cell font-sans">
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
                                   className="p-1.5 rounded-xl border bg-emerald-50 border-emerald-200 hover:bg-emerald-100 cursor-pointer shadow-sm flex items-center justify-between transition-all"
                                 >
                                   <div className="flex flex-col gap-1">
                                     <div className="flex items-center gap-1.5">
                                       <span className="text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md bg-yellow-300 text-slate-950 border border-yellow-400 shadow-sm leading-none flex items-center justify-center">
                                          {res.calc.id}
                                        </span>
                                       <span className="text-[8px] font-black text-emerald-800 bg-emerald-100/55 px-1 py-0.5 rounded uppercase tracking-wider">Aangepast</span>
                                     </div>
                                     <div className="text-emerald-700 font-black text-sm">
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
                                   className={`p-1.5 rounded-xl border cursor-pointer transition-all shadow-sm ${
                                     res.status === 'matched' 
                                       ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' 
                                       : 'bg-rose-50 border-rose-200 hover:bg-rose-100'
                                   }`}
                                 >
                                   <div className="flex items-center gap-1 mb-1 flex-wrap">
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
                                      <div className="mt-1 p-1.5 bg-emerald-600 rounded-lg text-white shadow-sm border border-emerald-500 flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] uppercase font-black tracking-widest text-emerald-100 flex items-center gap-1">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            👉 CORRECTE PRIJS:
                                          </span>
                                          <span className="bg-yellow-300 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md border border-yellow-400 shadow">
                                            {res.calc.id}
                                          </span>
                                        </div>
                                       <span className="font-black text-sm leading-tight">
                                         € {res.match.price.toFixed(2)}
                                       </span>
                                     </div>
                                   ) : (
                                     <div className="flex items-center gap-2">
                                       <span className={`font-black text-xs text-emerald-600`}>
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
                                   className="p-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-bold text-[10px]"
                                 >
                                   <span className="text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md bg-yellow-300 text-slate-950 border border-yellow-400 shadow-sm leading-none flex items-center justify-center">
                                      {res.calc.id}
                                    </span>
                                   <span>+ Prijs invullen</span>
                                 </div>
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
                        );
                      })
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-6 py-20 text-center">
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
        ) : userProfile?.role === "admin" ? (
          <div className="space-y-6">
            {renderDossierBar()}
            
            {dashboardTab === 'photo_analysis' ? (
              <PhotoAnalysisTab 
                mode="analysis"
                licensePlate={licensePlate}
                vehicleModel={vehicleData ? `${vehicleData.brand} ${vehicleData.model}` : undefined}
                onApplySuggestedAE={(ae) => {
                  setManualOverrides(prev => ({ ...prev, "AI Hersteladvies": ae }));
                }}
                db={db}
                userId={user?.uid}
                calcInput={calcInput}
              />
            ) : (
              <PhotoAnalysisTab 
                mode="training"
                licensePlate={licensePlate}
                vehicleModel={vehicleData ? `${vehicleData.brand} ${vehicleData.model}` : undefined}
                onApplySuggestedAE={(ae) => {
                  setManualOverrides(prev => ({ ...prev, "AI Hersteladvies": ae }));
                }}
                db={db}
                userId={user?.uid}
                calcInput={calcInput}
              />
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-rose-600 bg-rose-50 border border-rose-100 rounded-3xl font-bold">
            U heeft geen toegang tot CarVerify Pro. Neem contact op met Danny.
          </div>
        )}
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
            layoutShape={layoutShape}
            setLayoutShape={setLayoutShape}
            layoutFont={layoutFont}
            setLayoutFont={setLayoutFont}
            layoutSize={layoutSize}
            setLayoutSize={setLayoutSize}
            layoutStyle={layoutStyle}
            setLayoutStyle={setLayoutStyle}
            cardShadow={cardShadow}
            setCardShadow={setCardShadow}
            bgPattern={bgPattern}
            setBgPattern={setBgPattern}
            buttonStyle={buttonStyle}
            setButtonStyle={setButtonStyle}
            inputFlatStyle={inputFlatStyle}
            setInputFlatStyle={setInputFlatStyle}
            headerStyle={headerStyle}
            setHeaderStyle={setHeaderStyle}
            pdfTheme={pdfTheme}
            setPdfTheme={setPdfTheme}
            crtEffect={crtEffect}
            setCrtEffect={setCrtEffect}
            audioFeedback={audioFeedback}
            setAudioFeedback={setAudioFeedback}
            glowText={glowText}
            setGlowText={setGlowText}
            fontSizeScale={fontSizeScale}
            setFontSizeScale={setFontSizeScale}
            PRESET_THEMES={PRESET_THEMES}
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
                      <div className="bg-[#FFD600] text-black font-mono font-black border-2 border-slate-950 px-4 py-1.5 rounded-xl flex items-center gap-3 tracking-wider text-base shadow-inner h-11 select-none dutch-plate-container">
                        <div className="bg-[#0039AE] text-white text-[9px] px-1 py-0.5 rounded-md flex flex-col items-center justify-center leading-none font-sans h-5 self-center dutch-plate-eu">
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

      <AnimatePresence>
        {isAudatexCodesOpen && (
          <AudatexCodesModal 
            isOpen={isAudatexCodesOpen}
            onClose={() => setIsAudatexCodesOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Vaste prijsafspraken side tab hover slide-out drawer */}
      {view === 'dashboard' && (
        <HoverAgreementsTab 
          selectedClientId={selectedClientId} 
          clients={clients} 
        />
      )}
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

function AdminView({ 
  onBack, 
  savedDossiers, 
  loadDossier, 
  deleteDossier,
  layoutShape,
  setLayoutShape,
  layoutFont,
  setLayoutFont,
  layoutSize,
  setLayoutSize,
  layoutStyle,
  setLayoutStyle,
  cardShadow,
  setCardShadow,
  bgPattern,
  setBgPattern,
  buttonStyle,
  setButtonStyle,
  inputFlatStyle,
  setInputFlatStyle,
  headerStyle,
  setHeaderStyle,
  pdfTheme,
  setPdfTheme,
  crtEffect,
  setCrtEffect,
  audioFeedback,
  setAudioFeedback,
  glowText,
  setGlowText,
  fontSizeScale,
  setFontSizeScale,
  PRESET_THEMES
}: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [attempts, setAttempts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'clients' | 'logs' | 'history' | 'design'>('clients');
  const [historySearch, setHistorySearch] = useState("");
  const [localToast, setLocalToast] = useState<string | null>(null);

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

  // States for inline editing of client part prices
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPartNumber, setEditingPartNumber] = useState("");
  const [editingPartDescription, setEditingPartDescription] = useState("");
  const [editingPartPrice, setEditingPartPrice] = useState("");

  const [adminPriceUitlezen, setAdminPriceUitlezen] = useState("");
  const [adminUnitUitlezen, setAdminUnitUitlezen] = useState<"€" | "Ae">("€");
  const [adminPriceUitlijnen, setAdminPriceUitlijnen] = useState("");
  const [adminPriceKoelvloeistof, setAdminPriceKoelvloeistof] = useState("");
  const [adminPriceAntiroest, setAdminPriceAntiroest] = useState("");
  const [adminPricePortierfolie, setAdminPricePortierfolie] = useState("");
  const [adminPriceDempingsmatten, setAdminPriceDempingsmatten] = useState("");
  const [adminPriceListLink, setAdminPriceListLink] = useState("");
  const [localPdfFile, setLocalPdfFile] = useState<{ fileName: string, base64Data: string } | null>(null);

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
        
        // Load local PDF from IndexedDB
        const localPdf = await getPdfFromLocal(selectedAdminClient);
        setLocalPdfFile(localPdf);
      };
      loadPrices();

      const currentClient = clients.find(c => c.id === selectedAdminClient);
      if (currentClient) {
        setAdminPriceUitlezen(currentClient.priceUitlezen !== undefined ? String(currentClient.priceUitlezen) : "");
        setAdminUnitUitlezen(currentClient.unitUitlezen === "Ae" ? "Ae" : "€");
        setAdminPriceUitlijnen(currentClient.priceUitlijnen !== undefined ? String(currentClient.priceUitlijnen) : "");
        setAdminPriceKoelvloeistof(currentClient.priceKoelvloeistof !== undefined ? String(currentClient.priceKoelvloeistof) : "");
        setAdminPriceAntiroest(currentClient.priceAntiroest !== undefined ? String(currentClient.priceAntiroest) : "");
        setAdminPricePortierfolie(currentClient.pricePortierfolie !== undefined ? String(currentClient.pricePortierfolie) : "");
        setAdminPriceDempingsmatten(currentClient.priceDempingsmatten !== undefined ? String(currentClient.priceDempingsmatten) : "");
        setAdminPriceListLink(currentClient.priceListLink !== undefined ? currentClient.priceListLink : "");
      }
    }
  }, [selectedAdminClient, clients]);

  const saveAgreements = async () => {
    if (!selectedAdminClient) return;
    try {
      const clientRef = doc(db, "clients", selectedAdminClient);
      const updatedData = {
        priceUitlezen: parseFloat(adminPriceUitlezen.replace(',', '.')) || 0,
        unitUitlezen: adminUnitUitlezen,
        priceUitlijnen: parseFloat(adminPriceUitlijnen.replace(',', '.')) || 0,
        priceKoelvloeistof: parseFloat(adminPriceKoelvloeistof.replace(',', '.')) || 0,
        priceAntiroest: parseFloat(adminPriceAntiroest.replace(',', '.')) || 0,
        pricePortierfolie: parseFloat(adminPricePortierfolie.replace(',', '.')) || 0,
        priceDempingsmatten: parseFloat(adminPriceDempingsmatten.replace(',', '.')) || 0,
        priceListLink: adminPriceListLink.trim(),
      };
      await updateDoc(clientRef, updatedData);
      
      setClients(prev => prev.map(c => c.id === selectedAdminClient ? { ...c, ...updatedData } : c));
      
      setLocalToast("Vaste prijsafspraken succesvol opgeslagen!");
      setTimeout(() => setLocalToast(null), 3050);
    } catch (err) {
      console.error("Fout bij opslaan prijsafspraken:", err);
      alert("Fout bij opslaan prijsafspraken!");
    }
  };

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

  const deleteClient = async (clientId: string) => {
    try {
      // Delete all nested prices first
      const pDocs = await getDocs(collection(db, "clients", clientId, "prices"));
      for (const d of pDocs.docs) {
        await deleteDoc(doc(db, "clients", clientId, "prices", d.id));
      }
      
      // Delete the client doc
      await deleteDoc(doc(db, "clients", clientId));
      
      // Update local state and selection
      setClients(prev => prev.filter(c => c.id !== clientId));
      if (selectedAdminClient === clientId) {
        setSelectedAdminClient(null);
        setClientPrices([]);
      }
      
      setLocalToast("Opdrachtgever en bijbehorende prijsafspraken succesvol verwijderd!");
      setTimeout(() => setLocalToast(null), 3050);
    } catch (err) {
      console.error("Fout bij verwijderen opdrachtgever:", err);
      alert("Er is een fout opgetreden bij het verwijderen van de opdrachtgever.");
    }
  };

  const startEditPrice = (p: any) => {
    setEditingPriceId(p.id);
    setEditingPartNumber(p.partNumber || "");
    setEditingPartDescription(p.description || "");
    setEditingPartPrice(String(p.price || ""));
  };

  const cancelEditPrice = () => {
    setEditingPriceId(null);
    setEditingPartNumber("");
    setEditingPartDescription("");
    setEditingPartPrice("");
  };

  const saveEditedPrice = async () => {
    if (!selectedAdminClient || !editingPriceId || !editingPartNumber || !editingPartPrice) return;
    try {
      const priceDocRef = doc(db, "clients", selectedAdminClient, "prices", editingPriceId);
      const updatedPriceVal = parseFloat(editingPartPrice.replace(',', '.')) || 0;
      await updateDoc(priceDocRef, {
        partNumber: editingPartNumber.trim(),
        description: editingPartDescription.trim(),
        price: updatedPriceVal,
        updatedAt: serverTimestamp()
      });

      // Update local state
      setClientPrices(prev => prev.map(p => p.id === editingPriceId ? {
        ...p,
        partNumber: editingPartNumber.trim(),
        description: editingPartDescription.trim(),
        price: updatedPriceVal
      } : p));

      setLocalToast("Prijsafspraak succesvol aangepast!");
      setTimeout(() => setLocalToast(null), 3050);
      cancelEditPrice();
    } catch (err) {
      console.error("Fout bij aanpassen prijsafspraak:", err);
      alert("Er is een fout opgetreden bij het aanpassen van de prijsafspraak.");
    }
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
            <button 
              onClick={() => setActiveTab('design')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'design' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Layout & Design Studio
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
                  <div 
                    key={c.id}
                    className={`w-full p-3 pl-4 pr-2 rounded-2xl border transition-all flex items-center justify-between gap-2 group ${selectedAdminClient === c.id ? 'bg-amber-50/80 border-amber-300/80 shadow-xs' : 'bg-slate-50 border-slate-100 hover:bg-slate-100/50 hover:border-slate-200'}`}
                  >
                    <button 
                      onClick={() => setSelectedAdminClient(c.id)}
                      className="flex-1 text-left focus:outline-none"
                    >
                      <div className="font-bold text-slate-800 text-sm leading-tight">{c.name}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono mt-0.5">
                        {c.id}
                      </div>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Weet u zeker dat u de opdrachtgever "${c.name}" en al zijn gekoppelde prijsafspraken wilt wissen?`)) {
                          deleteClient(c.id);
                        }
                      }}
                      className="p-2 text-slate-300 hover:text-rose-600 rounded-xl hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus-within:opacity-100"
                      title="Opdrachtgever verwijderen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                  <p className="text-[10px] text-slate-400 font-bold uppercase bg-slate-100 px-3 py-1 rounded-full col-span-2">
                    Tip: Voeg meerdere regels toe voor verschillende varianten (bv. luxe/normaal)
                  </p>
                </div>

                {/* Vaste Prijsafspraken Section */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-800">
                    <ClipboardCheck size={18} className="text-amber-600" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Vaste Prijsafspraken (Subvelden)</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Uitlezen (Voor/Na)</label>
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-black">
                            {adminUnitUitlezen === "€" ? "€" : "Ae"}
                          </span>
                          <input 
                            type="text" 
                            value={adminPriceUitlezen}
                            onChange={(e) => setAdminPriceUitlezen(e.target.value)}
                            placeholder="0.00"
                            className={`w-full ${adminUnitUitlezen === "Ae" ? "pl-9" : "pl-6"} pr-2 py-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none h-[38px]`}
                          />
                        </div>
                        <select
                          value={adminUnitUitlezen}
                          onChange={(e) => setAdminUnitUitlezen(e.target.value as "€" | "Ae")}
                          className="px-2 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-700 focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer h-[38px] shrink-0"
                        >
                          <option value="€">€</option>
                          <option value="Ae">Ae</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Uitlijnen</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">€</span>
                        <input 
                          type="text" 
                          value={adminPriceUitlijnen}
                          onChange={(e) => setAdminPriceUitlijnen(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 p-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Koelvloeistof</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">€</span>
                        <input 
                          type="text" 
                          value={adminPriceKoelvloeistof}
                          onChange={(e) => setAdminPriceKoelvloeistof(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 p-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Antiroest</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">€</span>
                        <input 
                          type="text" 
                          value={adminPriceAntiroest}
                          onChange={(e) => setAdminPriceAntiroest(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 p-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Portierfolie</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">€</span>
                        <input 
                          type="text" 
                          value={adminPricePortierfolie}
                          onChange={(e) => setAdminPricePortierfolie(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 p-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dempingsmatten</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">€</span>
                        <input 
                          type="text" 
                          value={adminPriceDempingsmatten}
                          onChange={(e) => setAdminPriceDempingsmatten(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 p-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* PDF Upload / Links Sectie */}
                  <div className="border-t border-slate-200 pt-5 flex flex-col md:flex-row gap-5 items-start">
                    {/* Link */}
                    <div className="w-full md:w-1/2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                        <Link size={12} className="text-amber-600" />
                        Online Prijslijst URL (bv. OneDrive / Dropbox link)
                      </label>
                      <input 
                        type="url" 
                        value={adminPriceListLink}
                        onChange={(e) => setAdminPriceListLink(e.target.value)}
                        placeholder="https://onedrive.live.com/..."
                        className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white font-medium"
                      />
                    </div>

                    {/* PDF upload element */}
                    <div className="w-full md:w-1/2 flex flex-col">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                        <FileText size={12} className="text-amber-600" />
                        Upload Prijslijst PDF (Exclusief lokaal beveiligd)
                      </label>
                      <div className="flex items-center gap-2">
                        {localPdfFile ? (
                          <div className="flex-1 flex items-center justify-between p-2 pl-3 bg-white border border-slate-200 rounded-xl text-xs h-[38px]">
                            <span className="font-bold text-slate-700 truncate max-w-[150px] md:max-w-[200px]" title={localPdfFile.fileName}>
                              📄 {localPdfFile.fileName}
                            </span>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  // Open PDF in new tab
                                  const newTab = window.open();
                                  if (newTab) {
                                    newTab.document.write(`<iframe src="${localPdfFile.base64Data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  } else {
                                    // Fallback: download instead
                                    const link = document.createElement("a");
                                    link.href = localPdfFile.base64Data;
                                    link.download = localPdfFile.fileName;
                                    link.click();
                                  }
                                }}
                                className="p-1 px-1.5 text-slate-500 hover:text-slate-850 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                title="Bekijk PDF"
                              >
                                <Eye size={12} />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (confirm("Weet u zeker dat u de geüploade PDF wilt wissen?")) {
                                    await deletePdfFromLocal(selectedAdminClient);
                                    setLocalPdfFile(null);
                                    setLocalToast("Prijslijst PDF succesvol verwijderd!");
                                    setTimeout(() => setLocalToast(null), 3050);
                                  }
                                }}
                                className="p-1 px-1.5 text-rose-500 hover:text-rose-700 bg-slate-50 hover:bg-rose-100/50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                title="Verwijder PDF"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex-1 flex items-center justify-center border border-dashed border-slate-300 rounded-xl p-2 hover:border-slate-400 cursor-pointer text-xs font-bold text-slate-500 bg-white h-[38px] hover:bg-slate-50/50 transition-colors">
                            <Upload size={14} className="mr-1.5 text-slate-400" />
                            <span>Selecteer PDF bestand</span>
                            <input 
                              type="file" 
                              accept="application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 8 * 1024 * 1024) {
                                  alert("Het PDF bestand is te groot (maximaal 8MB).");
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                  const base64Data = event.target?.result as string;
                                  if (base64Data) {
                                    await savePdfToLocal(selectedAdminClient, file.name, base64Data);
                                    setLocalPdfFile({ fileName: file.name, base64Data });
                                    setLocalToast("Prijslijst PDF succesvol geüpload en lokaal beveiligd!");
                                    setTimeout(() => setLocalToast(null), 3050);
                                  }
                                };
                                reader.readAsDataURL(file);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100">
                    <button 
                      onClick={saveAgreements}
                      className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-all shadow-md active:scale-95"
                    >
                      Afspraken Opslaan
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 my-4"></div>

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
                    clientPrices.map(p => {
                      if (editingPriceId === p.id) {
                        return (
                          <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-4 bg-amber-50/45 p-4 rounded-2xl border border-amber-200/80 my-2">
                            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[200px]">
                              <div className="w-32 shrink-0">
                                <label className="block text-[8px] font-black text-amber-800 uppercase tracking-wider mb-0.5">Partnummer</label>
                                <input 
                                  type="text"
                                  value={editingPartNumber}
                                  onChange={(e) => setEditingPartNumber(e.target.value)}
                                  className="w-full p-2 text-xs border border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg bg-white font-mono font-bold text-slate-800"
                                />
                              </div>
                              <div className="flex-1 min-w-[120px]">
                                <label className="block text-[8px] font-black text-amber-800 uppercase tracking-wider mb-0.5">Omschrijving</label>
                                <input 
                                  type="text"
                                  value={editingPartDescription}
                                  onChange={(e) => setEditingPartDescription(e.target.value)}
                                  className="w-full p-2 text-xs border border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg bg-white font-medium text-slate-800"
                                />
                              </div>
                              <div className="w-24 shrink-0">
                                <label className="block text-[8px] font-black text-amber-800 uppercase tracking-wider mb-0.5">Prijs (€)</label>
                                <input 
                                  type="text"
                                  value={editingPartPrice}
                                  onChange={(e) => setEditingPartPrice(e.target.value)}
                                  className="w-full p-2 text-xs border border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg bg-white font-black text-slate-850"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button 
                                onClick={saveEditedPrice}
                                className="p-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-500 shadow-sm transition-all active:scale-95"
                                title="Wijzigingen Opslaan"
                              >
                                <Check size={14} />
                              </button>
                              <button 
                                onClick={cancelEditPrice}
                                className="p-2.5 bg-white text-slate-400 border border-slate-250 rounded-xl hover:bg-slate-50 transition-all"
                                title="Annuleren"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={p.id} className="py-3 flex items-center justify-between group hover:bg-slate-50/50 px-2 rounded-2xl transition-all">
                          <div className="flex items-center gap-6">
                            <code className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg w-32 shrink-0">{p.partNumber}</code>
                            <div className="w-48 text-sm font-medium text-slate-700 truncate">{p.description || "Geen omschrijving"}</div>
                            <div className="text-xs font-black text-emerald-800 bg-emerald-50/80 border border-emerald-100 px-3 py-1 rounded-xl">
                              € {typeof p.price === 'number' ? p.price.toFixed(2) : parseFloat(p.price || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEditPrice(p)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                              title="Onderdeel wijzigen"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              onClick={() => deletePrice(p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              title="Onderdeel verwijderen"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
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
      ) : activeTab === 'history' ? (
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
      ) : (
        <div className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-3 text-left">
            <h3 className="text-xl font-black text-slate-800">Dynamic Design Studio</h3>
            <p className="text-xs text-slate-500 font-medium">Configureer de complete visuele uitstraling, vormen, lettertypes, grootte en lay-out stijlen van PartVerify Pro direct. Kies uit 20 zorgvuldig samengestelde fabrieksthemavarianten of verfijn ze handmatig hieronder.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left sidebar controllers */}
            <div className="space-y-6 lg:col-span-1">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 text-left">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">1. Lettertype (Font)</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Selecteer een professionele typografie die aansluit bij de gewenste huisstijl.</p>
                  <select 
                    value={layoutFont} 
                    onChange={(e) => {
                      setLayoutFont(e.target.value);
                      localStorage.setItem("partverify_layout_font", e.target.value);
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {["Inter", "Space Grotesk", "Outfit", "Plus Jakarta Sans", "JetBrains Mono", "Playfair Display", "Lexend", "Sora", "Clash Display", "Quicksand", "Nunito", "DM Sans", "Syne", "Georgia", "Roboto", "Rubik"].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">2. Hoekvormen (Border Radius)</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Bepaal hoe strak of organisch de layout-elementen eruitzien.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "sharp", name: "Luxe Haaks (0px)" },
                      { id: "slightly-rounded", name: "Sleek (6px)" },
                      { id: "smooth", name: "Comfort (16px)" },
                      { id: "pill", name: "Organic Pill (28px)" }
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setLayoutShape(s.id);
                          localStorage.setItem("partverify_layout_shape", s.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          layoutShape === s.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">3. Layout Grootte & Densiteit</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Pas tekstgrootte en knop-tussenruimtes aan voor optimaal overzicht.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "compact", name: "Extra Compact" },
                      { id: "standard", name: "Standaard" },
                      { id: "comfortable", name: "Luchtig" },
                      { id: "prominent", name: "Groots & Duidelijk" }
                    ].map((sz) => (
                      <button
                        key={sz.id}
                        onClick={() => {
                          setLayoutSize(sz.id);
                          localStorage.setItem("partverify_layout_size", sz.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          layoutSize === sz.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {sz.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">3b. Fijnafstelling Lettergrootte</h4>
                    <span className="text-xs bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded-lg border border-amber-200 animate-pulse">
                      {Math.round(fontSizeScale * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium font-bold">Versleep de schuifregelaar of kies onderstaande presets voor de perfect leesbare typografie.</p>
                  
                  <div className="space-y-2">
                    <input 
                      type="range"
                      min="0.70"
                      max="1.60"
                      step="0.05"
                      value={fontSizeScale}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setFontSizeScale(val);
                        localStorage.setItem("partverify_font_size_scale", val.toString());
                      }}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-0.5">
                      <span>70% (Zeer klein)</span>
                      <span>100% (Normaal)</span>
                      <span>160% (XL)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {[
                      { scale: 0.85, name: "Klein (85%)" },
                      { scale: 1.00, name: "Standaard (100%)" },
                      { scale: 1.15, name: "Groot (115%)" },
                      { scale: 1.35, name: "Senioren / XL (135%)" }
                    ].map((p) => (
                      <button
                        key={p.scale}
                        onClick={() => {
                          setFontSizeScale(p.scale);
                          localStorage.setItem("partverify_font_size_scale", p.scale.toString());
                        }}
                        className={`py-2 px-1 text-[10px] font-black border rounded-xl transition-all ${
                          Math.abs(fontSizeScale - p.scale) < 0.01
                            ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">4. Kaart Schaduw & Diepte</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Configureer de diepte en schaduweffecten van de dashboardmodules.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "flat", name: "Vlak / Rand" },
                      { id: "soft", name: "Subtiel modern" },
                      { id: "deep", name: "Diepe schaduw" },
                      { id: "glow", name: "Modern Gloed" }
                    ].map((sh) => (
                      <button
                        key={sh.id}
                        onClick={() => {
                          setCardShadow(sh.id);
                          localStorage.setItem("partverify_card_shadow", sh.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          cardShadow === sh.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {sh.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">5. Achtergrond Vullingen</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Kies een patroonoverlay voor de applicatie-achtergrond.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "solid", name: "Effen Kleur" },
                      { id: "dots", name: "Stippatroon" },
                      { id: "grid", name: "Systeem Grid" },
                      { id: "abstract", name: "Zachte Golven" }
                    ].map((bp) => (
                      <button
                        key={bp.id}
                        onClick={() => {
                          setBgPattern(bp.id);
                          localStorage.setItem("partverify_bg_pattern", bp.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          bgPattern === bp.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {bp.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">6. Knoppen Stijloverlay</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium font-bold">Kies de weergave en interactiestijl van primaire knoppen.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "classic", name: "Klassiek Solide" },
                      { id: "soft", name: "Zacht Getint" },
                      { id: "outlined", name: "Alleen Rand" },
                      { id: "vintage", name: "Retro / Vintage" }
                    ].map((bt) => (
                      <button
                        key={bt.id}
                        onClick={() => {
                          setButtonStyle(bt.id);
                          localStorage.setItem("partverify_button_style", bt.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          buttonStyle === bt.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {bt.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">7. Invoervelden Stijl</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Geef invoervelden een unieke rustige of juist strakke look.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "rounded", name: "Rond & Modern" },
                      { id: "underline", name: "Onderstreping" },
                      { id: "bordered", name: "Zware Randen" }
                    ].map((ip) => (
                      <button
                        key={ip.id}
                        onClick={() => {
                          setInputFlatStyle(ip.id);
                          localStorage.setItem("partverify_input_flat", ip.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          inputFlatStyle === ip.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {ip.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">8. Header Layout & Navigatie</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Configureer de plek en vormgeving van de bovenbalk header.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "standard", name: "Standaard Vast" },
                      { id: "floating", name: "Zwevend Dashboard" },
                      { id: "hybrid", name: "Glas-Transparant" }
                    ].map((hs) => (
                      <button
                        key={hs.id}
                        onClick={() => {
                          setHeaderStyle(hs.id);
                          localStorage.setItem("partverify_header_style", hs.id);
                        }}
                        className={`p-3 text-xs font-bold border rounded-xl transition-all ${
                          headerStyle === hs.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {hs.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">9. PDF Verslag Stijlthema</h4>
                  <p className="text-xs text-slate-400 mb-4 font-medium font-bold">Selecteer de visuele opmaak voor gegenereerde PDF bestanden.</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "theme-matched", name: "Dynamisch (Match Huisstijl-accent)" },
                      { id: "classic-navy", name: "Klassiek Corporate Marineblauw" },
                      { id: "monochrome", name: "Modern Minimalistisch Grijs" },
                      { id: "printer-friendly", name: "Inktbesparend / Transparant" }
                    ].map((pd) => (
                      <button
                        key={pd.id}
                        onClick={() => {
                          setPdfTheme(pd.id);
                          localStorage.setItem("partverify_pdf_theme", pd.id);
                        }}
                        className={`p-3 text-xs font-bold text-left border rounded-xl transition-all flex items-center justify-between ${
                          pdfTheme === pd.id 
                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100" 
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <span>{pd.name}</span>
                        {pdfTheme === pd.id && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">10. Extreme Nerd Opties</h4>
                    <p className="text-xs text-slate-400 mb-4 font-medium">Activeer nerd-achtige HUD-scanlijnen, neon gloeiing of synthesiser clicks.</p>
                  </div>
                  
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        const newVal = !crtEffect;
                        setCrtEffect(newVal);
                        localStorage.setItem("partverify_crt_effect", newVal ? "true" : "false");
                      }}
                      className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                        crtEffect 
                          ? "bg-green-600/10 border-green-500 text-green-700 shadow-md shadow-green-100" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🖥️</span>
                        <div className="text-left">
                          <p className="font-extrabold text-[12px]">CRT Scanlijnen & Flicker</p>
                          <p className="text-[10px] opacity-80 font-medium">Gesimuleerde retro-terminal trilling</p>
                        </div>
                      </div>
                      <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${crtEffect ? "bg-green-500" : "bg-slate-300"}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${crtEffect ? "translate-x-3" : "translate-x-0"}`} />
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        const newVal = !glowText;
                        setGlowText(newVal);
                        localStorage.setItem("partverify_glow_text", newVal ? "true" : "false");
                      }}
                      className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                        glowText 
                          ? "bg-purple-600/10 border-purple-500 text-purple-700 shadow-md shadow-purple-100" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✨</span>
                        <div className="text-left">
                          <p className="font-extrabold text-[12px]">Neon Tekstgloed / Bloom</p>
                          <p className="text-[10px] opacity-80 font-medium">Cyberpunk sfeergloed op alle titels</p>
                        </div>
                      </div>
                      <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${glowText ? "bg-purple-500" : "bg-slate-300"}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${glowText ? "translate-x-3" : "translate-x-0"}`} />
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        const newVal = !audioFeedback;
                        setAudioFeedback(newVal);
                        localStorage.setItem("partverify_audio_feedback", newVal ? "true" : "false");
                        if (newVal) {
                          try {
                            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.type = "sine";
                            osc.frequency.setValueAtTime(600, ctx.currentTime);
                            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
                            gain.gain.setValueAtTime(0.03, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                            osc.connect(gain);
                            gain.connect(ctx.destination);
                            osc.start();
                            osc.stop(ctx.currentTime + 0.15);
                          } catch (e) {}
                        }
                      }}
                      className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                        audioFeedback 
                          ? "bg-amber-600/10 border-amber-500 text-amber-700 shadow-md shadow-amber-100" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔊</span>
                        <div className="text-left">
                          <p className="font-extrabold text-[12px]">Cyber Geluidseffecten</p>
                          <p className="text-[10px] opacity-80 font-medium">Retro beep-clicks bij acties</p>
                        </div>
                      </div>
                      <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${audioFeedback ? "bg-amber-500" : "bg-slate-300"}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${audioFeedback ? "translate-x-3" : "translate-x-0"}`} />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar: 30+ themes presets grids */}
            <div className="lg:col-span-2 space-y-4 text-left">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">4. Kies 1 van de 30+ Specifieke Stijlen & Overlays</h4>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">30+ Stijlen</span>
                </div>
                <p className="text-xs text-slate-400">Verander de gehele merkidentiteit van uw portaal met een enkele klik. Handmatige aanpassingen hiernaast blijven actueel.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
                  {PRESET_THEMES.map((theme: any, index: number) => {
                    const isSelected = layoutStyle === theme.id;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => {
                          setLayoutStyle(theme.id);
                          setLayoutFont(theme.font);
                          setLayoutShape(theme.shape);
                          setLayoutSize(theme.size);
                          localStorage.setItem("partverify_layout_style", theme.id);
                          localStorage.setItem("partverify_layout_font", theme.font);
                          localStorage.setItem("partverify_layout_shape", theme.shape);
                          localStorage.setItem("partverify_layout_size", theme.size);
                          setLocalToast(`Preset "${theme.name}" succesvol geladen!`);
                          setTimeout(() => setLocalToast(null), 3000);
                        }}
                        className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between h-[120px] relative overflow-hidden group ${
                          isSelected 
                            ? "border-amber-500 ring-2 ring-amber-500/10 shadow-lg bg-orange-50/10" 
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        {/* Background decor stripe */}
                        <div className="absolute top-0 right-0 w-24 h-full opacity-10 group-hover:scale-110 transition-transform pointer-events-none" style={{ backgroundColor: theme.primary }} />

                        <div className="space-y-1 z-10">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400">STIJL {index + 1}</span>
                            {isSelected && (
                              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[8px] font-extrabold uppercase animate-pulse">ACTIEF</span>
                            )}
                          </div>
                          <h5 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">{theme.name}</h5>
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">{theme.desc}</p>
                        </div>

                        {/* Styling preview bar */}
                        <div className="flex items-center gap-2 z-10 mt-2">
                          <div className="w-5 h-5 rounded-full border border-slate-100 flex items-center justify-center p-0.5 bg-white">
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: theme.primary }} />
                          </div>
                          <div className="w-5 h-5 rounded-full border border-slate-100 flex items-center justify-center p-0.5 bg-white">
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: theme.bgPage }} />
                          </div>
                          <div className="w-5 h-5 rounded-full border border-slate-100 flex items-center justify-center p-0.5 bg-white">
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: theme.cardBg }} />
                          </div>
                          <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{theme.font}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {localToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-bold font-sans">{localToast}</span>
        </div>
      )}
    </motion.div>
  );
}

function HoverAgreementsTab({ selectedClientId, clients }: { selectedClientId: string, clients: any[] }) {
  const [isHovered, setIsHovered] = useState(false);
  const [dashboardPdf, setDashboardPdf] = useState<{ fileName: string, base64Data: string } | null>(null);
  const currentClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (selectedClientId) {
      getPdfFromLocal(selectedClientId).then(pdf => {
        setDashboardPdf(pdf);
      }).catch(err => {
        console.error("Fout bij laden dashboard PDF:", err);
        setDashboardPdf(null);
      });
    } else {
      setDashboardPdf(null);
    }
  }, [selectedClientId]);

  const formatPrice = (val: any) => {
    if (val === undefined || val === null || val === "" || isNaN(Number(val)) || Number(val) === 0) {
      return "Geen";
    }
    return `€ ${Number(val).toFixed(2)}`;
  };

  const formatPriceUitlezen = (val: any, unit: string) => {
    if (val === undefined || val === null || val === "" || isNaN(Number(val)) || Number(val) === 0) {
      return "Geen";
    }
    if (unit === "Ae") {
      return `${val} Ae`;
    }
    return `€ ${Number(val).toFixed(2)}`;
  };

  return (
    <motion.div
      initial={{ x: "280px" }}
      animate={{ x: isHovered ? "0px" : "280px" }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed right-0 top-1/4 z-40 flex items-start select-none"
    >
      {/* Lipje (Tab) */}
      <div 
        onClick={() => setIsHovered(!isHovered)}
        className="bg-slate-900 border border-r-0 border-slate-800 hover:bg-slate-800 text-white py-4 px-2 text-center rounded-l-2xl shadow-xl cursor-pointer flex flex-col items-center gap-2 select-none"
      >
        <ClipboardCheck size={16} className="text-amber-500 animate-pulse" />
        <span className="text-[9px] font-black uppercase tracking-widest [writing-mode:vertical-lr] my-1 leading-none">
          AFSPRAKEN
        </span>
      </div>

      {/* Drawer content */}
      <div className="w-[280px] bg-white border-l border-y border-slate-200/85 rounded-l-2xl shadow-2xl p-5 space-y-4 flex flex-col justify-between shrink-0 h-auto min-h-[480px] font-sans">
        <div className="space-y-4">
          <div className="space-y-1 text-left">
            <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest leading-none block">
              Vaste Tarieven
            </span>
            <h4 className="text-sm font-black text-slate-800 truncate" title={currentClient ? currentClient.name : "Geen / Standaard"}>
              {currentClient ? currentClient.name : "Standaard / Geen"}
            </h4>
          </div>

          <div className="border-t border-slate-100 my-2"></div>

          {/* Agreements Items List */}
          <div className="space-y-2 text-left">
            {/* Row 1 */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Uitlezen</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Voor en Na OBD</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.priceUitlezen ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPriceUitlezen(currentClient?.priceUitlezen, currentClient?.unitUitlezen)}
              </span>
            </div>

            {/* Row 2 */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Uitlijnen</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Geometrie Service</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.priceUitlijnen ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPrice(currentClient?.priceUitlijnen)}
              </span>
            </div>

            {/* Row 3 */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Koelvloeistof</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Vloeistofafspraak</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.priceKoelvloeistof ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPrice(currentClient?.priceKoelvloeistof)}
              </span>
            </div>

            {/* Row 4 */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Antiroest</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Conservering</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.priceAntiroest ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPrice(currentClient?.priceAntiroest)}
              </span>
            </div>

            {/* Row 5: Portierfolie */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Portierfolie</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Geventileerde folie</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.pricePortierfolie ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPrice(currentClient?.pricePortierfolie)}
              </span>
            </div>

            {/* Row 6: Dempingsmatten */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-100 transition-all">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-tight leading-none">Dempingsmatten</span>
                <span className="text-[8px] text-slate-400 font-medium block leading-normal font-sans">Geluidsisolatie</span>
              </div>
              <span className={`text-xs font-black font-mono shrink-0 ${currentClient?.priceDempingsmatten ? 'text-emerald-600' : 'text-slate-450 italic font-medium'}`}>
                {formatPrice(currentClient?.priceDempingsmatten)}
              </span>
            </div>
          </div>

          {/* PDF & URL Links if present (Subtly grouped under "Documenten" without cluttering) */}
          {(dashboardPdf || currentClient?.priceListLink) && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
              <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider text-left mb-1">
                Documenten & Tarieven (PDF)
              </span>
              
              {dashboardPdf && (
                <button
                  onClick={() => {
                    const newTab = window.open();
                    if (newTab) {
                      newTab.document.write(`<iframe src="${dashboardPdf.base64Data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                    } else {
                      const link = document.createElement("a");
                      link.href = dashboardPdf.base64Data;
                      link.download = dashboardPdf.fileName;
                      link.click();
                    }
                  }}
                  className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-amber-600/30 shadow-xs"
                >
                  <FileText size={12} />
                  <span>Open Prijslijst PDF</span>
                </button>
              )}

              {currentClient?.priceListLink && (
                <a
                  href={currentClient.priceListLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors border border-slate-200 text-center"
                >
                  <Link size={12} className="text-slate-500" />
                  <span>Externe Prijslijst</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Branding Footer */}
        <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-wider text-slate-300">
            Danny Radjkoemar
          </span>
          <span className="text-[8px] font-bold text-slate-400">
            PartVerify Pro
          </span>
        </div>
      </div>
    </motion.div>
  );
}
function StatsCard({ 
  label, 
  value, 
  icon, 
  color,
  isActive = false,
  isFilterable = false,
  onClick
}: { 
  label: string, 
  value: string | number, 
  icon: React.ReactNode, 
  color: string,
  isActive?: boolean,
  isFilterable?: boolean,
  onClick?: () => void
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={isFilterable ? onClick : undefined}
      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
        isActive 
          ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10 shadow-sm' 
          : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
      } flex items-start justify-between overflow-hidden relative group ${
        isFilterable ? 'cursor-pointer select-none active:scale-98' : 'cursor-default'
      }`}
    >
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-1.5">
          <h3 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800">{value}</h3>
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-505 bg-blue-500 animate-pulse" />
          )}
        </div>
      </div>
      <div className={`p-2 rounded-xl text-xs ${color} transition-transform group-hover:scale-105 duration-300 shrink-0`}>
        {icon}
      </div>
    </motion.div>
  );
}

function InputSection({ title, placeholder, value, onChange, icon, partCount, onFormat }: { title: string, placeholder: string, value: string, onChange: (v: string) => void, icon?: React.ReactNode, partCount?: number, onFormat?: () => void }) {
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
        <div className="flex items-center gap-3">
          {onFormat && value && (
            <button 
              onClick={onFormat}
              className="text-[10px] font-black text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-full uppercase tracking-widest transition-all flex items-center gap-1"
              title="Lijn multi-line regels uit tot overzichtelijke enkele regels"
            >
              <span>✦ Lijn uit</span>
            </button>
          )}
          {value && (
            <button 
              onClick={() => onChange("")}
              className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
            >
              Leegmaken
            </button>
          )}
        </div>
      </div>
      <div className="relative group">
        <textarea 
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            if (title === "Eindcalculatie") {
              e.preventDefault();
              const pastedText = e.clipboardData.getData("text");
              const formattedText = formatCalculationText(pastedText);
              
              const textarea = e.currentTarget;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const text = textarea.value;
              const newValue = text.substring(0, start) + formattedText + text.substring(end);
              
              onChange(newValue);
              
              setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + formattedText.length;
              }, 0);
            } else if (title === "Inkoopfacturen") {
              e.preventDefault();
              let pastedText = e.clipboardData.getData("text");
              
              // Ensure pasted text ends with a newline, simulating hitting enter after paste
              if (pastedText && !pastedText.endsWith("\n")) {
                pastedText += "\n";
              }
              
              const textarea = e.currentTarget;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const text = textarea.value;
              const newValue = text.substring(0, start) + pastedText + text.substring(end);
              
              onChange(newValue);
              
              setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
              }, 0);
            }
          }}
          className="w-full h-52 bg-white border border-slate-200 rounded-3xl p-6 text-[10.5px] font-mono text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm resize-none leading-relaxed"
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
