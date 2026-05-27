import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Camera, Lock, Trash2, Plus, Sparkles, CheckCircle2, 
  AlertTriangle, Loader2, Eye, Copy, Wrench, Shield, FileText, Check,
  GraduationCap, BookOpen, TrendingUp, BarChart3, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc 
} from "firebase/firestore";

interface UploadedImage {
  id: string;
  name: string;
  originalUrl: string; // The base64 upload
  anonymizedUrl: string; // The blurred canvas base64 output
  isAnonymizing: boolean;
  detections: any[];
}

interface AnalysisResult {
  summary: string;
  suggested_total_ae: number;
  suggested_total_hours?: number; // legacy fallback
  confidence_percentage: number;
  breakdown: Array<{
    component: string;
    damage_description: string;
    suggested_ae: number;
    suggested_hours?: number; // legacy fallback
    recommended_action: string;
    reasoning: string;
  }>;
  technical_tips: string[];
}

interface AIToolTrainingLog {
  id: string;
  timestamp: string;
  vehicleModel: string;
  licensePlate: string;
  aiSuggestedTotalAE: number;
  userActualTotalAE: number;
  reasons: string[];
  notes: string;
  images?: string[];
  calculationText?: string;
}

interface PhotoAnalysisTabProps {
  licensePlate?: string;
  vehicleModel?: string;
  onApplySuggestedAE?: (ae: number) => void;
  db?: any;
  userId?: string;
  calcInput?: string;
  mode?: 'analysis' | 'training';
}

export function PhotoAnalysisTab({ licensePlate, vehicleModel, onApplySuggestedAE, db, userId, calcInput, mode = 'analysis' }: PhotoAnalysisTabProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [activeImage, setActiveImage] = useState<UploadedImage | null>(null);
  const [selectedZoomLogImage, setSelectedZoomLogImage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Linked Calculation States
  const [linkCalculation, setLinkCalculation] = useState(mode !== 'analysis');
  const [customCalcInput, setCustomCalcInput] = useState("");
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [lastAutoAnalyzedIds, setLastAutoAnalyzedIds] = useState("");

  // AI Training State
  const [trainingLogs, setTrainingLogs] = useState<AIToolTrainingLog[]>([]);
  const [userActualHours, setUserActualHours] = useState<string>("");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [calibrationNotes, setCalibrationNotes] = useState("");
  const [isFeeding, setIsFeeding] = useState(false);
  const [feedSuccess, setFeedSuccess] = useState(false);
  const [showLogsCenter, setShowLogsCenter] = useState(mode === 'training');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync mode transitions
  useEffect(() => {
    setLinkCalculation(mode !== 'analysis');
    setAnalysisResult(null);
    setImages([]);
    setLastAutoAnalyzedIds("");
    setShowLogsCenter(mode === 'training');
  }, [mode]);

  // Load past training / calibration logs
  useEffect(() => {
    const loadLogs = async () => {
      if (db && userId) {
        try {
          const q = query(
            collection(db, "ai_training_logs"),
            where("userId", "==", userId)
          );
          const querySnapshot = await getDocs(q);
          const loadedLogs: AIToolTrainingLog[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Backward-compatible loading: convert legacy hour-logs into AEs (hour * 10)
            const aiAE = Number(data.aiSuggestedTotalAE || (data.aiSuggestedTotalHours ? data.aiSuggestedTotalHours * 10 : 0));
            const userAE = Number(data.userActualTotalAE || (data.userActualTotalHours ? data.userActualTotalHours * 10 : 0));
            loadedLogs.push({
              id: doc.id,
              timestamp: data.timestamp || new Date().toISOString(),
              vehicleModel: data.vehicleModel || "Onbekend",
              licensePlate: data.licensePlate || "Onbekend",
              aiSuggestedTotalAE: aiAE,
              userActualTotalAE: userAE,
              reasons: data.reasons || [],
              notes: data.notes || "",
              images: data.images || [],
              calculationText: data.calculationText || ""
            });
          });
          // Sort descending by timestamp
          loadedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setTrainingLogs(loadedLogs);
        } catch (err) {
          console.error("Fout bij laden van training logs uit Firestore, fallback naar localStorage:", err);
          loadLocalLogs();
        }
      } else {
        loadLocalLogs();
      }
    };

    const loadLocalLogs = () => {
      const stored = localStorage.getItem("partverify_ai_training_logs");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const updatedParsed = parsed.map((log: any) => ({
            ...log,
            aiSuggestedTotalAE: log.aiSuggestedTotalAE || (log.aiSuggestedTotalHours ? log.aiSuggestedTotalHours * 10 : 0),
            userActualTotalAE: log.userActualTotalAE || (log.userActualTotalHours ? log.userActualTotalHours * 10 : 0)
          }));
          setTrainingLogs(updatedParsed);
        } catch (e) {
          console.error(e);
        }
      }
    };

    loadLogs();
  }, [db, userId]);

  // Auto-Analyse engine: Start analyzing automatically when all images are ready and calculation is linked
  useEffect(() => {
    if (!autoAnalyse || images.length === 0 || isAnalyzing || analysisResult) {
      return;
    }

    // Check if any image is still being anonymized
    const allProcessed = images.every(img => !img.isAnonymizing && img.originalUrl);
    if (!allProcessed) {
      return;
    }

    // Check if we need to wait for a calculation link
    if (linkCalculation) {
      const activeCalc = calcInput || customCalcInput;
      if (!activeCalc || activeCalc.trim().length === 0) {
        return; // Wait until calculation is linked or pasted
      }
    }

    // Generate a unique fingerprint of the current state
    const currentFingerprint = images.map(img => img.id).sort().join(",") + 
      "::" + (linkCalculation ? (calcInput || customCalcInput) : "raw");

    if (currentFingerprint === lastAutoAnalyzedIds) {
      return;
    }

    setLastAutoAnalyzedIds(currentFingerprint);
    
    // Trigger analysis with a tiny timeout to allow state stabilization
    const timer = setTimeout(() => {
      handleAnalyzeDamage();
    }, 250);

    return () => clearTimeout(timer);
  }, [
    images, 
    autoAnalyse, 
    isAnalyzing, 
    analysisResult, 
    linkCalculation, 
    calcInput, 
    customCalcInput, 
    lastAutoAnalyzedIds
  ]);

  // Compute calibration statistics (how much system is adjusted to user patterns in AE)
  const stats = useMemo(() => {
    if (trainingLogs.length === 0) {
      return { count: 0, avgDiff: 0, status: "Niet gekalibreerd" };
    }
    let totalDiff = 0;
    trainingLogs.forEach(log => {
      totalDiff += (log.userActualTotalAE - log.aiSuggestedTotalAE);
    });
    const avgDiff = totalDiff / trainingLogs.length;
    let status = "Gebalanceerd";
    if (avgDiff > 4.5) {
      status = `Danny-Plus (+${avgDiff.toFixed(1)} AE gemiddelde correctie)`;
    } else if (avgDiff < -4.5) {
      status = `Danny-Focus (${avgDiff.toFixed(1)} AE gemiddelde correctie)`;
    } else {
      status = `Gebalanceerd (${avgDiff >= 0 ? "+" : ""}${avgDiff.toFixed(1)} AE)`;
    }
    return {
      count: trainingLogs.length,
      avgDiff,
      status
    };
  }, [trainingLogs]);

  // Add a training event
  const handleFeedModel = async () => {
    const actualAENum = parseInt(userActualHours, 10);
    if (isNaN(actualAENum) || actualAENum < 0) {
      alert("Voer a.u.b. een geldig positief aantal arbeidseenheden (AE) in.");
      return;
    }

    setIsFeeding(true);
    setFeedSuccess(false);

    // Save image base64 payloads and active calculation inputs with the training event
    const imagePayloads = images.map(img => img.anonymizedUrl || img.originalUrl);
    const activeCalc = calcInput || customCalcInput;

    const newLog: Omit<AIToolTrainingLog, "id"> & { id?: string; userId?: string } = {
      timestamp: new Date().toISOString(),
      vehicleModel: vehicleModel || "Onbekend model",
      licensePlate: licensePlate || "Onbekend",
      aiSuggestedTotalAE: analysisResult ? (analysisResult.suggested_total_ae || Math.round((analysisResult.suggested_total_hours || 0) * 10)) : 0,
      userActualTotalAE: actualAENum,
      reasons: selectedReasons.length > 0 ? selectedReasons : ["Algemene correctie"],
      notes: calibrationNotes,
      images: imagePayloads,
      calculationText: activeCalc || ""
    };

    try {
      if (db && userId) {
        newLog.userId = userId;
        const docRef = await addDoc(collection(db, "ai_training_logs"), newLog);
        const logWithId: AIToolTrainingLog = { ...newLog, id: docRef.id } as AIToolTrainingLog;
        setTrainingLogs(prev => [logWithId, ...prev]);
      } else {
        const localLog: AIToolTrainingLog = {
          ...newLog,
          id: Math.random().toString(36).substring(2, 9)
        } as AIToolTrainingLog;
        const updated = [localLog, ...trainingLogs];
        setTrainingLogs(updated);
        localStorage.setItem("partverify_ai_training_logs", JSON.stringify(updated));
      }

      setFeedSuccess(true);
      setUserActualHours("");
      setSelectedReasons([]);
      setCalibrationNotes("");
      
      setTimeout(() => setFeedSuccess(false), 4500);
    } catch (err) {
      console.error("Fout bij opslaan leermoment in database, fallback:", err);
      // Fallback local save
      const localLog: AIToolTrainingLog = {
        ...newLog,
        id: Math.random().toString(36).substring(2, 9)
      } as AIToolTrainingLog;
      const updated = [localLog, ...trainingLogs];
      setTrainingLogs(updated);
      localStorage.setItem("partverify_ai_training_logs", JSON.stringify(updated));
      setFeedSuccess(true);
      setTimeout(() => setFeedSuccess(false), 4500);
    } finally {
      setIsFeeding(false);
    }
  };

  // Delete a training event
  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Weet u zeker dat u dit leermoment of deze calibratie wilt wissen voor het model?")) return;

    try {
      if (db && userId) {
        await deleteDoc(doc(db, "ai_training_logs", logId));
      }
      const updated = trainingLogs.filter(log => log.id !== logId);
      setTrainingLogs(updated);
      if (!userId || !db) {
        localStorage.setItem("partverify_ai_training_logs", JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Fout bij verwijderen training log, fallback lokaal:", err);
      const updated = trainingLogs.filter(log => log.id !== logId);
      setTrainingLogs(updated);
      localStorage.setItem("partverify_ai_training_logs", JSON.stringify(updated));
    }
  };

  // Helper: Client-side canvas anonymizer (blurs faces & license plates stylishly)
  const anonymizeImageOnCanvas = (base64Str: string, detections: any[]): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        // Draw original
        ctx.drawImage(img, 0, 0);

        // Apply dark privacy masks
        detections.forEach((det: any) => {
          let left = (det.xmin / 1000) * canvas.width;
          let top = (det.ymin / 1000) * canvas.height;
          let width = ((det.xmax - det.xmin) / 1000) * canvas.width;
          let height = ((det.ymax - det.ymin) / 1000) * canvas.height;

          // Expand bounding box slightly for absolute safety and complete coverage
          if (det.label === "license_plate") {
            const padX = width * 0.08; // 8% safety padding on each side
            const padY = height * 0.05; // 5% safety padding on top/bottom
            left = Math.max(0, left - padX);
            top = Math.max(0, top - padY);
            width = Math.min(canvas.width - left, width + 2 * padX);
            height = Math.min(canvas.height - top, height + 2 * padY);
          } else {
            const pad = Math.min(width, height) * 0.06;
            left = Math.max(0, left - pad);
            top = Math.max(0, top - pad);
            width = Math.min(canvas.width - left, width + 2 * pad);
            height = Math.min(canvas.height - top, height + 2 * pad);
          }

          ctx.save();
          if (det.label === "license_plate") {
            // Draw secure black-charcoal box with golden border
            ctx.fillStyle = "#1e293b"; 
            ctx.fillRect(left, top, width, height);

            ctx.strokeStyle = "#fbbf24"; 
            ctx.lineWidth = Math.max(3, width * 0.04);
            ctx.strokeRect(left, top, width, height);

            // Privacy text
            const fontSize = Math.max(8, Math.min(18, height * 0.35));
            ctx.font = `bold ${fontSize}px font-mono, sans-serif`;
            ctx.fillStyle = "#fbbf24";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("KENTEKEN GEBLURD", left + width / 2, top + height / 2);
          } else if (det.label === "face" || det.label === "person") {
            // Circle/oval mask for human elements
            ctx.beginPath();
            ctx.ellipse(
              left + width / 2,
              top + height / 2,
              width / 2,
              height / 2,
              0, 0, 2 * Math.PI
            );
            ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = Math.max(1.5, width * 0.02);
            ctx.stroke();

            // Privacy label
            const fontSize = Math.max(7, Math.min(15, height * 0.25));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = "#cbd5e1";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("PRIVACY", left + width / 2, top + height / 2);
          }
          ctx.restore();
        });

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  // Process a selected or dropped file
  const handleFileProcess = async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    // Clear previous result to make room for new analysis
    setAnalysisResult(null);

    const id = Math.random().toString(36).substring(2, 9);
    const newImageObj: UploadedImage = {
      id,
      name: file.name || `geplakte-foto-${id}.png`,
      originalUrl: "",
      anonymizedUrl: "",
      isAnonymizing: true,
      detections: []
    };

    // Add immediate loading placeholder
    setImages(prev => [...prev, newImageObj]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Str = e.target?.result as string;
      if (!base64Str) return;

      // Update with original base64
      setImages(prev => prev.map(img => img.id === id ? { ...img, originalUrl: base64Str } : img));

      try {
        // Step 1: Request anonymization coordinates from secure server-side Gemini
        const response = await fetch("/api/privacy/anonymize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64Str, mimeType: file.type })
        });

        if (!response.ok) {
          throw new Error("Detections error");
        }

        const data = await response.json();
        const detections = data.detections || [];

        // Step 2: Draw on offscreen canvas to paint privacy bars
        const anonBase64 = await anonymizeImageOnCanvas(base64Str, detections);

        // Update image with the sanitized result
        setImages(prev => prev.map(img => 
          img.id === id ? { 
            ...img, 
            anonymizedUrl: anonBase64, 
            detections, 
            isAnonymizing: false 
          } : img
        ));
      } catch (err) {
        console.error("Failed to anonymize, fallback to original", err);
        setImages(prev => prev.map(img => 
          img.id === id ? { ...img, anonymizedUrl: base64Str, isAnonymizing: false } : img
        ));
      }
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste effect
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Avoid uploading images if the user is explicitly focused on textareas or inputs
      if (
        document.activeElement?.tagName === "TEXTAREA" || 
        document.activeElement?.tagName === "INPUT"
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const pastedFile = new File(
              [file], 
              `plak-beeld-${Math.floor(Date.now() / 1000)}-${i}.png`, 
              { type: file.type }
            );
            handleFileProcess(pastedFile);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      Array.from(e.dataTransfer.files).forEach(handleFileProcess);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach(handleFileProcess);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  // Click on active zoomed image to manually blur/anonymize missed license plates or faces
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!activeImage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert relative click coordinate to 0-1000 scale (matching Gemini spec)
    const pX = (clickX / rect.width) * 1000;
    const pY = (clickY / rect.height) * 1000;

    // Define box dimensions centered at clicked coordinates
    const halfW = 75; // 150 total width
    const halfH = 25; // 50 total height
    
    const xmin = Math.round(Math.max(0, pX - halfW));
    const xmax = Math.round(Math.min(1000, pX + halfW));
    const ymin = Math.round(Math.max(0, pY - halfH));
    const ymax = Math.round(Math.min(1000, pY + halfH));

    const newDetection = {
      label: "license_plate",
      xmin,
      xmax,
      ymin,
      ymax,
      isManual: true,
    };

    const updatedDetections = [...activeImage.detections, newDetection];

    // Redraw privacy bars on original base64 canvas
    const anonBase64 = await anonymizeImageOnCanvas(activeImage.originalUrl, updatedDetections);

    const updatedImg = {
      ...activeImage,
      detections: updatedDetections,
      anonymizedUrl: anonBase64,
    };

    setActiveImage(updatedImg);
    setImages(prev => prev.map(img => img.id === activeImage.id ? updatedImg : img));
  };

  // Submit anonymized images to the AI Repair Advisor
  const handleAnalyzeDamage = async () => {
    if (images.length === 0) {
      alert("⚠️ Upload s.v.p. ten minste één schadefoto om de analyse en schrijfstijl-matching te kunnen starten!");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    // Dynamic loading checklist step logic
    const steps = [
      "Bezig met scannen van carrosseriedelen...",
      "Analyse van deuken, krassen en materiaalvervorming...",
      "Toepassen van auditspecifieke herstelrichtlijnen...",
      "Berekenen van herstel- en plaatwerktijden..."
    ];

    let currentStepIdx = 0;
    setCurrentStep(steps[currentStepIdx]);
    
    const interval = setInterval(() => {
      if (currentStepIdx < steps.length - 1) {
        currentStepIdx++;
        setCurrentStep(steps[currentStepIdx]);
      }
    }, 2000);

    try {
      // Create a clean payload with only anonymized images
      const payloadImages = images.map(img => ({
        image: img.anonymizedUrl || img.originalUrl,
        mimeType: "image/jpeg"
      }));

      const contextPayload = {
        license_plate: licensePlate || "Onbekend",
        vehicle_model: vehicleModel || "Onbekend",
        client_notes: additionalNotes,
        linked_calculation: linkCalculation ? (calcInput || customCalcInput) : null,
        learning_feedback_history: trainingLogs.slice(0, 10).map(log => ({
          vehicleModel: log.vehicleModel,
          aiSuggestedTotalAE: log.aiSuggestedTotalAE,
          userActualTotalAE: log.userActualTotalAE,
          reasons: log.reasons,
          notes: log.notes
        }))
      };

      const response = await fetch("/api/photos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: payloadImages, context: contextPayload })
      });

      if (!response.ok) {
        throw new Error("Fout bij ophalen hersteladvies.");
      }

      const result = await response.json();
      setAnalysisResult(result);
    } catch (err: any) {
      console.error(err);
      alert("Helaas is de foto-analyse mislukt. Probeer het opnieuw of meld dit bij Danny.");
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
      setCurrentStep("");
    }
  };

  const copyToClipboard = () => {
    if (!analysisResult) return;

    const totalAE = analysisResult.suggested_total_ae || (analysisResult.suggested_total_hours ? Math.round(analysisResult.suggested_total_hours * 10) : 0);
    const convertedHours = (totalAE / 10).toFixed(1);

    const textToCopy = `
=== CARVERIFY PRO AI HERSTELADVIES ===
Dossier: ${licensePlate || 'Onbekend'} (${vehicleModel || 'Onbekend'})
Totaal geadviseerd herstel: ${totalAE} AE (~${convertedHours} uur) (Betrouwbaarheid: ${analysisResult.confidence_percentage}%)

SAMENVATTING:
${analysisResult.summary}

WERKZAAMHEDEN BREAKDOWN (in AE):
${analysisResult.breakdown.map((item, idx) => {
  const itemAE = item.suggested_ae || (item.suggested_hours ? Math.round(item.suggested_hours * 10) : 0);
  return `
- Part ${idx + 1}: ${item.component}: ${item.damage_description}
  Geadviseerd: ${itemAE} AE (~${(itemAE * 6)} minuten) (${item.recommended_action})
  Argumentatie: ${item.reasoning}
`;
}).join("")}

TECHNISCHE TIPS & AUDIT RICHTLIJNEN:
${analysisResult.technical_tips.map(tip => `- ${tip}`).join("\n")}
`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      
      {/* Intro Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 bg-blue-100 text-blue-700 font-black rounded-lg text-[9px] uppercase tracking-wider">
              {mode === 'analysis' ? 'Snelle Schatting' : 'Model Kalibratie'}
            </span>
            <span className="p-1 px-2.5 bg-emerald-100 text-emerald-700 font-black rounded-lg text-[9px] uppercase tracking-wider flex items-center gap-1">
              <Shield size={10} /> AVG Privacy Filter
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">
            {mode === 'analysis' ? '📸 CarVerify Pro — Snelle Foto-Schatting' : '🎓 CarVerify Training Centre — AI Voeden & Kalibreren'}
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl font-medium">
            {mode === 'analysis' 
              ? "Sleep herstelfoto's in het venster om direct kentekens & gezichten onherkenbaar te maken. De AI geeft u vervolgens direct advies hoeveel AE u kunt opvoeren op basis van de visuele schade."
              : "Voer herstelfoto's in én plak de bijbehorende eindcalculatie om de AI te trainen op uw specifieke schrijfstijl. Kalibreer vervolgens het model zodat toekomstige automatische controles vanzelfsprekend foutloos verlopen."
            }
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Side: Image Upload and List */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Stap 1: Foto's Selecteren, Slepen of Plakken</h3>
            
            {/* Drag & Drop & Paste Box */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 select-none relative ${
                dragActive 
                  ? "border-blue-500 bg-blue-50/50 scale-[1.01]" 
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/30 hover:bg-slate-50/80"
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileInput}
                multiple 
                accept="image/*" 
                className="hidden" 
              />
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                <Camera size={22} />
              </div>
              <p className="text-sm font-bold text-slate-700">Sleep hier uw herstelfoto's</p>
              <p className="text-xs text-slate-400 mt-1">Druk op <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px] font-mono shadow-sm font-bold">Ctrl+V</kbd> of <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px] font-mono shadow-sm font-bold">Cmd+V</kbd> om te plakken, of klik om te kiezen</p>
              
              <div className="mt-4 flex items-center gap-2.5 text-[10px] bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 font-extrabold uppercase tracking-wide">
                <Lock size={12} />
                <span>Kentekens & Gezichten worden autom. onleesbaar gemaakt</span>
              </div>
            </div>

            {/* Uploaded List */}
            {images.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">
                  <span>In behandeling ({images.length})</span>
                  <button onClick={() => setImages([])} className="text-slate-400 hover:text-rose-500 transition-colors">Alles Wissen</button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {images.map((img) => (
                    <div 
                      key={img.id}
                      className="relative rounded-2xl border border-slate-150 overflow-hidden bg-slate-50 group aspect-[4/3] flex flex-col"
                    >
                      {img.isAnonymizing ? (
                        <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm flex flex-col items-center justify-center text-center p-3">
                          <Loader2 className="animate-spin text-blue-600 mb-1.5" size={20} />
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Privacy Filter...</span>
                        </div>
                      ) : (
                        <>
                          <img 
                            src={img.anonymizedUrl || img.originalUrl} 
                            alt={img.name} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                            <span className="flex items-center gap-1 text-[8px] bg-emerald-600 text-white font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                              <Lock size={8} /> VEILIG
                            </span>
                            {img.detections.length > 0 && (
                              <span className="text-[8px] bg-blue-600 text-white font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                                {img.detections.length} Redacties
                              </span>
                            )}
                          </div>
                          
                          {/* Trash/Eye Button overlays */}
                          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            <button 
                              onClick={() => setActiveImage(img)}
                              className="p-2 bg-white/10 hover:bg-white text-white hover:text-slate-950 rounded-full transition-all"
                              title="Bekijk ingezoomd"
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={() => removeImage(img.id)}
                              className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-full transition-all"
                              title="Verwijder"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Linked Calculation Section */}
            {mode === 'training' && (
              <div className="space-y-3 bg-slate-50 border border-slate-250/60 p-5 rounded-2xl animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 px-2 py-0.5 bg-blue-100 text-blue-700 font-extrabold rounded-md text-[9px] uppercase tracking-wide flex items-center gap-1 shadow-sm border border-blue-200">
                      <CheckCircle2 size={10} /> Slimme Koppeling
                    </span>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-extrabold">Eindcalculatie Koppelen</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={linkCalculation} 
                      onChange={(e) => setLinkCalculation(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {linkCalculation ? (
                  <div className="space-y-2">
                    {calcInput ? (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                          <span>● Gekoppeld vanuit calculatietab</span>
                          <span>{calcInput.trim().split("\n").filter(line => line.trim().length > 0).length} Regels</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg text-[10px] font-mono font-medium max-h-[100px] overflow-y-auto text-slate-600 whitespace-pre-wrap border border-slate-100">
                          {calcInput}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-500 font-medium">
                          Er is momenteel geen eindcalculatie ingevoerd in het dossier. Plak uw calculatietekst hieronder om de AI uw schrijfstijl te leren en te matchen met foto's:
                        </p>
                        <textarea
                          value={customCalcInput}
                          onChange={(e) => setCustomCalcInput(e.target.value)}
                          placeholder="Plak hier uw handmatige eindcalculatie (bijv: 'Bumper herstellen 2.5, Spuitwerkzaamheden 3.0')"
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none h-20 resize-none"
                        />
                      </div>
                    )}
                    
                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                      De AI zal deze eindcalculatie direct matchen tegen de geüploade schadefoto's om te leren hoe u specifieke carrosseriedelen beoordeelt, en stemt het advies daar intelligent op af.
                    </p>
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-400 font-medium italic">
                    Eindcalculatie koppelen is uitgeschakeld. Het model geeft een standaard objectieve schatting uitsluitend op basis van de foto's.
                  </p>
                )}
              </div>
            )}

            {/* Bliksem-Analyse Auto-Trigger Switch */}
            <div className="bg-emerald-50/40 border border-emerald-150 p-4 rounded-2xl flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ⚡ Bliksem-Analyse (Auto-Run)
                </span>
                <p className="text-[10px] text-slate-500 font-medium">
                  Analyseer en match automatisch zodra foto's & calculatie klaargezet zijn! Nooit meer handmatig klikken.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={autoAnalyse} 
                  onChange={(e) => setAutoAnalyse(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Additional Context box */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Aanvullende info over herstel (optioneel)</label>
              <textarea 
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Bijv. 'Speling op linker spatbord na botsing', of 'Alleen uren voor spuiten en uitlijnen verifiëren'..."
                className="w-full p-4 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none h-20 resize-none"
              />
            </div>

            {/* Informational flow prompt */}
            <div className="bg-blue-50/60 border border-blue-105 rounded-2xl p-4 space-y-2 text-xs text-slate-700">
              <span className="font-extrabold text-blue-800 uppercase text-[10px] tracking-wider block">⚡ Start Instructie</span>
              <p className="leading-relaxed">
                {autoAnalyse ? (
                  mode === 'analysis' ? (
                    <span>
                      🎉 <strong>Automatische modus actief</strong>: Zodra uw geüploade foto's geladen zijn, start de schade-schatting direct! U hoeft nergens op te drukken.
                    </span>
                  ) : (
                    <span>
                      🎉 <strong>Automatische modus actief</strong>: Zodra uw geüploade foto's geladen zijn en de calculatie gekoppeld is, start de kalibratie-analyse direct!
                    </span>
                  )
                ) : (
                  <span>
                    Nadat u de <strong>foto's</strong> {mode === 'training' && "en de eindcalculatie"} online heeft klaargezet, dient u handmatig op de knop hieronder te klikken om de {mode === 'analysis' ? "schatting" : "kalibratie"} te starten.
                  </span>
                )}
              </p>
            </div>

            {/* Analyze Button */}
            <button 
              onClick={handleAnalyzeDamage}
              disabled={isAnalyzing}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black rounded-2xl hover:shadow-xl hover:shadow-blue-100 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-3 uppercase tracking-wider text-xs"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Berekenen...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Vraag AI Hersteladvies aan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Damage Estimation Audit Results */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div 
                key="loader"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[400px] space-y-6"
              >
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin flex items-center justify-center" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Wrench className="text-blue-600 animate-pulse" size={20} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider animate-pulse">PartVerify Pro Damage Assessment</h4>
                  <p className="text-xs text-blue-600 font-bold italic">{currentStep}</p>
                  <p className="text-[10px] text-slate-400">Ongeveer 10 tot 15 seconden resterend...</p>
                </div>
              </motion.div>
            ) : analysisResult ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6"
              >
                
                {/* Header of results */}
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">AI Hersteladvies</h3>
                      {linkCalculation && (
                        <span className="flex items-center gap-1 text-[8px] bg-indigo-50 text-indigo-700 border border-indigo-150 font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                          <GraduationCap size={9} /> Danny's Stijl Actief
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Fotokwaliteit betrouwbaarheid: <span className="text-emerald-600">{analysisResult.confidence_percentage}%</span></p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={copyToClipboard}
                      className="p-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl transition-all text-slate-600 hover:text-slate-900"
                      title="Kopieer herstelverslag naar het klembord"
                    >
                      {copied ? <Check className="text-emerald-600" size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Total AE circle block */}
                <div className="bg-gradient-to-br from-blue-550 to-blue-600 text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex items-center justify-between">
                  <div className="space-y-1 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">Geadviseerd Totaal</span>
                    <h4 className="text-4xl font-extrabold tracking-tighter flex items-center gap-2">
                      {analysisResult.suggested_total_ae || Math.round((analysisResult.suggested_total_hours || 0) * 10)} <span className="text-lg font-medium">AE</span>
                    </h4>
                    <p className="text-[10px] text-blue-100 font-medium">Schatting gebaseerd op optische carrosserieschade (~{((analysisResult.suggested_total_ae || Math.round((analysisResult.suggested_total_hours || 0) * 10)) / 10).toFixed(1)} uur)</p>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-sm self-center">
                    <Wrench size={24} />
                  </div>
                </div>

                {/* Summary text */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} className="text-indigo-600" />
                    <span>Expertise Samenvatting</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                    {analysisResult.summary}
                  </p>
                </div>

                {/* Part breakdown cards */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gedetecteerde schade per carrosseriedeel</h4>
                  <div className="space-y-3">
                    {analysisResult.breakdown.map((item, idx) => {
                      const itemAE = item.suggested_ae || Math.round((item.suggested_hours || 0) * 10);
                      return (
                        <div key={idx} className="border border-slate-150 rounded-2xl p-4 flex gap-4 hover:border-blue-450 transition-colors bg-slate-50/50">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-black">{idx + 1}</span>
                          </div>
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <h5 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">{item.component}</h5>
                              <span className="text-[10px] bg-blue-100 text-blue-700 font-black uppercase tracking-wider px-2 py-0.5 rounded-full self-start">
                                {itemAE} AE / {item.recommended_action}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500"><span className="font-bold text-slate-700">Gedetecteerd:</span> {item.damage_description}</p>
                            <p className="text-xs text-slate-450 leading-relaxed"><span className="font-bold text-slate-700">Argumentatie:</span> {item.reasoning}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Technical tips */}
                {analysisResult.technical_tips.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <span>Belangrijke Audittips & Richtlijnen</span>
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500 font-medium">
                      {analysisResult.technical_tips.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Apply suggested AE button */}
                {onApplySuggestedAE && (
                  <button 
                    onClick={() => {
                      const totalAE = analysisResult.suggested_total_ae || Math.round((analysisResult.suggested_total_hours || 0) * 10);
                      onApplySuggestedAE(totalAE);
                      alert(`Totaal herstel-tijd (${totalAE} AE) is als override toegepast op uw dossier!`);
                    }}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>AE Overnemen in dossier</span>
                  </button>
                )}

                {/* Calibration Feedback section (Voeden) */}
                {mode === 'training' && (
                  <div className="border border-slate-150 p-5 rounded-3xl pt-6 mt-6 space-y-4 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                        <GraduationCap size={16} />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">AI Model Voeden & Trainen ("Danny's Expertise")</h4>
                        <p className="text-[10px] text-slate-400">Corrigeer de AI op basis van uw herstelexpertise zodat het model hiervan leert in AE</p>
                      </div>
                    </div>

                    {feedSuccess ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-800 flex items-start gap-3"
                      >
                        <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                        <div>
                          <span className="font-extrabold block">Leermodel Succesvol Gevoed!</span>
                          Toekomstige fotoverificaties op dit dossier worden gekalibreerd volgens uw Danny Radjkoemar-expertiseniveau.
                        </div>
                      </motion.div>
                    ) : (
                      <div className="space-y-3.5 bg-white p-4 rounded-2xl border border-slate-150">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Hoeveel AE zou u hier echt schrijven? (10 AE = 1 uur)</label>
                          <div className="relative">
                            <input 
                              type="number"
                              step="1"
                              placeholder={(analysisResult.suggested_total_ae || Math.round((analysisResult.suggested_total_hours || 0) * 10)).toString()}
                              value={userActualHours}
                              onChange={(e) => setUserActualHours(e.target.value)}
                              className="w-full bg-white p-3 pr-12 border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none"
                            />
                            <span className="absolute right-3 top-3 text-slate-400 text-xs font-bold">AE</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Reden van correctie / leermateriaal</label>
                          <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-600">
                            {[
                              "Plaatwerk intensiever",
                              "Speciale lak (parelmoer)",
                              "Verborgen ADAS kalibratie",
                              "Demonteren / monteren uren",
                              "Materiaalvervanging vereist",
                              "Richtbank noodzakelijk"
                            ].map((reason) => {
                              const active = selectedReasons.includes(reason);
                              return (
                                <button
                                  key={reason}
                                  type="button"
                                  onClick={() => {
                                    if (active) {
                                      setSelectedReasons(prev => prev.filter(r => r !== reason));
                                    } else {
                                      setSelectedReasons(prev => [...prev, reason]);
                                    }
                                  }}
                                  className={`p-2 text-left rounded-lg border transition-all ${
                                    active 
                                      ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  {reason}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Aantekeningen voor de AI (optioneel)</label>
                          <textarea
                            placeholder="Bijv. 'Dampers en sensoren moeten opnieuw geprogrammeerd worden bij deze bumper...'"
                            value={calibrationNotes}
                            onChange={(e) => setCalibrationNotes(e.target.value)}
                            className="w-full bg-white p-3 border border-slate-200 rounded-xl text-[11px] font-medium focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none h-16 resize-none"
                          />
                        </div>

                        <button
                          onClick={handleFeedModel}
                          disabled={!userActualHours || isFeeding}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-550 disabled:opacity-50 text-white text-[11px] font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          {isFeeding ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              <span>Bezig met kalibreren...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              <span>Dien in als Leermateriaal (Voed AI)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </motion.div>
            ) : mode === 'training' ? (
              <motion.div 
                key="training-standalone"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6"
              >
                {/* Visual Header */}
                <div className="flex items-center gap-3 border-b pb-4">
                  <div className="p-2.5 bg-blue-550/10 text-blue-600 rounded-xl">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-705 uppercase tracking-wider">Met herstelfoto's AI Trainen</h3>
                    <p className="text-[10px] text-slate-400">Verbind foto's direct aan uw gewenste eindcalculatie en AE</p>
                  </div>
                </div>

                {/* Show thumbnail references if they've uploaded something */}
                {images.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block">Gekoppelde Foto's ({images.length})</span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {images.map(img => (
                        <div key={img.id} className="w-12 h-12 rounded-lg border overflow-hidden shrink-0 bg-slate-100 relative">
                          <img src={img.anonymizedUrl || img.originalUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 flex items-center gap-2 font-medium">
                    <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                    <span>Upload eerst herstelfoto's aan de linkerkant om de AI visueel te voeden.</span>
                  </div>
                )}

                {/* Training Form Fields */}
                {feedSuccess ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-800 flex items-start gap-3"
                  >
                    <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                    <div>
                      <span className="font-extrabold block">Trainings-object succesvol opgeslagen!</span>
                      De foto's, calculatie en de opgegeven {userActualHours || "AE"} AE zijn stevig verankerd in uw AI-leermodel.
                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Hoeveel AE schrijft u hier? (10 AE = 1 uur)</label>
                      <div className="relative">
                        <input 
                          type="number"
                          step="1"
                          placeholder="Bijv. 25"
                          value={userActualHours}
                          onChange={(e) => setUserActualHours(e.target.value)}
                          className="w-full bg-slate-50/50 p-3 pr-12 border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none"
                        />
                        <span className="absolute right-3 top-3 text-slate-400 text-xs font-bold">AE</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Gekoppelde Eindcalculatie</label>
                      {calcInput ? (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                          <div className="flex items-center justify-between text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                            <span>● Gekoppeld van dossier</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg text-[10px] font-mono font-medium max-h-[80px] overflow-y-auto text-slate-600 whitespace-pre-wrap border border-slate-100">
                            {calcInput}
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={customCalcInput}
                          onChange={(e) => setCustomCalcInput(e.target.value)}
                          placeholder="Plak hier de bijbehorende eindcalculatieregel(s)... (optioneel)"
                          className="w-full p-3 bg-slate-50/55 border border-slate-200 rounded-xl text-xs font-medium focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none h-16 resize-none"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Reden van correctie / leermateriaal</label>
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-600">
                        {[
                          "Plaatwerk intensiever",
                          "Speciale lak (parelmoer)",
                          "Verborgen ADAS kalibratie",
                          "Demonteren / monteren uren",
                          "Materiaalvervanging vereist",
                          "Richtbank noodzakelijk"
                        ].map((reason) => {
                          const active = selectedReasons.includes(reason);
                          return (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => {
                                if (active) {
                                  setSelectedReasons(prev => prev.filter(r => r !== reason));
                                } else {
                                  setSelectedReasons(prev => [...prev, reason]);
                                }
                              }}
                              className={`p-1.5 text-left rounded-lg border text-[9px] transition-all truncate ${
                                active 
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {reason}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase">Aantekeningen / Opmerkingen (optioneel)</label>
                      <textarea
                        placeholder="Voeg specifieke aantekeningen toe die de AI moet begrijpen..."
                        value={calibrationNotes}
                        onChange={(e) => setCalibrationNotes(e.target.value)}
                        className="w-full bg-slate-50/20 p-2.5 border border-slate-200 rounded-xl text-[11px] font-medium focus:ring-4 focus:ring-blue-150 focus:border-blue-500 outline-none h-14 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleFeedModel}
                      disabled={!userActualHours || isFeeding || images.length === 0}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-550 disabled:opacity-50 text-white text-[11px] font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {isFeeding ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Bezig met kalibreren...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} />
                          <span>Dien in als Leermateriaal (Voed AI)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-slate-50/50 border border-slate-200 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[400px] text-slate-400 space-y-4"
              >
                <div className="w-14 h-14 bg-white border rounded-full flex items-center justify-center text-slate-300 shadow-sm">
                  <Sparkles size={24} />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h4 className="font-bold text-slate-700 text-sm">Nog geen advies berekend</h4>
                  <p className="text-xs">Upload een of meerdere schadefoto's aan de linkerkant en druk op "Vraag hersteladvies aan" om de audit te starten.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* AI Trainingscentrum Dashboard Block */}
      {mode === 'training' && (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <GraduationCap size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">🎓 Danny's AI Trainingscentrum ("Feedback & Leren")</h3>
              <p className="text-xs text-slate-400">Volg en beheer hoe de AI zich continu aanpast aan uw herstelwerkvoorkeur</p>
            </div>
          </div>
          <button 
            onClick={() => setShowLogsCenter(prev => !prev)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold rounded-xl text-xs transition-colors flex items-center gap-2 self-start sm:self-center uppercase tracking-wider"
          >
            <BookOpen size={14} />
            <span>{showLogsCenter ? "Sluit Trainingscentrum" : "Open Trainingscentrum & Historie"}</span>
          </button>
        </div>

        {/* Dynamic calibration stats blocks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-sm border border-blue-100">
              <BarChart3 size={20} />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Geleerde dossiers</span>
              <h4 className="text-lg font-black text-slate-800">{stats.count} stuks</h4>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm border border-indigo-100">
              <TrendingUp size={20} />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Gem. Correctieafwijking</span>
              <h4 className="text-lg font-black text-slate-800">
                {stats.count === 0 ? "0.0 uur" : `${stats.avgDiff >= 0 ? "+" : ""}${stats.avgDiff.toFixed(1)} uur`}
              </h4>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100">
              <Shield size={20} />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Kalibratie Status</span>
              <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full text-center inline-block">
                {trainingLogs.length > 0 ? "Actief Gekalibreerd" : "Standaard Model"}
              </span>
            </div>
          </div>

        </div>

        {/* Collapsible log history of training data */}
        <AnimatePresence>
          {showLogsCenter && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-4 pt-2"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">
                <span>Geregistreerde calibratiedata</span>
                <span>Totaal {trainingLogs.length} calibraties</span>
              </div>

              {trainingLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-medium italic">
                  Er zijn nog geen trainingsdossiers ingevuld. Voer herstelfoto's in, vraag advies aan, en vul het formulier onder het advies in om de AI te voorzien van leermateriaal!
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {trainingLogs.map((log) => {
                    const aiAE = log.aiSuggestedTotalAE || 0;
                    const userAE = log.userActualTotalAE || 0;
                    const diff = userAE - aiAE;
                    return (
                      <div key={log.id} className="p-4 rounded-xl border border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:border-blue-200 transition-colors">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black tracking-wide">
                              {log.licensePlate}
                            </span>
                            <span className="text-xs font-black text-slate-800">
                              {log.vehicleModel}
                            </span>
                            <span className="text-[10px] text-slate-400 font-extrabold">
                              {new Date(log.timestamp).toLocaleDateString("nl-NL")}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {log.reasons.map((reason, idx) => (
                              <span key={idx} className="text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded shadow-sm border border-blue-100">
                                {reason}
                              </span>
                            ))}
                          </div>

                          {log.notes && (
                            <p className="text-[11px] text-slate-500 italic bg-white border border-slate-150 p-3 rounded-xl mt-1.5 shadow-sm max-w-xl">
                              "{log.notes}"
                            </p>
                          )}

                          {log.images && log.images.length > 0 && (
                            <div className="mt-2.5 space-y-1">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Gekoppelde Foto's ({log.images.length})</span>
                              <div className="flex gap-1.5 overflow-x-auto py-0.5">
                                {log.images.map((imgUrl, i) => (
                                  <div 
                                    key={i} 
                                    className="w-10 h-10 rounded-lg border overflow-hidden shrink-0 bg-white cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all shadow-sm"
                                    onClick={() => setSelectedZoomLogImage(imgUrl)}
                                  >
                                    <img src={imgUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {log.calculationText && (
                            <div className="mt-2 text-[10px] space-y-1">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Gekoppelde Eindcalculatie</span>
                              <div className="bg-white px-2 py-1.5 border border-slate-150 rounded-lg text-[9px] font-mono leading-relaxed text-slate-600 max-h-16 overflow-y-auto whitespace-pre-wrap max-w-xl shadow-inner font-medium">
                                {log.calculationText}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 shrink-0 self-end sm:self-center">
                          <div className="text-right font-mono">
                            <div className="text-[9px] text-slate-400 font-bold uppercase">AE Vergelijking</div>
                            <div className="text-xs font-bold text-slate-700">
                              AI: {aiAE} AE ➔ Danny: <span className="text-blue-600 font-black">{userAE} AE</span>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md inline-block mt-1 ${
                              diff > 0 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : diff < 0 
                                  ? "bg-rose-50 text-rose-700 border border-rose-100" 
                                  : "bg-slate-100 text-slate-600 border"
                            }`}>
                              {diff > 0 ? `+${diff} AE` : `${diff} AE`}
                            </span>
                          </div>

                          <button 
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                            title="Verwijder dit leermoment"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* Image zoom Modal */}
      <AnimatePresence>
        {activeImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveImage(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white text-slate-900 rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
            >
              {/* Header */}
              <div className="p-5 border-b flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                    <Lock size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase text-slate-800">{activeImage.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Privacy-Anonieme Behandeling Handmatig Geverifieerd</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveImage(null)}
                  className="px-4 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold rounded-xl text-xs"
                >
                  Sluit inspectie
                </button>
              </div>

              {/* View area */}
              <div className="p-6 bg-slate-900 flex-1 overflow-auto flex flex-col items-center justify-center min-h-[300px]">
                <p className="text-white/80 text-[10px] sm:text-xs font-bold text-center mb-3 flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-sm select-none">
                  <span>💡 Geen perfecte automatische blur? Klik simpelweg op de foto hieronder om handmatig een kenteken te vervagen!</span>
                </p>
                <div className="relative group max-w-full">
                  <img 
                    src={activeImage.anonymizedUrl || activeImage.originalUrl} 
                    alt={activeImage.name} 
                    onClick={handleImageClick}
                    className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-md border-4 border-slate-800 cursor-crosshair hover:brightness-105 active:scale-[99.5%] transition-all"
                    referrerPolicy="no-referrer"
                    title="Klik om extra privacy-vervaging te plaatsen!"
                  />
                </div>
              </div>

              {/* Detections legend */}
              <div className="p-5 bg-slate-50 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-0">Detections:</span>
                  {activeImage.detections.length === 0 ? (
                    <span className="text-xs text-slate-500 font-medium italic">Geen privacygevoelige details gevonden. Klik op de foto om regio te vervagen.</span>
                  ) : (
                    activeImage.detections.map((det: any, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-200 text-slate-700 flex items-center gap-2 border border-slate-300">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span>
                          {det.label === 'license_plate' ? "KENTEKEN" : "GEZICHT"} {det.isManual ? "(HANDMATIG)" : ""}
                        </span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const updatedDetections = activeImage.detections.filter((_: any, i: number) => i !== idx);
                            const anonBase64 = await anonymizeImageOnCanvas(activeImage.originalUrl, updatedDetections);
                            const updatedImg = {
                              ...activeImage,
                              detections: updatedDetections,
                              anonymizedUrl: anonBase64
                            };
                            setActiveImage(updatedImg);
                            setImages(prev => prev.map(img => img.id === activeImage.id ? updatedImg : img));
                          }}
                          className="text-slate-400 hover:text-red-600 transition-colors bg-white hover:bg-red-50 px-1 py-0.5 rounded border text-[10px] font-black"
                          title="Verwijder deze maskering"
                        >
                          WISSEN
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-extrabold uppercase select-none">CarVerify Safeguard Pro</div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simple logged image zoom modal */}
      <AnimatePresence>
        {selectedZoomLogImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedZoomLogImage(null)}
              className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-4xl max-h-[90vh] z-10 rounded-[2rem] overflow-hidden bg-white border shadow-2xl flex flex-col"
            >
              <div className="p-4 bg-slate-50 border-b flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-800">📸 Gekalibreerd Leermateriaal Detail</span>
                <button 
                  onClick={() => setSelectedZoomLogImage(null)}
                  className="p-1 px-2.5 bg-slate-200 hover:bg-slate-300 text-slate-705 font-bold rounded-lg text-xs"
                >
                  Sluiten
                </button>
              </div>
              <div className="p-4 bg-slate-900 overflow-auto flex items-center justify-center min-h-[300px]">
                <img 
                  src={selectedZoomLogImage} 
                  className="max-w-full max-h-[70vh] object-contain rounded-xl border border-slate-800"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
