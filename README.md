# Mechanismeschets

Een webapp om vlakke (2D) stangenmechanismen te schetsen en door te rekenen:
vierstangen, slinger-krukmechanismen, vijfstangen met meerdere aandrijvingen,
met veren, dempers, krachten en puntmassa's.

Eenheden: mm · N · N/mm · kg.

## Starten

Geen build-stap en geen afhankelijkheden. Open `index.html` in een browser, of
start een lokale server in deze map:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Functies

- **Tekenen:** punten, schakels, scharnieren, glijders (met richting),
  aandrijving (kruk met toerental), veren, dempers, krachten, puntmassa's en
  sporen (baan van een punt). Opleggingen kun je ook los neerzetten en later
  verbinden.
- **Drie rekenmodi** (bovenaan):
  - **Kinematisch:** exacte stand per krukhoek; snelheden en versnellingen
    analytisch uit de Jacobiaan; staafkrachten, oplegreacties en krukmoment uit
    quasi-statisch evenwicht.
  - **Dynamisch:** RK4-tijdintegratie met Lagrange-multipliers en
    Baumgarte-stabilisatie, over een vaste duur.
  - **Evenwicht:** dynamisch, waarbij de duur volgt uit het moment dat het
    mechanisme tot rust komt (instelbare bovengrens).
- **Rekenen op de achtergrond:** dynamisch rekenen gebeurt in stukjes, met
  voortgangsbalk en Stop-knop. Standaard pas je eerst het model aan en druk je
  daarna op **Bereken** (F5); automatisch herberekenen kan aan in Instellingen.
  Selecteren, pannen en zoomen gooien de oplossing niet weg, en ongedaan maken
  haalt een eerdere oplossing zonder rekenen terug.
- **Demping:** optionele rotatiedemping in alle scharnieren (N·m·s/rad) en
  luchtweerstand per punt.
- **Bewerken op t = 0:** buiten t = 0 kun je alleen kijken; een balk en de
  oranje knop brengen je terug naar t = 0 (of druk op Home).
- **Metingen:** kies grootheden in een compacte tabel (één regel per onderdeel),
  of direct vanuit het eigenschappenpaneel van het geselecteerde onderdeel.
  **Formules** zoals `C.x - C.y` of `hypot(C.vx, C.vy)`: klik grootheden aan om
  ze in de formule te zetten; hoofdletters maken niet uit en `c_x` mag ook.
  Elke eenheid krijgt een eigen deelgrafiek; het paneel groeit mee. CSV-export.
  De keuzelijst is een zijpaneel: de tekening blijft zichtbaar, puntnamen
  blijven leesbaar en een regel aanwijzen laat het onderdeel oplichten.
- **Overzichtelijke tekening:** labels die elkaar overlappen vallen weg, en bij
  uitzoomen verdwijnen eerst de details en daarna de namen.
- **Voorbeelden** (menu Model): vierstang, slinger-kruk, compressor met veer,
  vijfstang met twee motoren, Hoeken-rechtgeleiding, Jansen-poot
  (Strandbeest), veerslinger, dubbele slinger en een arm die tot rust komt.
- **Opslaan en delen:** automatisch in `localStorage`, export/import als JSON en
  een deelbare link (model in de URL); ongedaan maken/opnieuw.

## Sneltoetsen

| Toets | Gereedschap | Toets | Gereedschap |
|---|---|---|---|
| V | Selecteren | R | Veer |
| N | Punt | C | Demper |
| L | Schakel | F | Kracht |
| P | Scharnier | M | Massa |
| S | Glijder | T | Spoor |
| D | Aandrijving | X | Verwijderen |

Spatie: afspelen/pauzeren · Home: terug naar t = 0 · F5: dynamisch doorrekenen ·
Ctrl+Z / Ctrl+Shift+Z: ongedaan maken/opnieuw ·
Delete: selectie verwijderen · Esc: selectie opheffen.

## Projectstructuur

```
index.html      opmaak van de app (topbalk, canvas, panelen, dialogen)
css/style.css   vormgeving, inclusief licht en donker thema
js/app.js       alle logica: model, solver, kinematica, dynamica, tekenen,
                metingen, opslaan
```

`js/app.js` is opgebouwd in blokken, in deze volgorde:

| Blok | Belangrijkste functies |
|---|---|
| Model en weergave | `model`, `toScr`/`toWld`, `fit`, `zoomAt` |
| Gereedschappen | `TOOLS`, `setTool` |
| Constraint-solver | `constraintRows`, `gauss`, `relax`, `lsq` |
| Kinematica | `kinAt`, `computeSweep` |
| Dynamica | `computeDyn` |
| Krachten | `forcesAt` |
| Tekenen | `draw`, `drawLink`, `drawSpring`, `drawSupport`, … |
| Eigenschappenpaneel | `syncInspector` |
| Metingen en plot | `channels`, `chVal`, `compile`, `drawPlot` |
| Opslaan en historie | `save`/`load`, `doc`/`loadDoc`, `undo`/`redo` |
