// Materialen voor de calculators. E en sigma in MPa (= N/mm²), alpha in µm/(m·K), rho in kg/m³.
// sigma = σ_toel: toelaatbare spanning, ≈ vermoeiingssterkte met veiligheid (geen vloeigrens); de gebruiker kan hem aanpassen.
// c = soortelijke warmte J/(kg·K), k = warmtegeleiding W/(m·K), sy = vloeigrens (keramiek: druksterkte) MPa; toegevoegd voor de contact- en thermische calculators.
// Alle waarden zijn typische waarden (MatWeb / leveranciersdatasheets) en dienen als beginschatting.
export const MATERIALS = [
  { id: "staal", naam: "Staal (veerstaal)", E: 210000, nu: 0.30, sigma: 300, alpha: 11.5, rho: 7850, c: 480, k: 46, sy: 1000,
    bron: "veerstaal/koolstofstaal, typische waarden uit MatWeb" },
  { id: "rvs", naam: "RVS (AISI 304)", E: 193000, nu: 0.29, sigma: 250, alpha: 17.3, rho: 7900, c: 500, k: 16, sy: 215,
    bron: "AISI 304 uitgegloeid, MatWeb; koud verstevigd (301) kan veel hoger" },
  { id: "alu", naam: "Aluminium (6061-T6)", E: 70000, nu: 0.33, sigma: 120, alpha: 23.6, rho: 2700, c: 896, k: 167, sy: 275,
    bron: "6061-T6, MatWeb; σ_toel is een vermoeiingswaarde" },
  { id: "titaan", naam: "Titanium (Ti-6Al-4V)", E: 114000, nu: 0.34, sigma: 500, alpha: 8.6, rho: 4430, c: 526, k: 6.7, sy: 880,
    bron: "Ti-6Al-4V (graad 5), MatWeb" },
  { id: "cube", naam: "Berylliumkoper CuBe2", E: 128000, nu: 0.30, sigma: 600, alpha: 17.0, rho: 8250, c: 420, k: 105, sy: 1100,
    bron: "CuBe2 (C17200) verouderd, leveranciersdatasheet (o.a. Materion) en MatWeb" },
  { id: "fbrons", naam: "Fosforbrons (CuSn6)", E: 110000, nu: 0.34, sigma: 200, alpha: 17.8, rho: 8800, c: 380, k: 70, sy: 450,
    bron: "CuSn6 (C51900) veerhard, leveranciersdatasheet en MatWeb" },
  { id: "invar", naam: "Invar 36", E: 141000, nu: 0.26, sigma: 250, alpha: 1.2, rho: 8100, c: 515, k: 10.2, sy: 280,
    bron: "Invar 36 (FeNi36), leveranciersdatasheet en MatWeb" },
  { id: "alumina", naam: "Alumina (Al2O3, 96 %)", E: 370000, nu: 0.22, sigma: 150, alpha: 7.2, rho: 3900, c: 880, k: 25, sy: 2500,
    bron: "Al2O3 96 %, leveranciersdatasheets (o.a. CoorsTek) en MatWeb; sy = druksterkte, keramiek vloeit niet" },
  { id: "wc", naam: "Hardmetaal (WC-Co)", E: 600000, nu: 0.22, sigma: 400, alpha: 5.5, rho: 14500, c: 200, k: 85, sy: 4000,
    bron: "WC-6Co, leveranciersdatasheets en MatWeb; sy = druksterkte" },
  { id: "zerodur", naam: "Zerodur (glaskeramiek)", E: 90300, nu: 0.243, sigma: 10, alpha: 0.05, rho: 2530, c: 820, k: 1.46, sy: 30,
    bron: "Zerodur klasse 0, Schott datasheet; σ_toel en sy zijn conservatieve ontwerpwaarden voor glas (trek), geen vloeigrens" },
];
export const material = id => MATERIALS.find(m => m.id === id) || MATERIALS[0];
export const MATERIAL_SOURCE = "Typische waarden uit MatWeb (matweb.com) en leveranciersdatasheets; spreiding tussen charges en toestanden is groot, dus controleer met de datasheet van je leverancier.";
