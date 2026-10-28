/**
 * Automotive Schadeherstel Code Parser & Auto-completer
 * LET OP: De focus ligt UITSLUITEND op SCHADEHERSTEL / RICHTEN / UITDEUKEN / SPUITEN (NOOIT vernieuwen/vervangen).
 * 
 * Woordenboek & Regels:
 * - "bui"  -> "buiten"
 * - "bi"   -> "binnen"
 * - "atp"  -> "achtertussenpaneel"
 * - "h atp 20"              -> "herstel achtertussenpaneel 20 ae"
 * - "h voorb 20"            -> "herstel voorbumper 20 ae"
 * - "richt a 30"            -> "richten achterzijde 30 ae"
 * - "h bui paneel ra 20 ae" -> "herstel buitenpaneel rechts achter 20 ae"
 * - "h bi paneel ra 20 ae"  -> "herstel binnenpaneel rechts achter 20 ae"
 * - "h binn paneel ra 20 ae"-> "herstel binnenpaneel rechts achter 20 ae"
 * - "y7 voorb"              -> "uitgebouwd spuiten voorbumper"
 * - "y8 scherm rv"          -> "losse delen spuiten scherm rechts voor"
 * - "h achb 15"             -> "herstel achterbumper 15 ae"
 * - "h dorpel r 25"         -> "herstel rechter dorpel 25 ae"
 */

export interface ParsedDamageLine {
  original: string;
  action: string;       // "Herstel", "Richten", "Uitgebouwd spuiten", "Losse delen spuiten", etc.
  part: string;         // bijv. "Voorbumper", "Achterzijde", "Binnenpaneel rechts achter", etc.
  ae?: number;          // Arbeidseenheden (AE) indien vermeld
  category: "Plaatwerk & Herstel" | "Richten & Trekbank" | "Spuitwerk" | "Demontage & Montage" | "Controle & Meting" | "Algemeen";
  fullText: string;     // Strakke leesbare hersteltekst
}

// Woordenboek met actie-afkortingen: primair gericht op HERSTEL (geen vervangingen!)
export const ACTION_SHORTCUTS: Record<string, { label: string; category: ParsedDamageLine["category"] }> = {
  // Herstel / Plaatwerk (primair)
  "h": { label: "Herstel", category: "Plaatwerk & Herstel" },
  "hst": { label: "Herstel", category: "Plaatwerk & Herstel" },
  "herst": { label: "Herstel", category: "Plaatwerk & Herstel" },
  "herstel": { label: "Herstel", category: "Plaatwerk & Herstel" },
  "herstellen": { label: "Herstel", category: "Plaatwerk & Herstel" },
  "rep": { label: "Herstel & reparatie", category: "Plaatwerk & Herstel" },
  "repareren": { label: "Herstel & reparatie", category: "Plaatwerk & Herstel" },
  "ud": { label: "Uitdeuken & herstel", category: "Plaatwerk & Herstel" },
  "uitdeuk": { label: "Uitdeuken & herstel", category: "Plaatwerk & Herstel" },
  "uitdeuken": { label: "Uitdeuken & herstel", category: "Plaatwerk & Herstel" },
  "restylen": { label: "Restylen (uitdeuken zonder spuiten)", category: "Plaatwerk & Herstel" },

  // Richten / Trekbank
  "richt": { label: "Richten", category: "Richten & Trekbank" },
  "richten": { label: "Richten", category: "Richten & Trekbank" },
  "r": { label: "Richten", category: "Richten & Trekbank" },
  "trekbank": { label: "Opzetten trekbank & richten", category: "Richten & Trekbank" },
  "mal": { label: "Richten op mallenbank", category: "Richten & Trekbank" },

  // Demontage & Montage t.b.v. herstel
  "d+m": { label: "De- & montage t.b.v. herstel", category: "Demontage & Montage" },
  "dm": { label: "De- & montage t.b.v. herstel", category: "Demontage & Montage" },
  "u+i": { label: "Uit- en inbouwen t.b.v. herstel", category: "Demontage & Montage" },
  "ui": { label: "Uit- en inbouwen t.b.v. herstel", category: "Demontage & Montage" },
  "dem": { label: "Demonteren t.b.v. herstel", category: "Demontage & Montage" },
  "demonteren": { label: "Demonteren t.b.v. herstel", category: "Demontage & Montage" },

  // Spuiten & Audatex Spuitcodes: Y7 = uitgebouwd spuiten, Y8 = losse delen spuiten
  "y7": { label: "Uitgebouwd spuiten", category: "Spuitwerk" },
  "y-7": { label: "Uitgebouwd spuiten", category: "Spuitwerk" },
  "y8": { label: "Losse delen spuiten", category: "Spuitwerk" },
  "y-8": { label: "Losse delen spuiten", category: "Spuitwerk" },
  "s": { label: "Spuiten hersteld deel", category: "Spuitwerk" },
  "sp": { label: "Spuiten hersteld deel", category: "Spuitwerk" },
  "spuit": { label: "Spuiten hersteld deel", category: "Spuitwerk" },
  "spuiten": { label: "Spuiten hersteld deel", category: "Spuitwerk" },
  "un": { label: "Uitnevelen aangrenzend deel", category: "Spuitwerk" },
  "uitnevel": { label: "Uitnevelen aangrenzend deel", category: "Spuitwerk" },
  "uitnevelen": { label: "Uitnevelen aangrenzend deel", category: "Spuitwerk" },
  "spotrepair": { label: "Spotrepair herstel", category: "Spuitwerk" },

  // Controle & Uitlijning
  "c": { label: "Controleren herstel", category: "Controle & Meting" },
  "ctrl": { label: "Controleren maatvoering", category: "Controle & Meting" },
  "check": { label: "Controleren", category: "Controle & Meting" },
  "meet": { label: "Meten carrosserie / maattolerantie", category: "Controle & Meting" },
  "meten": { label: "Meten carrosserie", category: "Controle & Meting" },
  "kal": { label: "Kalibreren ADAS na herstel", category: "Controle & Meting" },
  "kalibreren": { label: "Kalibreren sensoren na herstel", category: "Controle & Meting" },
  "uitlijn": { label: "Uitlijnen wielgeometrie", category: "Controle & Meting" },
  "uitlijnen": { label: "Uitlijnen wielgeometrie", category: "Controle & Meting" }
};

// Woordenboek met onderdeel- en zone-afkortingen
export const PART_SHORTCUTS: Record<string, string> = {
  // Binnen en Buiten posities (bui = buiten, bi = binnen)
  "bui": "buiten",
  "buiten": "buiten",
  "bi": "binnen",
  "binn": "binnen",
  "binnen": "binnen",

  // Panelen & Binnen-/Buitenwerk
  "atp": "achtertussenpaneel",
  "achtertussenpaneel": "achtertussenpaneel",
  "achter-tussenpaneel": "achtertussenpaneel",
  "achter tussenpaneel": "achtertussenpaneel",
  "paneel": "paneel",
  "bui paneel": "buitenpaneel",
  "bi paneel": "binnenpaneel",
  "binn paneel": "binnenpaneel",
  "binnenpaneel": "binnenpaneel",
  "buitenpaneel": "buitenpaneel",
  "binnenscherm": "binnenscherm",
  "binnenrand": "binnenrand",
  "binnensch": "binnenscherm",
  "buitenscherm": "buitenscherm",
  "buitenrand": "buitenrand",
  "wielkast": "wielkuip / binnenscherm",
  "wielkuip": "wielkuip / binnenscherm",

  // Bumpers & Front
  "voorb": "voorbumper",
  "voorbump": "voorbumper",
  "voorbumper": "voorbumper",
  "vb": "voorbumper",
  "v-b": "voorbumper",
  "achb": "achterbumper",
  "achterb": "achterbumper",
  "achterbumper": "achterbumper",
  "ab": "achterbumper",
  "a-b": "achterbumper",
  "balk": "bumperbalk",
  "bumperbalk": "bumperbalk",
  "front": "frontpaneel / voorkop",
  "frontplaat": "frontplaat",
  "slotplaat": "slotplaat",
  "grille": "grille",
  "gril": "grille",
  "rooster": "bumperrooster",

  // Algemene zones en posities
  "ra": "rechts achter",
  "r.a.": "rechts achter",
  "la": "links achter",
  "l.a.": "links achter",
  "rv": "rechts voor",
  "r.v.": "rechts voor",
  "lv": "links voor",
  "l.v.": "links voor",
  "r": "rechts",
  "l": "links",
  "v": "voorzijde",
  "vz": "voorzijde",
  "voorz": "voorzijde",
  "voorzijde": "voorzijde",
  "a": "achterzijde",
  "az": "achterzijde",
  "achterz": "achterzijde",
  "achterzijde": "achterzijde",
  "midden": "midden",
  "mid": "midden",
  "boven": "bovenzijde",
  "onder": "onderzijde",

  // Schermen & Plaatwerk
  "voorscherm": "voorscherm",
  "l.voorscherm": "linker voorscherm",
  "r.voorscherm": "rechter voorscherm",
  "lvscherm": "linker voorscherm",
  "rvscherm": "rechter voorscherm",
  "achterscherm": "achterscherm",
  "l.achterscherm": "linker achterscherm",
  "r.achterscherm": "rechter achterscherm",
  "lascherm": "linker achterscherm",
  "rascherm": "rechter achterscherm",
  "scherm": "scherm",
  "motorkap": "motorkap",
  "mkap": "motorkap",
  "mk": "motorkap",
  "kap": "motorkap",
  "achterklep": "achterklep",
  "aklep": "achterklep",
  "ak": "achterklep",
  "klep": "achterklep",
  "kofferdeksel": "kofferdeksel",
  "dak": "dakplaat",
  "dakplaat": "dakplaat",
  "dorpel": "dorpel",
  "l.dorpel": "linker dorpel",
  "r.dorpel": "rechter dorpel",
  "ldorpel": "linker dorpel",
  "rdorpel": "rechter dorpel",
  "a-stijl": "a-stijl",
  "b-stijl": "b-stijl",
  "c-stijl": "c-stijl",
  "astijl": "a-stijl",
  "bstijl": "b-stijl",
  "cstijl": "c-stijl",

  // Portieren
  "portier": "portier",
  "lvportier": "linker voorportier",
  "rvportier": "rechter voorportier",
  "laportier": "linker achterportier",
  "raportier": "rechter achterportier",
  "deur": "portier",
  "lvdeur": "linker voorportier",
  "rvdeur": "rechter voorportier",
  "ladeur": "linker achterportier",
  "radeur": "rechter achterportier",

  // Chassis & Constructie
  "chassisbalk": "chassisbalk",
  "kofferbodem": "kofferruimte bodem",
  "bodemplaat": "bodemplaat",
  "achterpaneel": "achterpaneel",
  "achterschort": "achterschort",
  "binnenschort": "binnenschort",
  "achterwand": "achterwand"
};

/**
 * Bouwt een gecombineerd woordenboek op van standaardsneltoetsen en custom gebruikers-synoniemen
 */
export function getMergedPartShortcuts(customSynonyms?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...PART_SHORTCUTS };
  if (customSynonyms && typeof customSynonyms === "object") {
    Object.entries(customSynonyms).forEach(([abbr, full]) => {
      const cleanAbbr = abbr.trim().toLowerCase();
      const cleanFull = full.trim().toLowerCase();
      if (cleanAbbr && cleanFull) {
        merged[cleanAbbr] = cleanFull;
      }
    });
  }
  return merged;
}

/**
 * Parseert een enkele herstelregel naar een professioneel geformuleerd actiepunt.
 * Voorbeelden:
 * - "h bui paneel ra 20 ae" -> "herstel buitenpaneel rechts achter 20 ae"
 * - "h bi paneel ra 20 ae"  -> "herstel binnenpaneel rechts achter 20 ae"
 * - "h voorb 20"            -> "herstel voorbumper 20 ae"
 * - "richt a 30"            -> "richten achterzijde 30 ae"
 * - "y7 voorb 15"           -> "uitgebouwd spuiten voorbumper 15 ae"
 * - "y8 scherm rv"          -> "losse delen spuiten scherm rechts voor"
 * - "h atp 20"              -> "herstel achtertussenpaneel 20 ae"
 */
export function parseDamageLine(line: string, customSynonyms?: Record<string, string>): ParsedDamageLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const activeDict = getMergedPartShortcuts(customSynonyms);

  // Haal eventuele AE (arbeidseenheden) eruit aan het einde van de regel
  let ae: number | undefined = undefined;
  let cleanLine = trimmed;

  // Match bijv. "20 ae", "20ae", "20", "25 AE", "30ae" aan het einde
  const aeMatch = cleanLine.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:ae|arbeidseenheden|u|uur|h)?$/i);
  if (aeMatch) {
    const rawVal = aeMatch[1].replace(",", ".");
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed)) {
      ae = parsed;
      cleanLine = cleanLine.substring(0, aeMatch.index).trim();
    }
  }

  // Splits in tokens
  const tokens = cleanLine.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const firstTokenLower = tokens[0].toLowerCase().replace(/[:;,]$/, "");
  
  // Standaard actie is altijd Herstel als er 'h' staat of als er geen actie is genoemd
  let actionMatch = ACTION_SHORTCUTS[firstTokenLower];
  let action = "Herstel";
  let category: ParsedDamageLine["category"] = "Plaatwerk & Herstel";
  let partTokens: string[] = [];

  if (actionMatch) {
    action = actionMatch.label;
    category = actionMatch.category;
    partTokens = tokens.slice(1);
  } else {
    // Geen expliciete actie opgegeven -> automatisch "Herstel"
    action = "Herstel";
    category = "Plaatwerk & Herstel";
    partTokens = tokens;
  }

  // Samenstellen en vertalen van het herstelonderdeel (bijv: ["bi", "paneel", "ra"] of ["bui", "paneel", "ra"])
  let translatedTokens: string[] = [];
  
  // Vertaal per woord/afkorting met ondersteuning voor combinaties van meerdere woorden
  for (let i = 0; i < partTokens.length; i++) {
    const tok = partTokens[i];
    const low = tok.toLowerCase();

    // Check combinaties van 3 tokens (bijv. "bi paneel ra" -> "binnenpaneel rechts achter")
    if (i < partTokens.length - 2) {
      const threeTok = `${low} ${partTokens[i+1].toLowerCase()} ${partTokens[i+2].toLowerCase()}`;
      if (threeTok === "bi paneel ra" || threeTok === "binn paneel ra" || threeTok === "binnen paneel ra") {
        translatedTokens.push("binnenpaneel rechts achter");
        i += 2;
        continue;
      }
      if (threeTok === "bi paneel la" || threeTok === "binn paneel la" || threeTok === "binnen paneel la") {
        translatedTokens.push("binnenpaneel links achter");
        i += 2;
        continue;
      }
      if (threeTok === "bi paneel rv" || threeTok === "binn paneel rv" || threeTok === "binnen paneel rv") {
        translatedTokens.push("binnenpaneel rechts voor");
        i += 2;
        continue;
      }
      if (threeTok === "bi paneel lv" || threeTok === "binn paneel lv" || threeTok === "binnen paneel lv") {
        translatedTokens.push("binnenpaneel links voor");
        i += 2;
        continue;
      }
      if (threeTok === "bui paneel ra" || threeTok === "buiten paneel ra") {
        translatedTokens.push("buitenpaneel rechts achter");
        i += 2;
        continue;
      }
      if (threeTok === "bui paneel la" || threeTok === "buiten paneel la") {
        translatedTokens.push("buitenpaneel links achter");
        i += 2;
        continue;
      }
      if (threeTok === "bui paneel rv" || threeTok === "buiten paneel rv") {
        translatedTokens.push("buitenpaneel rechts voor");
        i += 2;
        continue;
      }
      if (threeTok === "bui paneel lv" || threeTok === "buiten paneel lv") {
        translatedTokens.push("buitenpaneel links voor");
        i += 2;
        continue;
      }
    }

    // Check combinaties van 2 tokens
    if (i < partTokens.length - 1) {
      const nextLow = partTokens[i+1].toLowerCase();
      const twoTok = `${low} ${nextLow}`;

      if (activeDict[twoTok]) {
        translatedTokens.push(activeDict[twoTok]);
        i++;
        continue;
      }
      if (twoTok === "bi paneel" || twoTok === "binn paneel" || twoTok === "binnen paneel") {
        translatedTokens.push("binnenpaneel");
        i++;
        continue;
      }
      if (twoTok === "bui paneel" || twoTok === "buiten paneel") {
        translatedTokens.push("buitenpaneel");
        i++;
        continue;
      }
      if (twoTok === "bi rand" || twoTok === "binnen rand") {
        translatedTokens.push("binnenrand");
        i++;
        continue;
      }
      if (twoTok === "bui rand" || twoTok === "buiten rand") {
        translatedTokens.push("buitenrand");
        i++;
        continue;
      }
      if (twoTok === "chassis balk") {
        translatedTokens.push("chassisbalk");
        i++;
        continue;
      }
      if (twoTok === "atp ra") {
        translatedTokens.push("achtertussenpaneel rechts achter");
        i++;
        continue;
      }
      if (twoTok === "atp la") {
        translatedTokens.push("achtertussenpaneel links achter");
        i++;
        continue;
      }
      if (twoTok === "achter tussenpaneel" || twoTok === "achter tussen paneel") {
        translatedTokens.push("achtertussenpaneel");
        i++;
        continue;
      }
    }

    // Enkele tokens vertalen via gecombineerd woordenboek
    if (activeDict[low]) {
      translatedTokens.push(activeDict[low]);
    } else if (low === "bui") {
      translatedTokens.push("buiten");
    } else if (low === "bi" || low === "binn") {
      translatedTokens.push("binnen");
    } else {
      translatedTokens.push(tok);
    }
  }

  let finalPartName = translatedTokens.join(" ").trim();
  if (!finalPartName) {
    finalPartName = "schadedoel";
  }

  // Zorg dat het grammaticaal netjes leest
  // bijv. "herstel voorbumper 20 ae" of "herstel binnenpaneel rechts achter 20 ae"
  let fullText = `${action.toLowerCase()} ${finalPartName.toLowerCase()}`;
  if (ae !== undefined) {
    fullText += ` ${ae} ae`;
  }

  return {
    original: trimmed,
    action,
    part: finalPartName,
    ae,
    category,
    fullText
  };
}

/**
 * Geeft realtime zoeksuggesties / autocompletion opties op basis van huidige input
 */
export function getAutoCompletions(currentWordOrLine: string, customSynonyms?: Record<string, string>): Array<{ text: string; hint: string; fullSample: string }> {
  const query = currentWordOrLine.trim().toLowerCase();
  const activeDict = getMergedPartShortcuts(customSynonyms);

  if (!query) {
    return [
      { text: "h atp 20", hint: "atp = achtertussenpaneel -> herstel achtertussenpaneel 20 ae", fullSample: "herstel achtertussenpaneel 20 ae" },
      { text: "h bui paneel ra 20 ae", hint: "bui = buiten -> herstel buitenpaneel rechts achter 20 ae", fullSample: "herstel buitenpaneel rechts achter 20 ae" },
      { text: "h bi paneel ra 20 ae",  hint: "bi = binnen -> herstel binnenpaneel rechts achter 20 ae", fullSample: "herstel binnenpaneel rechts achter 20 ae" },
      { text: "h voorb 20", hint: "herstel voorbumper 20 ae", fullSample: "herstel voorbumper 20 ae" },
      { text: "richt a 30", hint: "richten achterzijde 30 ae", fullSample: "richten achterzijde 30 ae" },
      { text: "y7 voorb", hint: "Y7: uitgebouwd spuiten voorbumper", fullSample: "uitgebouwd spuiten voorbumper" },
      { text: "y8 scherm rv", hint: "Y8: losse delen spuiten scherm rechts voor", fullSample: "losse delen spuiten scherm rechts voor" },
      { text: "h achb 15", hint: "herstel achterbumper 15 ae", fullSample: "herstel achterbumper 15 ae" }
    ];
  }

  const results: Array<{ text: string; hint: string; fullSample: string }> = [];

  // Parse de huidige regel om te zien wat het zou worden
  const parsed = parseDamageLine(query, customSynonyms);
  if (parsed && parsed.fullText.toLowerCase() !== query) {
    results.push({
      text: parsed.fullText,
      hint: `Direct vertalen: ${parsed.fullText}`,
      fullSample: parsed.fullText
    });
  }

  // Zoek passende herstelacties (inclusief y7, y8)
  Object.entries(ACTION_SHORTCUTS).forEach(([shortcut, info]) => {
    if (shortcut.startsWith(query) || info.label.toLowerCase().startsWith(query)) {
      results.push({
        text: `${shortcut} `,
        hint: `${shortcut.toUpperCase()}: ${info.label} (${info.category})`,
        fullSample: `${info.label.toLowerCase()} [onderdeel] [ae]`
      });
    }
  });

  // Zoek passende onderdelen/posities (incl. actieve synoniemen)
  Object.entries(activeDict).forEach(([shortcut, partName]) => {
    if (shortcut.startsWith(query) || partName.toLowerCase().includes(query)) {
      results.push({
        text: shortcut,
        hint: `Deel/locatie: ${partName}`,
        fullSample: partName
      });
    }
  });

  return results.slice(0, 8);
}
