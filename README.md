# Mechanismeschets

Een webapp om vlakke (2D) stangenmechanismen te schetsen en door te rekenen:
vierstangen, slinger-krukmechanismen, vijfstangen met meerdere aandrijvingen,
met veren, dempers, krachten en puntmassa's.

Eenheden: mm · N · N/mm · kg.

## Starten

`index.html` is de complete app in één bestand, zonder afhankelijkheden
(alleen het lettertype komt van Google Fonts; zonder internet valt het terug
op een systeemlettertype). Dubbelklik erop, of zet het op een website.

De app begint bij elke keer openen schoon, met een voorbeeld. Je werk bewaar
je als bestand: **Model → Opslaan als bestand** (Ctrl+S) maakt een
`.mech.json` in je map Downloads; **Model → Openen** (Ctrl+O) of het bestand
op het venster slepen laadt het weer. Wie vergeet op te slaan: het werk van de
vorige keer staat onder **Model → Vorige sessie herstellen**, en de browser
waarschuwt bij het sluiten van een tabblad met niet-opgeslagen wijzigingen.

## Hosten

Het is een statische pagina: alleen `index.html` hoeft op de server.

- **GitHub Pages** (gratis, deze repo is openbaar): Settings → Pages →
  *Deploy from a branch* → kies de branch en map `/ (root)` → Save. Na een
  minuut staat de app op `https://<gebruiker>.github.io/Mechanist/`.
- **Eigen website of een dienst als Netlify**: upload `index.html` (hernoem
  hem gerust, bijvoorbeeld naar `mechanisme.html`).

## Ontwikkelen

De bron staat in `src/` als ES-modules: `src/core/` is de rekenkern (geen
DOM, draait ook in Node), `src/ui/` de interface en `src/main.js` het
startpunt. Open `src/index.html` via een lokale server om zonder bouwen te
testen. Bouwen en controleren:

```sh
npm ci                  # eenmalig: esbuild
npm run build           # bundelt src/ en schrijft index.html
npm run check           # controleert of index.html actueel is (ook op GitHub)
NODE_PATH=<map met playwright>/node_modules node tests/e2e/run.mjs   # browsertests
```

## Functies

- **Tekenen:** punten, schakels, scharnieren, glijders (met richting),
  aandrijving (kruk met toerental), **lineaire actuatoren** (lengte gaat
  sinusvormig heen en weer tussen kortst en langst, met een frequentie in Hz),
  veren, dempers, krachten, puntmassa's en
  sporen (baan van een punt). Opleggingen kun je ook los neerzetten en later
  verbinden.
- **Vijf rekenmodi** (bovenaan):
  - **Kinematisch:** exacte stand per krukhoek; snelheden en versnellingen
    analytisch uit de Jacobiaan; staafkrachten, oplegreacties en krukmoment uit
    quasi-statisch evenwicht.
  - **Dynamisch:** RK4-tijdintegratie met Lagrange-multipliers en
    Baumgarte-stabilisatie, over een vaste duur.
  - **Evenwicht:** dynamisch, waarbij de duur volgt uit het moment dat het
    mechanisme tot rust komt (instelbare bovengrens).
  - **FRF:** frequentieresponsie rond het statische evenwicht. Ingang: een
    actuator (lengte), kruk (hoek) of kracht; uitgang: de metingen die je kiest
    (positie, snelheid, versnelling, veer- of demperkracht, actuatorlengte).
    Toont amplitude en fase (Bode), de eigenfrequenties met modale demping, en
    een animatie van de trillingsvorm bij de gekozen frequentie.
  - **Stijfheid:** lineaire statica van het getekende raamwerk met buigende
    balken. Een schakel krijgt de stijfheid **Volledig (EA + EI)**: een 2D
    Euler–Bernoulli-balk (profiel rechthoek, rond, buis of eigen A en I; materiaal
    uit de materialenlijst). Per punt kies je de verbinding: **Star** (■,
    momentvast), **Scharnier** (○) of **Torsieveer** (k<sub>θ</sub>); een
    oplegging kan **Ingeklemd** zijn. *Auto* is Star in een vrij punt met een
    balk en Scharnier bij een oplegging. **Knoop op balk** (O, of de knop bij
    Eigenschappen) splitst een balk met een punt ertussen. Axiale staven, veren,
    krachtopnemers, flexures (draaiveer), contacten (k<sub>n</sub> bij de
    huidige indringing) en opleggingen (scharnier, glijder, inklemming) doen
    mee; een Oneindige schakel rekent als balk met EA en EI van 10<sup>5</sup>×
    de grootste elastische stijfheid. Resultaat: vervormde lijn (kubische
    Hermite) met automatische vergroting en schuifregelaar, kleur naar
    σ/σ<sub>toel</sub>, verplaatsingen (µm, µrad), reacties, maximale spanning
    en plaats, **stijfheid in een punt** (k = F/δ in N/µm) en de eerste zes
    eigenfrequenties met animatie. Een mechanisme wordt in gewone taal benoemd.
    Waar het model een standaardgeval is (uitkraging, geleide uitkraging, vrij
    opgelegde balk) staat de formule van Roark naast de FE-uitkomst.
    Eerste orde: de tekening is de onbelaste stand; spanningsverstijving en
    afschuiving zijn verwaarloosd.
- **Rekenen op de achtergrond:** dynamisch rekenen gebeurt in stukjes, met
  voortgangsbalk en Stop-knop. Standaard pas je eerst het model aan en druk je
  daarna op **Bereken** (F5); automatisch herberekenen kan aan in Instellingen.
  Selecteren, pannen en zoomen gooien de oplossing niet weg, en ongedaan maken
  haalt een eerdere oplossing zonder rekenen terug.
- **Demping:** optionele rotatiedemping in alle scharnieren (N·m·s/rad) en
  luchtweerstand per punt.
- **Wrijving** per scharnier en glijder, met μ statisch en μ dynamisch
  (Stribeck, niet puur Coulomb) en een penstraal voor scharnieren. In
  Dynamisch en Evenwicht met echt plakken: bij stilstand wordt de
  benodigde houdkracht uitgerekend en pas boven μs·N schiet het los.
  In Kinematisch telt wrijving mee in krachten en motorkoppel; in de FRF niet
  (niet lineair). Gecontroleerd met een blok op een helling van 25°.
- **Speling** (toets G): een lineair element dat vrij beweegt tussen kortst en
  langst en daarbuiten een aanslag (stijfheid + demping) raakt. Werkt in
  Dynamisch en Evenwicht; in Kinematisch als kracht; in de FRF als stijfheid
  wanneer hij in evenwicht tegen een aanslag ligt.
- **Contact** (toets K): een bal (het punt) op een star vlak, met Hertz-normaalkracht
  F = 4/3·E*·√R·δ^(3/2) (materialen staal, RVS, aluminium, keramiek, hardmetaal) en
  Mindlin-achtig plakken en slippen: een tangentiële veer k_t = 8·G*·a die tot μ·F_n
  plakt en daarna slipt (hysterese). Werkt in Dynamisch en Evenwicht; Kinematisch
  geeft alleen F_n, FRF alleen de Hertz-stijfheid.
- **Flexure** (toets B): bladveer (uitkraging), kruisveerscharnier of scharnier met inkeping als
  pseudo-starre-lichaammodel (Howell): een stijve schakel met in punt a een draaiveer, K = γ·K_Θ·E·I/L
  (γ = 0,85, K_Θ = 2,65; de andere typen uit `src/calc/flexures.js`). Live hoek, moment en spanning met een
  oranje waarschuwing boven σ_toelaatbaar; kanalen φ, σ en M. Draaiveer in Dynamisch, Evenwicht en FRF; in
  Kinematisch puur scharnier met spanning. Voorbeeld: parallelgeleiding (PRBM +3,9 % op 24EI/L³).
- **Sensoren** (toetsen Q, W, H, J): zodat je ziet wat er gemeten wordt en wat de sensor met het systeem doet.
  **Krachtopnemer** (loadcell): axiale veer k_s (standaard 100 N/µm), optioneel met massa; F = k_s·Δ en hij zit in serie met
  de rest, 1/k_tot = 1/k + 1/k_s, dus hij verlaagt de eigenfrequentie. **Verplaatsingssensor**: afstand of positie langs een
  richting in µm, met bereik (rood bij "buiten bereik") en resolutie. **Hoekencoder**: hoek in een scharnier (°, µrad) met
  counts/omwenteling, dus kwantisatie. **Versnellingsopnemer**: massa (standaard 10 g) erbij op het punt, meet a in m/s² en g.
  Elke sensor maakt zijn kanalen zelf aan (keuzelijst, groep "Sensoren" bovenaan) en toont live een label op de tekening.
  Massa en stijfheid doen mee in Dynamisch, Evenwicht en FRF; Kinematisch: krachtopnemer als stijve schakel, kracht uit de
  statica. Voorbeeld: Loadcell in de krachtweg (14,5 Hz tegen 15,9 Hz zonder opnemer).
- **Axiale staven** (Eigenschappen van een schakel, Stijfheid: *Axiaal*): in plaats van een stijve randvoorwaarde een veer
  k = E·A/L langs de staaf, met materiaal en doorsnede (oppervlak A of profiel b×h). In Dynamisch, Evenwicht en FRF werkt hij als stijve
  veer; in Kinematisch blijft hij stijf maar N, ΔL (µm) en σ (MPa) worden getoond (kanalen onder Stangen). De staaf is iets dunner getekend
  met een klein "EA"-label, dat oranje wordt (en de inspector waarschuwt) als de tijdstap boven 2,8/ω ligt.
- **Temperatuur** (Instellingen → Temperatuur, en per staaf een eigen ΔT): elke schakel (standaard staal, materiaal kies je bij Eigenschappen)
  krijgt de lengte L·(1 + α·ΔT). Kinematisch rekent het mechanisme opnieuw en het Resultaat toont de *thermische verschuiving* van een gekozen
  punt (Δx, Δy in µm) met een staafgrafiek van ∂x/∂L·α·L·ΔT per staaf, analytisch uit de Jacobiaan (J·dq = dL). Bij axiale staven in een
  overbepaalde constructie geeft Evenwicht de thermische spanning, N = EA·(ΔL_geom − α·L·ΔT)/L (ingeklemd: N = −E·A·α·ΔT). Voorbeelden:
  Thermische drift van een meetarm, Thermische spanning in een ingeklemde staaf.
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
- **Opslaan en delen:** opslaan als `.mech.json`-bestand en weer openen (ook
  door slepen), een deelbare link (model in de URL), kopiëren en plakken als
  JSON, en ongedaan maken/opnieuw.

## Sneltoetsen

| Toets | Gereedschap | Toets | Gereedschap |
|---|---|---|---|
| V | Selecteren | R | Veer |
| N | Punt | C | Demper |
| L | Schakel | F | Kracht |
| P | Scharnier | M | Massa |
| S | Glijder | T | Spoor |
| D | Aandrijving | X | Verwijderen |
| A | Actuator | G | Speling |
| B | Flexure | K | Contact |
| Q | Krachtopnemer | W | Verplaatsingssensor |
| H | Hoekencoder | J | Versnellingsopnemer |

Spatie: afspelen/pauzeren · Home: terug naar t = 0 · F5: doorrekenen ·
Ctrl+S: opslaan als bestand · Ctrl+O: openen ·
Ctrl+Z / Ctrl+Shift+Z: ongedaan maken/opnieuw ·
Delete: selectie verwijderen · Esc: selectie opheffen.

## Hoe de FRF werkt

1. Alle aandrijvingen worden vastgezet en het statische evenwicht wordt gezocht
   als minimum van de potentiële energie (veren, zwaartekracht, krachten).
2. Kleine bewegingen worden beschreven in de vrijheidsgraden die de
   randvoorwaarden toelaten (de nulruimte `Z` van hun Jacobiaan), plus een
   vaste vorm `p` voor de ingang: `q = q0 + Z·η + p·u`.
3. Massa `Zᵀ M Z`, demping `Zᵀ C Z` en stijfheid `∂²V/∂η²` (numeriek, dus
   inclusief de stijfheid die zwaartekracht aan een slinger geeft).
4. Per frequentie wordt `(K − ω²M + iωC)·η = F(ω)` opgelost.

Gecontroleerd tegen handberekeningen: massa-veer 3,56 Hz, ζ 6,7 %, piek 7,5;
slinger van 120 mm 1,44 Hz.

## Projectstructuur

```
index.html        de app in één bestand (gegenereerd, niet met de hand bewerken)
src/index.html    opmaak
src/style.css     vormgeving, licht en donker thema
src/main.js       startpunt
src/core/         rekenkern: state, linalg, elements, kinematics, dynamics,
                  frf, channels, formula, contact, flexure, sensors, axial, thermal
src/ui/           tekenen, inspector, grafieken, metingen, afspelen, bestanden, ...
tools/build.py    bundelt met esbuild en schrijft index.html
tests/e2e/        browsertests tegen gecontroleerde waarden
```

