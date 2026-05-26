/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Part matching logic and normalization
export const normalizePartNumber = (part: string): string => {
  return part.replace(/[\s,.\-_/]/g, '').toUpperCase();
};

export interface AutomotivePart {
  id: string;
  description: string;
  partNumber: string;
  price: number;
  originalLine?: string;
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

        // Check if next line looks strictly like a price (optional Euro or trailing asterisk)
        const isPrice = /^[\d\.,\s]+[*€]?$/.test(nextTrimmed) || /^[€\s]*[\d\.,\s]+[*]?$/.test(nextTrimmed);
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

    // Matches common calculation format: [ID] [DESC] [PART_NUM] [PRICE]
    // Example: 0257 KENTEKENPLAAT V KNPL3 23.37
    // Improved to handle more robust spacing and part number chars including thousand separators in price
    // Note: added * to part number allowed chars logic
    const match = trimmed.match(/^(\d{4})\s+(.+?)\s{2,}([*A-Z0-9\s/.-]{2,})\s{2,}([\d\.,\s]+)$/);
    
    if (match) {
      const baseId = match[1];
      const count = seenIds.get(baseId) || 0;
      const id = count === 0 ? baseId : `${baseId}-${count}`;
      seenIds.set(baseId, count + 1);

      parts.push({
        id: id,
        description: match[2].trim(),
        partNumber: match[3].trim(),
        price: parseCurrency(match[4]),
        originalLine: trimmed
      });
    } else {
      // Fallback for lines that don't match perfectly
      // Try to find a part number and price at the end
      const parts_list = trimmed.split(/\s{2,}/).filter(p => p.trim());
      if (parts_list.length >= 3) {
        const price = parseCurrency(parts_list[parts_list.length - 1]);
        if (price > 0) {
          const baseId = parts_list[0];
          const count = seenIds.get(baseId) || 0;
          const id = count === 0 ? baseId : `${baseId}-${count}`;
          seenIds.set(baseId, count + 1);

          parts.push({
            id: id,
            description: parts_list[1],
            partNumber: parts_list[parts_list.length - 2],
            price: price,
            originalLine: trimmed
          });
        }
      }
    }
  }
  return parts;
};

export const parseInvoice = (text: string): AutomotivePart[] => {
  const lines = text.split('\n');
  const parts: AutomotivePart[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Find all currency-like amounts. We exclude numbers followed by '%' to avoid picking up tax/discount rates.
    // Enhanced regex to capture thousand separators (e.g. 1.573,25)
    const priceMatches = Array.from(trimmed.matchAll(/(?:€\s*)?(\d+[\.\s]\d+[,.]\d{2}|\d+[,.]\d{2})(?!\s*%)/g));
    const prices = priceMatches.map(m => parseCurrency(m[1]));
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    if (maxPrice === 0) continue;

    // Extract Part Number and Description
    // We assume the part number is usually at the start of the line
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
      // More relaxed fallback for invoice lines
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
