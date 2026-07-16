/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUDATEX_PART_CODES } from "./data/audatexPartCodes";

// Part matching logic and normalization
export const normalizePartNumber = (part: string): string => {
  return part.replace(/[\s,.\-_/]/g, '').toUpperCase();
};

export const extractBasePartNumbers = (description: string, partNumber: string): string[] => {
  const combined = `${partNumber} ${description}`.toUpperCase();
  // Standard VAG part numbers are like "2G7 805 903 B" or "2G7805903b"
  // Let's find sequences of 3 alphanumeric, 3 digits, and 3 alphanumeric
  const regex = /\b([A-Z0-9]{3})[\s\-_]*([0-9]{3})[\s\-_]*([A-Z0-9]{3})\b/gi;
  const matches = [...combined.matchAll(regex)];
  const extracted = matches.map(m => `${m[1]}${m[2]}${m[3]}`.toUpperCase());

  // Also support matching entire single tokens consisting of letters and digits of length 8-12 that contain at least 3 digits
  const tokens = combined.split(/[\s,.\-_/]+/).filter(Boolean);
  for (const token of tokens) {
    const cleanToken = token.replace(/[^A-Z0-9]/gi, "");
    if (cleanToken.length >= 8 && cleanToken.length <= 12) {
      const hasEnoughDigits = (cleanToken.match(/[0-9]/g) || []).length >= 3;
      if (hasEnoughDigits) {
        const base9 = cleanToken.substring(0, 9);
        if (!extracted.includes(base9)) {
          extracted.push(base9);
        }
      }
    }
  }

  return extracted;
};

export interface AutomotivePart {
  id: string;
  description: string;
  partNumber: string;
  price: number;
  originalLine?: string;
  quantity?: number;
}

export const semanticSynonyms: Record<string, string[]> = {
  'voorraam': ['windshield', 'voorruit', 'front screen', 'voorruit'],
  'spatscherm': ['fender', 'wing', 'mudguard', 'paneel', 'wheel arch'],
  'bumper': ['afdekking', 'bumper cover', 'scherm', 'stootstang'],
  'koplamp': ['headlight', 'head lamp', 'lamp', 'verlichting'],
  'kentekenplaat': ['license plate', 'number plate', 'kenteken'],
  'versterking': ['reinforcement', 'support', 'balk', 'bracing'],
  'sierlijst': ['trim', 'molding', 'decor', 'sier'],
  'embleem': ['badge', 'logo', 'emblem', 'firma-embleem'],
  'grille': ['rooster', 'vent', 'gaas', 'luchtinlaat'],
  'wielkuip': ['inner fender', 'wheel housing', 'kuip'],
};

// Improved heuristic to check if descriptions match semantically
export const descriptionsMatch = (desc1: string, desc2: string): boolean => {
  const d1 = desc1.toLowerCase().trim();
  const d2 = desc2.toLowerCase().trim();
  
  if (d1 === d2) return true;
  if (d1.length < 3 || d2.length < 3) return false;

  // Check for specific semantic synonyms
  for (const [key, synonyms] of Object.entries(semanticSynonyms)) {
    const d1HasKey = d1.includes(key);
    const d2HasKey = d2.includes(key);
    const d1HasSyn = synonyms.some(s => d1.includes(s));
    const d2HasSyn = synonyms.some(s => d2.includes(s));

    // If both contain a reference to the same category (e.g. both have 'rooster' or a synonym of 'grille')
    // and they aren't completely different strings
    if ((d1HasKey || d1HasSyn) && (d2HasKey || d2HasSyn)) {
      // Check if they share at least one more specific keyword or position
      const words1 = d1.split(/\s+/).filter(w => w.length > 2);
      const words2 = d2.split(/\s+/).filter(w => w.length > 2);
      const intersection = words1.filter(w => words2.includes(w));
      
      if (intersection.length >= 1) return true;
    }
  }

  // Fallback: If one is a significant substring of the other (more than 70% length)
  if (d1.length > 8 && d2.length > 8) {
    if (d1.includes(d2) && d2.length / d1.length > 0.7) return true;
    if (d2.includes(d1) && d1.length / d2.length > 0.7) return true;
  }

  return false;
};

// Helper to parse currency strings with potential thousand separators (e.g. 1.573,25)
export const parseCurrency = (val: string): number => {
  if (!val) return 0;
  // Remove currency symbols and spaces
  let cleaned = val.replace(/[€\s]/g, "");
  
  // Identify the last separator (dot or comma)
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // Likely European format (1.234,56)
    // Remove all dots (thousand separators) and replace comma with dot
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Likely English format (1,234.56) or just a simple decimal dot (79.28)
    // Check if the dot is a thousand separator (e.g. "1.000") 
    // In this specific automotive context, prices above 1000 with exactly 3 decimals are rare as separators
    // but common as decimals. However, if there are multiple dots, they are thousand separators.
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleaned = cleaned.replace(/\./g, ""); // multi-dots are separators
    } else {
      // Single dot: check if it looks like a thousand separator (exactly 3 digits after it)
      // BUT even then, in car parts 1.234 is often a price.
      // We'll treat a single separator as a decimal unless it's followed by something that isn't 2 digits?
      // Actually, for "79.28", a single dot is always a decimal.
      cleaned = cleaned.replace(/,/g, ""); 
    }
  } else {
    // No dots or commas, just numbers
    cleaned = cleaned.replace(/[^\d.]/g, "");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export const parseCalculation = (text: string): AutomotivePart[] => {
  const lines = text.split('\n');
  const parts: AutomotivePart[] = [];
  const seenIds = new Map<string, number>();

  // Group multi-line entries if price is on the next line (common in Audatex/Solera)
  const mergedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    if (!current) continue;

    const isItemHeader = /^\d{4}\s+/.test(current);
    if (isItemHeader) {
      let nextPriceIndex = -1;
      let priceText = "";

      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed) continue;

        // Check if next line looks strictly like a price (optional Euro or trailing asterisk/letter)
        const isPrice = /^[\d\.,\s]+[*A-Za-z€]?$/.test(nextTrimmed) || /^[€\s]*[\d\.,\s]+[*A-Za-z]?$/.test(nextTrimmed);
        if (isPrice && nextTrimmed.length < 20) {
          nextPriceIndex = j;
          priceText = nextTrimmed;
        }
        break; // Only test the immediate next line
      }

      if (priceText && nextPriceIndex !== -1) {
        mergedLines.push(`${current}    ${priceText}`);
        i = nextPriceIndex; // Skip price line
      } else {
        mergedLines.push(current);
      }
    } else {
      mergedLines.push(current);
    }
  }

  for (const line of mergedLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const idMatch = trimmed.match(/^(\d{4})\b/);
    if (!idMatch) continue;

    const baseId = idMatch[1];
    const remainder = trimmed.substring(4).trim();

    // Check if remainder has a valid numerical price at the end
    // Price pattern: digits, optional dot/comma, optional trailing characters like * or letters (like B or H), with or without spaces
    const priceMatch = remainder.match(/\s+([\d,.]+(?:\s*[*A-Za-z€]+)?)$/i);
    if (!priceMatch) {
      // Skip this line if it doesn't have a numerical price ending (e.g. "ZIE LOSSE DELEN")
      // "Ik zou graag willen zien dat in zón geval code 0350 wordt verwijderd, want deze heeft geen waarde"
      continue;
    }

    const priceStr = priceMatch[1];
    const priceVal = parseCurrency(priceStr);

    if (priceVal <= 0) {
      continue;
    }

    const leftover = remainder.substring(0, remainder.length - priceStr.length).trim();

    // Split leftover by multiple spaces (to separate quantity, description, part numbers if available)
    const partsList = leftover.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);

    let description = "";
    let partNumber = "";
    let quantityValue = 1;

    // Detect quantity pattern at the start (e.g., "2 P", "4 P", "2 STUKS", etc.)
    if (partsList.length > 0) {
      const firstPart = partsList[0];
      const qtyMatch = firstPart.match(/^(\d+)\s*(?:P|STUKS|ST|PCS)$/i);
      if (qtyMatch) {
        quantityValue = parseInt(qtyMatch[1], 10);
        partsList.shift(); // Remove quantity from partsList
      }
    }

    if (partsList.length === 0) {
      description = `Onderdeel ${baseId}`;
    } else if (partsList.length === 1) {
      description = partsList[0];
    } else {
      partNumber = partsList[partsList.length - 1];
      description = partsList.slice(0, partsList.length - 1).join(" ");
    }

    // Auto-enrich description or partNumber from our official Audatex codes dictionary
    const audatexMatch = AUDATEX_PART_CODES.find(p => p.code === baseId);
    if (audatexMatch) {
      if (!description || description === `Onderdeel ${baseId}` || /^\s*$/.test(description)) {
        description = audatexMatch.description;
      }
    }
    if (!partNumber || partNumber === "00000500" || partNumber === "00000000") {
      partNumber = baseId;
    }

    const count = seenIds.get(baseId) || 0;
    const id = count === 0 ? baseId : `${baseId}-${count}`;
    seenIds.set(baseId, count + 1);

    parts.push({
      id: id,
      description: description,
      partNumber: partNumber,
      price: priceVal,
      originalLine: trimmed,
      quantity: quantityValue
    });
  }
  return parts;
};

export const parseInvoice = (text: string): AutomotivePart[] => {
  const lines = text.split('\n');
  const parts: AutomotivePart[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const partNumMatch = trimmed.match(/^([A-Z0-9\s.-]{3,})\s+/);
    if (partNumMatch) {
      const partNumber = partNumMatch[1].trim();
      const lineRemainder = trimmed.substring(partNumMatch[0].length).trim();

      // Remove any percentage groupings (discounts) to avoid picking them up as standard numbers
      const withoutDiscounts = lineRemainder.replace(/[\d,.]+\s*%/g, "").trim();

      // Extract all numeric/currency words
      const numMatches = Array.from(withoutDiscounts.matchAll(/(?:€\s*)?(\d+[,.]\d+|\d+)/g));
      if (numMatches.length >= 2) {
        const lastMatch = numMatches[numMatches.length - 1][0];
        const secondLastMatch = numMatches[numMatches.length - 2][0];
        
        const totalPriceVal = parseCurrency(lastMatch);
        const unitPriceVal = parseCurrency(secondLastMatch);
        
        let quantityVal = 1;
        if (numMatches.length >= 3) {
          const thirdLastMatch = numMatches[numMatches.length - 3][0];
          quantityVal = parseCurrency(thirdLastMatch);
        }

        // Validate unit price and quantity
        if (quantityVal > 0 && unitPriceVal > 0 && totalPriceVal > 0) {
          const calculatedPrice = quantityVal * unitPriceVal;
          const firstNumIndex = withoutDiscounts.indexOf(numMatches[0][0]);
          const description = withoutDiscounts.substring(0, firstNumIndex).trim();

          parts.push({
            id: '',
            partNumber: partNumber,
            description: description || "Onderdeel",
            price: calculatedPrice,
            originalLine: trimmed,
            quantity: quantityVal
          });
          continue;
        }
      }
    }

    // Existing fallback 1: Regex match
    const qtyMatch = trimmed.match(/^([A-Z0-9\s.-]{3,})\s+(.+?)\s+([\d,.]+)\s+(?:€\s*)?([\d,.]+)\s+(?:[\d,.]+\s*%)?\s*(?:[\d,.]+\s*%)?\s*(?:€\s*)?([\d,.]+)$/);
    if (qtyMatch) {
      const partNumber = qtyMatch[1].trim();
      const description = qtyMatch[2].trim();
      const quantityVal = parseCurrency(qtyMatch[3]);
      const unitPriceVal = parseCurrency(qtyMatch[4]);
      
      if (quantityVal > 0 && unitPriceVal > 0) {
        const calculatedPrice = quantityVal * unitPriceVal;
        parts.push({
          id: '',
          partNumber: partNumber,
          description: description,
          price: calculatedPrice,
          originalLine: trimmed,
          quantity: quantityVal
        });
        continue;
      }
    }

    // Existing fallback 2: Max price and part number matching
    const priceMatches = Array.from(trimmed.matchAll(/(?:€\s*)?(\d+[\.\s]\d+[,.]\d{2}|\d+[,.]\d{2})(?!\s*%)/g));
    const prices = priceMatches.map(m => parseCurrency(m[1]));
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    if (maxPrice === 0) continue;

    const match = trimmed.match(/^([A-Z0-9\s.-]{5,})\s+(.+?)(?:\s+\d+[,.]\d+)?\s+(?:€|(?:\d+[,.]\d{2}))/);

    if (match) {
      parts.push({
        id: '',
        partNumber: match[1].trim(),
        description: match[2].trim(),
        price: maxPrice,
        originalLine: trimmed
      });
    } else {
      const words = trimmed.split(/\s+/);
      if (words[0].length >= 4) {
        parts.push({
          id: '',
          partNumber: words[0],
          description: words.slice(1).join(' ').split(/\d+[,.]\d+/)[0].trim(),
          price: maxPrice,
          originalLine: trimmed
        });
      }
    }
  }
  return parts;
};

// Formatter to align and clean up separate line prices with their part description line
export function formatCalculationText(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line); // Preserve empty line
      continue;
    }
    
    // Check if current line starts with 4 digits and looks like a part detail line
    const isItemHeader = /^\d{4}\s+/.test(trimmed);
    
    if (isItemHeader) {
      let nextPriceIndex = -1;
      let priceText = "";
      
      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed) continue;
        
        // Match only short price-only values (e.g. "20.13*", "€ 20,13")
        const isPrice = /^[\d\.,\s]+[*€]?$/.test(nextTrimmed) || /^[€\s]*[\d\.,\s]+[*]?$/.test(nextTrimmed);
        if (isPrice && nextTrimmed.length < 20) {
          nextPriceIndex = j;
          priceText = nextTrimmed;
        }
        break; // Only test immediate next non-empty line
      }
      
      if (priceText && nextPriceIndex !== -1) {
        // Merge them nicely. Use generous spaced padding so it is perfectly readable.
        // Audatex lines are often around 45-55 chars. Let's pad to 50 characters, then append the price.
        const targetWidth = 50;
        let padding = "            ";
        if (line.length < targetWidth) {
          padding = " ".repeat(targetWidth - line.length);
        }
        result.push(line + padding + priceText);
        i = nextPriceIndex; // Skip price line
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

export interface CalibrationAlignmentResult {
  needsCalibration: boolean;
  needsAlignment: boolean;
  calibrationReason: string | null;
  alignmentReason: string | null;
}

export function detectCalibrationAndAlignment(text: string): CalibrationAlignmentResult {
  if (!text) {
    return {
      needsCalibration: false,
      needsAlignment: false,
      calibrationReason: null,
      alignmentReason: null
    };
  }

  const lines = text.split('\n');
  let needsCalibration = false;
  let needsAlignment = false;
  let calibrationReason: string | null = null;
  let alignmentReason: string | null = null;

  // Keyword check lists (case-insensitive sub-string match)
  const calibKeywords = [
    "kalibr", "calibr", "inler", "adas", "aiming", "camera afstellen", "radar afst", 
    "camera afstel", "sensor afst", "spoorassistent", "d.a.s.", "das-sensor", "blind spot in"
  ];

  const alignKeywords = [
    "uitlijn", "uit-lijn", "wieluitlijn", "wielen uit", "stuurgeometrie", "spoor afst", 
    "achteras meten", "vooras meten", "sporing", "wielstanden", "meetrapport"
  ];

  // Suspension components which implicitly require alignment when modified/replaced
  const suspensionKeywords = [
    "draagarm", "velg", "stabilisator", "banden", "band ", "wielophanging", 
    "schokdemper", "schokbreker", "wiellager", "wielnaaf", "fusee", "stuurstang", "achterveer"
  ];

  // Pre-check for specific Audatex codes anywhere in the document
  const hasCode0018 = /\b0018\b/.test(text);
  const hasCode74 = /\b74\b/.test(text) || /\b74\s+\d/.test(text) || text.toLowerCase().includes("code 74");

  if (hasCode0018) {
    needsCalibration = true;
    calibrationReason = "Opgevoerd in calculatie (Audatex Code 0018 - Kalibratie)";
    needsAlignment = true;
    alignmentReason = "Opgevoerd in calculatie (Audatex Code 0018 - Uitlijnen)";
  }

  if (hasCode74 && !needsAlignment) {
    needsAlignment = true;
    alignmentReason = "Opgevoerd in calculatie (Audatex Code 74 / Uitlijnen)";
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    // Check calibration
    if (!needsCalibration) {
      const match = calibKeywords.some(kw => lower.includes(kw));
      if (match) {
        needsCalibration = true;
        calibrationReason = trimmed;
      }
    }

    // Check alignment
    if (!needsAlignment) {
      const match = alignKeywords.some(kw => lower.includes(kw));
      if (match) {
        needsAlignment = true;
        alignmentReason = trimmed;
      }
    }

    // Check suspension components (implicit requirement)
    if (!needsAlignment) {
      const foundSusp = suspensionKeywords.find(kw => lower.includes(kw));
      if (foundSusp) {
        needsAlignment = true;
        alignmentReason = `Vereist wegens wielophanging: "${trimmed.substring(0, 48)}${trimmed.length > 48 ? '...' : ''}"`;
      }
    }
  }

  return {
    needsCalibration,
    needsAlignment,
    calibrationReason,
    alignmentReason
  };
}

// Structured short database for scanner to prevent circular import issues
const SCAN_AUDATEX_CODES_LIST = [
  { code: "BV AE", description: "Maakt van een V een B (Opgave, AE verplicht)" },
  { code: "CV AE", description: "Maakt van een V een C (AE verplicht)" },
  { code: "HV AE", description: "Maakt van een V een H (verplicht)" },
  { code: "SVV AE", description: "Maakt van een V een S" },
  { code: "S0", description: "Onderdrukken spuitwerk" },
  { code: "SB", description: "Spuitwerk nog bruikbaar" },
  { code: "SH1", description: "SH bij > 50% plamuuroppervlak" },
  { code: "D", description: "Uitdeuken Zonder Spuiten (UZS)" },
  { code: "LS", description: "Spot repair" },
  { code: "SV1", description: "Onderdeel met grondlak -deel ruw, hechtlaag" },
  { code: "SV2", description: "Onderdeel ruw met filler, zonder schuren" },
  { code: "SV3", description: "Onderdeel ruw met filler, met schuren" },
  { code: "SV4", description: "Onderdeel PUR ruw met filler, met schuren" },
  { code: "MM", description: "Toeslag op onderdeel" },
  { code: "WM", description: "Aftrek op onderdeel" },
  { code: "PM", description: "Aftrek van onderdeel incl. extra delen" },
  { code: "UM", description: "Toeslag op onderdeel incl. extra delen" },
  { code: "GM", description: "Opgave spuitmateriaalvergoeding" },
  { code: "HM", description: "Opgave reparatievergoeding" },
  { code: "SM", description: "Opgave spuitloonvergoeding" },
  { code: "VM", description: "Mutatie onderdeelprijs" },
  { code: "BM", description: "Onderdeelprijs mutatie onderdeelnummer zichtbaar" },
  { code: "NP", description: "Prijsmutatie per hoeveelheid" },
  { code: "FO", description: "Onderdeelprijs onderdrukken" },
  { code: "TM", description: "Type Mutatie" },
  { code: "NR", description: "Hoeveelheid mutatie" },
  { code: "PW", description: "Afwijkend BTW percentage per onderdeel" },
  { code: "PZ", description: "Onderdeel zonder korting toeslag TZC 122" },
  { code: "AM", description: "Bedrag aftrek NVO spuitwerk" },
  { code: "QM", description: "Mutatie oppervlakte" },
  { code: "10", description: "Totaalbedrag onderdelen (met specificatie)" },
  { code: "13", description: "Aftrek prijs nog bruikbare delen" },
  { code: "14", description: "Aftrek prijs nog bruikbare delen, carrosserie" },
  { code: "20", description: "Korting op totaalbedrag onderdelen" },
  { code: "21", description: "Toeslag op totaalbedrag onderdelen" },
  { code: "22", description: "Korting over alle onderdelen" },
  { code: "23", description: "Toeslag over alle onderdelen" },
  { code: "24", description: "Aftrek NVO van totaalbedrag" },
  { code: "26", description: "Kleinmateriaal ondergrens" },
  { code: "27", description: "Totaalbedrag kleinmateriaal" },
  { code: "28", description: "Kleinmateriaal van onderdelenbedrag" },
  { code: "29", description: "Kleinmateriaal van arbeidsloonbedrag" },
  { code: "92", description: "Kleinmateriaal van reparatiekosten" },
  { code: "93", description: "Kleinmateriaal bovengrens" },
  { code: "120", description: "Aftrek of toeslag onderdelen incl. kleinmateriaal" },
  { code: "121", description: "Aftrek NVO totaalbedrag onderdelen, incl. kleinmateriaal" },
  { code: "122", description: "Korting of toeslag totaalbedrag onderdelen" },
  { code: "30", description: "Totaalbedrag arbeidsloon (met specificatie)" },
  { code: "31", description: "Totale arbeidsduur (met specificatie)" },
  { code: "32", description: "Bijzondere verrichting" },
  { code: "33", description: "Aftrek op arbeidsloon" },
  { code: "34", description: "Aftrek van arbeidsduur" },
  { code: "38", description: "Toeslag op arbeidsloon" },
  { code: "52", description: "Totaalbedrag spuitloon" },
  { code: "54", description: "Totale spuitduur met specificatie" },
  { code: "55", description: "Totaalbedrag spuitloon met specificatie" },
  { code: "56", description: "Aftrek NVO van totaalbedrag spuitwerk" },
  { code: "58", description: "Aftrek NVO van totaalbedrag spuitwerk (%)" },
  { code: "59", description: "Aftrek spuitloonbedrag" },
  { code: "75", description: "Toeslag op spuitloon" },
  { code: "82", description: "Spuitbedrag overig" },
  { code: "143", description: "Aftrek/Toeslag spuitbedrag" },
  { code: "40", description: "Spuitmateriaal toeslag als % van spuitloon" },
  { code: "42", description: "Spuitmateriaalbedrag" },
  { code: "45", description: "Bedrag per dm2" },
  { code: "51", description: "AZT spuitsysteem (%)" },
  { code: "81", description: "Fabrieksspuitsysteem" },
  { code: "110", description: "Toeslag spuitmateriaal" },
  { code: "111", description: "Aftrek spuitmateriaal" },
  { code: "112", description: "Aftrek NVO van spuitmateriaal" },
  { code: "02", description: "Wijziging BTW" },
  { code: "76", description: "Milieutoeslag als % van onderdelen" },
  { code: "77", description: "Milieutoeslag als vast bedrag" },
  { code: "80", description: "Milieutoeslag arbeids- en spuitloon" },
  { code: "88", description: "Aftrek reparatiekosten" },
  { code: "89", description: "Aftrek reparatiekosten (vast bedrag)" },
  { code: "90", description: "Begrotingskosten reparateur (AE)" },
  { code: "91", description: "Aftrek eigen risico" },
  { code: "95", description: "Aftrek eerste schade" },
  { code: "123", description: "Milieutoeslag KL 1-4 (arbeids- en spuitloon)" },
  { code: "124", description: "Milieutoeslag KL 5 (arbeidsloon van UZS)" },
  { code: "125", description: "Milieutoeslag als % van reparatiekosten" },
  { code: "126", description: "Milieutoeslag als bovengrens van reparatiekosten" },
  { code: "60", description: "Transportkosten onderdelen" },
  { code: "61", description: "Transportkosten carrosserie/cabine" },
  { code: "63", description: "Hulpstoffen" },
  { code: "65", description: "Bekledingswerkzaamheden" },
  { code: "66", description: "Lijm- en kitmateriaal" },
  { code: "67", description: "Poetsen/reinigen" },
  { code: "68", description: "Voertuigtransport" },
  { code: "69", description: "Noodreparatie" },
  { code: "70", description: "Anti-roestbehandeling" },
  { code: "71", description: "Anti-roestbehandeling carrosserie" },
  { code: "72", description: "Bescherming holle ruimte" },
  { code: "73", description: "Bescherming holle ruimte carrosserie" },
  { code: "74", description: "Uitlijnen wielen (Geometrie)" },
  { code: "135", description: "Kosten Vervangend Vervoer" },
  { code: "136", description: "Kosten Vervangend Vervoer" },
  { code: "0016", description: "Foutgeheugen uitlezen vóór reparatie" },
  { code: "0017", description: "Foutgeheugen uitlezen ná reparatie" },
  { code: "0018", description: "Gezamenlijk Uitlijnen & ADAS Kalibratie" }
];

export interface ScannedCodeResult {
  code: string;
  description: string;
}

export function scanAudatexCodes(text: string): ScannedCodeResult[] {
  if (!text) return [];
  const results: ScannedCodeResult[] = [];
  const seenCodes = new Set<string>();

  for (const item of SCAN_AUDATEX_CODES_LIST) {
    let matched = false;
    
    if (/^[A-Z]+\d*$/i.test(item.code)) {
      const regex = new RegExp(`\\b${item.code}\\b`, 'i');
      matched = regex.test(text);
    } else if (/^\d+$/.test(item.code)) {
      // Ensure digits match standalone numbers, e.g. /  74  or : 74 or " 74 "
      const regex = new RegExp(`(?:\\s|^|/|:)${item.code}(?:\\s|$|/|\\.|,)`);
      matched = regex.test(text);
    } else {
      // Handle cases with spaces like "BV AE"
      const cleanPattern = item.code.replace(/\s+/g, '\\s+');
      const regex = new RegExp(`\\b${cleanPattern}\\b`, 'i');
      matched = regex.test(text);
    }

    if (matched && !seenCodes.has(item.code)) {
      seenCodes.add(item.code);
      results.push(item);
    }
  }

  return results;
}


