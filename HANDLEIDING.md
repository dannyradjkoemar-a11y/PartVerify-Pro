# Handleiding: PartVerify Pro Lokaal Opstarten & Online Zetten

Deze handleiding helpt je stap voor stap om **PartVerify Pro** op je eigen computer op te starten, of om het zelf online (live op internet) te zetten, zonder dat je daar programmeerkennis voor nodig hebt.

---

## Deel 1: Voorbereiding (Wat heb je nodig op je computer?)

Voordat we beginnen, moeten we een aantal gratis programma's installeren die ervoor zorgen dat de app op jouw computer kan draaien.

### Stap 1: Installeer Node.js
Node.js is de "motor" die ervoor zorgt dat de app op je computer werkt.
1. Ga naar de website: [https://nodejs.org](https://nodejs.org)
2. Download de **LTSversie** (dit is de meest stabiele versie voor jouw computer). Dit is meestal de grote knop aan de linkerkant.
3. Open de gedownloade installatiewizard en klik simpelweg telkens op **Volgende (Next)** totdat de installatie klaar is.

### Stap 2: Installeer een Code Editor (Optioneel, maar erg handig)
We raden aan om Visual Studio Code te downloaden om de bestanden gemakkelijk te bekijken en op te starten.
1. Ga naar [https://code.visualstudio.com](https://code.visualstudio.com)
2. Klik op de grote downloadknop voor jouw besturingssysteem (Windows of Mac).
3. Installeer het programma op je computer.

---

## Deel 2: De App Lokaal Opstarten op je Computer

Nu je pc er klaar voor is, gaan we de app opstarten.

### Stap 1: Pak het ZIP-bestanden uit
1. Download de ZIP van de app via Google AI Studio (klik rechtsboven in de AI Studio balk op de exporteren/instellingen-knop en kies **Export ZIP**).
2. Pak het ZIP-bestand uit op een plek die je makkelijk kunt terugvinden, bijvoorbeeld in een nieuwe map op je **Bureaublad** met de naam `PartVerifyPro`.

### Stap 2: Open de map in Visual Studio Code
1. Start **Visual Studio Code** op.
2. Klik linksboven op **File** ➔ **Open Folder** (of *Map openen*).
3. Selecteer de map `PartVerifyPro` die je zojuist hebt uitgepakt en klik op selecteren.

### Stap 3: Open de Terminal (Opdrachtprompt)
In Visual Studio Code gaan we een terminal openen. Dit is een commandoschermpje waarmee we de computer opdrachten geven.
1. Klik bovenin het menu van Visual Studio Code op **Terminal** ➔ **New Terminal**.
2. Er verschijnt nu onderaan in het scherm een zwart balkje waarin je tekst kunt typen.

### Stap 4: Installeer de programmabestanden (Dependencies)
Typ de volgende tekst in de terminal en druk op **Enter**:
```bash
npm install
```
*Wat gebeurt er?* De computer gaat nu automatisch alle benodigde pakketjes en bibliotheken installeren die de app nodig heeft om er mooi uit te zien en berekeningen te maken. Dit kan 1 tot 2 minuten duren.

### Stap 5: Start de app op!
Als de installatie klaar is, typ je het volgende commando in de terminal en druk je op **Enter**:
```bash
npm run dev
```
*Gefeliciteerd!* De app draait nu lokaal. In de terminal zie je een link staan, bijvoorbeeld `http://localhost:3000`. 
1. Houd de **Ctrl-toets** (of *Cmd* op Mac) ingedrukt en klik op de link.
2. De app opent direct in je internetbrowser!

---

## Deel 3: De App Online (Live) Zetten op Internet

Als je de app online wilt zetten zodat je collega's of jijzelf er ook op mobiel of andere computers bij kunnen, kun je dit heel eenvoudig en vaak **gratis** regelen via moderne hosting-platformen zoals **Render.com** of **Railway.app**.

Hier is de makkelijkste methode via **Render.com** (dit is gratis):

### Stap 1: Maak een GitHub-account aan
Render haalt jouw code op uit een online codearchief genaamd GitHub.
1. Ga naar [https://github.com](https://github.com) en maak een gratis account aan.
2. In Google AI Studio kun je in plaats van een ZIP ook kiezen voor **Export to GitHub**. Hiermee zet je de app direct op jouw GitHub-account!

### Stap 2: Maak een Render-account aan
1. Ga naar [https://render.com](https://render.com) en maak een gratis account aan.
2. Kies bij het registreren voor **Sign up with GitHub**. Zo zijn je accounts direct gekoppeld.

### Stap 3: Maak een nieuwe "Web Service" aan
1. Klik op het Render dashboard op de blauwe knop **New +** en kies **Web Service**.
2. Je ziet nu je GitHub-projecten staan. Klik naast jouw `PartVerifyPro` project op **Connect**.

### Stap 4: Vul de instellingen in
Vul de volgende velden in (Render vult veel al automatisch voor je in!):
* **Name**: Geef je app een naam, bijv. `partverify-pro`
* **Region**: Kies Frankfurt (Europe) voor de snelste verbinding in Nederland.
* **Branch**: `main` (of `master`)
* **Language**: `Node`
* **Build Command**: `npm run build`
* **Start Command**: `npm run start`

### Stap 5: Voeg je beveiligingssleutels toe (Optioneel)
Maak je gebruik van ChatGPT/Gemini functies of specifieke geheime sleutels?
1. Scrol omlaag en klik op **Advanced**.
2. Klik op **Add Environment Variable**.
3. Voeg hier bijvoorbeeld je `GEMINI_API_KEY` toe als je deze gebruikt.

### Stap 6: Klik op "Deploy Web Service"
Klik op de grote blauwe knop onderaan. Render gaat nu je app bouwen en online zetten. Dit duurt ongeveer 2 tot 3 minuten. 

Zodra er een groen bolletje met "Live" verschijnt, zie je linksboven een link staan (bijvoorbeeld `https://partverify-pro.onrender.com`). Dit is jouw persoonlijke, beveiligde link! Iedereen met deze link kan nu gebruik maken van PartVerify Pro.

---
*Tip: Bewaar deze handleiding goed in je map. Als je ooit updates wilt doen, hoef je alleen de nieuwe bestanden in je map te plakken en Render update het automatisch zodra je het naar GitHub stuurt!*
