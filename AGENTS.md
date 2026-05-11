# Project Status: PartVerify Pro (Norm)
Datum: 2026-05-08

## Kernfunctionaliteit
PartVerify Pro is een gespecialiseerde tool voor automotive professionals om eindcalculaties te verifiëren tegen inkoopfacturen.

### Belangrijkste Functies
- **Automatische Verificatie**: Matchen van onderdelen op basis van onderdeelnummer (genormaliseerd) en semantische beschrijving (bijv. "rooster" vs "grille").
- **Prijs Parsing**: Geavanceerde herkenning van valutanotaties (bijv. `79.28` of `1.234,56`), geoptimaliseerd voor uitdraaien uit schade-calculatiesystemen.
- **Beveiliging**: Twee-staps verificatie (2FA) via TOTP (bijv. Microsoft Authenticator) instelbaar vanuit de instellingenpagina.
- **Instellingen**: Speciaal dashboard voor accountbeveiliging en systeemconfiguratie.
- **Handmatige Overrides**: Mogelijkheid om prijzen handmatig aan te passen door op een prijsveld te klikken en direct een nieuwe waarde in te voeren.
- **PDF Rapportage**: Genereren van een professioneel PDF-verslag inclusief samenvatting, totalen en statistieken.

## Technische Keuzes
- **Framework**: React 18 met Tailwind CSS voor styling.
- **Animaties**: Framer Motion (`motion/react`) voor vloeiende transities.
- **PDF**: `jspdf` en `jspdf-autotable`.
- **Icons**: `lucide-react`.

## Ontwerpnormen
- **Branding**: "Developed by Danny Radjkoemar" moet prominent aanwezig zijn in de header en PDF footer.
- **Kleurenpalet**: Blauw (`blue-600`) als accentkleur, met Emerald (`emerald-600`) voor OK-statussen en Rose voor afwijkingen.
- **Gebruiksgemak**: Focus op "Paste & Go" flow. Geen complexe navigatie, alles op één dashboard.

## Login Gegevens
- **Wachtwoord**: `Danitsha2015!`

---
*Dit document dient als herstelpunt en definitie van de applicatie-architectuur.*
