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
  sporen (baan van een punt).
- **Kinematisch rekenen:** exacte stand per krukhoek; snelheden en
  versnellingen analytisch uit de Jacobiaan; staafkrachten, oplegreacties en
  krukmoment uit quasi-statisch evenwicht.
- **Dynamisch rekenen:** RK4-tijdintegratie van de bewegingsvergelijkingen met
  Lagrange-multipliers en Baumgarte-stabilisatie; zwaartekracht en viskeuze
  demping optioneel; vast tijdvenster of rekenen tot evenwicht.
- **Metingen:** grafieken van posities, snelheden, versnellingen, krachten,
  reacties, krukmoment en energie, met eigen formules en export als CSV.
- **Bewerken:** ongedaan maken/opnieuw, schetsen of vormvast slepen,
  vrijheidsgradentelling.
- **Opslaan en delen:** automatisch in `localStorage`, export/import als JSON en
  een deelbare link (model in de URL).

## Sneltoetsen

| Toets | Gereedschap | Toets | Gereedschap |
|---|---|---|---|
| V | Selecteren | R | Veer |
| N | Punt | C | Demper |
| L | Schakel | F | Kracht |
| P | Scharnier | M | Massa |
| S | Glijder | T | Spoor |
| D | Aandrijving | X | Verwijderen |

Spatie: afspelen/pauzeren · Ctrl+Z / Ctrl+Shift+Z: ongedaan maken/opnieuw ·
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
