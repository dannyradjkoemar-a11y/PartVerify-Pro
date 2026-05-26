import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up large payload limits for handling multiple high-res base64 images
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// Initialize GenAI Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API Live Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Privacy Filter: Find license plates, human faces, and persons/people
app.post("/api/privacy/anonymize", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing image data" });
    }

    const cleanMimeType = mimeType || "image/jpeg";
    const cleanBase64 = image.includes("base64,") ? image.split("base64,")[1] : image;

    // Call Gemini 3.5 Flash for rapid and accurate object identification
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: cleanBase64,
          },
        },
        "Detect all license plates, human faces, and people/persons in this image.\n\n" +
        "CRITICAL FOR PRIVACY REGULATION (AVG):\n" +
        "- You must be EXTREMELY AGGRESSIVE and thorough. Do not miss ANY license plates or faces, no matter how small, distant, angled, or dark they are.\n" +
        "- License Plates: Look at the front and back of any vehicle, bumper, trunk, lower grill, trailer, or background. Any rectangular yellow, white, blue, black, or grey plate containing alphanumeric characters or place names MUST be marked. Expand the bounding box coordinates slightly to ensure the entire plate is fully covered.\n" +
        "- Faces: Any human face (even in mirrors, reflections, windows, passenger seats, or the background) must be marked and covered.\n\n" +
        "Return bounding box coordinates scaled from 0 to 1000 (ymin, xmin, ymax, xmax) for each detection. It is always better to over-detect (have slightly larger or extra boxes) than to miss a license plate or face.",
      ],
      config: {
        systemInstruction: "You are an elite automotive privacy auditor. Your absolute highest priority is the GDPR (AVG) compliance. You are tasked with identifying and reporting coordinates (ymin, xmin, ymax, xmax on a scale of 0-1000) for every single license plate, face, or person in the provided image. You must be extremely aggressive. Ignore nothing. Check the far background, reflections, side mirrors, parked vehicles, trailers, windshields, grill regions, and rear bumpers. If there is even a 1% chance a shape is a license plate or face, you MUST mark it. It is better to create overlapping or wide bounding boxes than to omit a single license plate.",
        temperature: 0.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { 
                    type: Type.STRING, 
                    description: "Object type: 'license_plate', 'face', or 'person'" 
                  },
                  ymin: { type: Type.INTEGER, description: "Top coord (0-1000)" },
                  xmin: { type: Type.INTEGER, description: "Left coord (0-1000)" },
                  ymax: { type: Type.INTEGER, description: "Bottom coord (0-1000)" },
                  xmax: { type: Type.INTEGER, description: "Right coord (0-1000)" }
                },
                required: ["label", "ymin", "xmin", "ymax", "xmax"]
              }
            }
          },
          required: ["detections"]
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      return res.json({ detections: [] });
    }

    const result = JSON.parse(textOutput.trim());
    return res.json(result);
  } catch (error: any) {
    console.error("Error during anonymization backend call:", error);
    return res.status(500).json({ error: error.message || "Anonymization failed" });
  }
});

// Repair Advisor: Estimate repair/restoration hours based on uploaded images
app.post("/api/photos/analyze", async (req, res) => {
  try {
    const { images, context } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Missing image data array" });
    }

    const contentsParts: any[] = [];

    // Map all uploaded photos (each structure containing: { image: base64, mimeType: string })
    images.forEach((imgObj: any, index: number) => {
      const cleanMimeType = imgObj.mimeType || "image/jpeg";
      const cleanBase64 = imgObj.image.includes("base64,") ? imgObj.image.split("base64,")[1] : imgObj.image;
      
      contentsParts.push({
        inlineData: {
          mimeType: cleanMimeType,
          data: cleanBase64
        }
      });
    });

    // Append instructions
    const promptText = `
Je bent een ervaren automotive expert en schade-expert (CarVerify Pro damage assessment AI). 
Analyseer de bijgevoegde schadefoto's van de auto grondig en geef professioneel advies over de te verwachten herstelwerkzaamheden en herstelaspecten (zowel plaatwerk, herstel, als spuiten).

BELANGRIJK: We berekenen alle hersteltijden en calculatietijden uitsluitend in Arbeidseenheden (AE).
- 1 AE is 6 minuten.
- 10 AE is 1 uur (60 minuten).
- Dus als een werkzaamheid 1.5 uur in beslag neemt is dit 15 AE. 2.0 uur is 20 AE.
- Zorg ervoor dat alle geschatte tijden (suggested_ae en suggested_total_ae) gehele getallen (integers) in AE zijn!

Houd rekening met de volgende context die door de gebruiker is meegegeven:
${JSON.stringify(context || {}, null, 2)}

BELANGRIJK - ADAPTIEF LEREN (FEEDBACKLOGS / GEBRUIKERSVOORKEUR):
In de context hierboven kan een "learning_feedback_history" array staan. Dit zijn eerdere schattingen van dit systeem (in AE) die de gebruiker handmatig heeft gekalibreerd/gecorrigeerd naar de werkelijkheid.
Analyseer deze logs nauwgezet op patronen:
- Als de gebruiker systematisch voor bepaalde herstelwerkzaamheden of in het algemeen meer of minder AE noteert dan de eerdere AI-schattingen (bijv. +2 AE of +15% omdat spuitwerk intensiever is voor pareleffect), pas de huidige schattingen (suggested_ae en suggested_total_ae) daar direct op aan.
- Wees een slim, lerend schadesoftwaremodel dat zich aanpast aan de Danny Radjkoemar-expertisestandaard.
- Leg bij voorkeur in de "summary" of bij de breakdown argumentatie van de AE kort in het Nederlands uit hoe de eerdere leermomenten en feedbackhistorie deze specifieke AE-schatting hebben gecorrigeerd.

BELANGRIJK - DIRECT LEREN VAN GEKOPPELDE EINDCALCULATIE:
Als er in de context hierboven een "linked_calculation" van kracht is (een handmatige tekstcalculatie/raming):
- Dit is Danny's daadwerkelijke oordeel van de onderdelen op dezelfde foto's. Bestudeer deze tekstuele calculatie nauwgezet.
- Kijk welke onderdelen hij toevoegt en welke hersteltijden of uren/AE hij daarvoor rekent (reken eventueel uren om naar AE: uur * 10).
- Match deze tekstuele gegevens direct met de visuele bewijslast op de schadefoto meegestuurd. Pas je eigen herstelschatting (suggested_ae en suggested_total_ae) zo aan dat ze aansluiten bij het Danny Radjkoemar-calculatieniveau.
- Leg in de "summary" in het Nederlands uit welke concrete schrijfstijlpatronen en specifieke AE/uren-aanpassingen je hebt doorgevoerd n.a.v. de gekoppelde eindcalculatie.

Geef je hersteladvies in het Nederlands en formatteer het antwoord strikt volgens het bijbehorende JSON schema.
Wees realistisch, help schadeherstellers om correcte calculaties op te stellen en voorkom onderbedeling of overbedeling.
`;

    contentsParts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contentsParts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { 
              type: Type.STRING, 
              description: "Korte, krachtige samenvatting in het Nederlands van de geobserveerde schade, de aanbevolen strategie en hoe AE's zijn gecorrigeerd." 
            },
            suggested_total_ae: { 
              type: Type.INTEGER, 
              description: "De totale geschatte hersteltijd in Arbeidseenheden (AE) (som van alle onderdelen, als integer)." 
            },
            confidence_percentage: { 
              type: Type.INTEGER, 
              description: "Betrouwbaarheid van de schatting op basis van fotokwaliteit (percentage tussen 0 en 100)." 
            },
            breakdown: {
              type: Type.ARRAY,
              description: "Specificatie van de herstelwerkzaamheden per carrosseriedeel of onderdeel.",
              items: {
                type: Type.OBJECT,
                properties: {
                  component: { 
                    type: Type.STRING, 
                    description: "Carrosseriedeel of onderdeelnaam (bijv. 'Voorbumper', 'Spatbord linksvoor')." 
                  },
                  damage_description: { 
                    type: Type.STRING, 
                    description: "Beschrijving van de gedetecteerde schade (krassen, deuk, scheur, lakbeschadiging)." 
                  },
                  suggested_ae: { 
                    type: Type.INTEGER, 
                    description: "Geschat aantal Arbeidseenheden (AE) voor dit deel als integer (bijv. 15, 20)." 
                  },
                  recommended_action: { 
                    type: Type.STRING, 
                    description: "Aanbevolen actie (bijv. 'Uitdeuken & Spuiten', 'Spot-repair', 'Compleet vervangen')." 
                  },
                  reasoning: { 
                    type: Type.STRING, 
                    description: "Professionele beargumentering waarom deze AE/acties worden geadviseerd." 
                  }
                },
                required: ["component", "damage_description", "suggested_ae", "recommended_action", "reasoning"]
              }
            },
            technical_tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Aanvullende technische tips of auditspecifieke waarschuwingen (bijv. over verborgen schade, kalibratie noodzaak, ADAS)."
            }
          },
          required: ["summary", "suggested_total_ae", "confidence_percentage", "breakdown", "technical_tips"]
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Geen hersteladvies gegenereerd door Gemini.");
    }

    const result = JSON.parse(textOutput.trim());
    return res.json(result);
  } catch (error: any) {
    console.error("Error during damage photo analysis backend call:", error);
    return res.status(500).json({ error: error.message || "Analyse mislukt" });
  }
});

// Vite & Static file serving setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PartVerify Pro Backend] Status: Online, Port: ${PORT}`);
  });
}

startServer();
