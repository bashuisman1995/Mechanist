// Materialen voor de calculators. E en sigma in MPa (= N/mm²), alpha in µm/(m·K), rho in kg/m³.
// sigma = σ_toel: toelaatbare spanning, ≈ vermoeiingssterkte met veiligheid (geen vloeigrens); de gebruiker kan hem aanpassen.
// Alle waarden zijn typische waarden (MatWeb / leveranciersdatasheets) en dienen als beginschatting.
export const MATERIALS = [
  { id: "staal", naam: "Staal (veerstaal)", E: 210000, nu: 0.30, sigma: 300, alpha: 11.5, rho: 7850,
    bron: "veerstaal/koolstofstaal, typische waarden uit MatWeb" },
  { id: "rvs", naam: "RVS (AISI 304)", E: 193000, nu: 0.29, sigma: 250, alpha: 17.3, rho: 7900,
    bron: "AISI 304 uitgegloeid, MatWeb; koud verstevigd (301) kan veel hoger" },
  { id: "alu", naam: "Aluminium (6061-T6)", E: 70000, nu: 0.33, sigma: 120, alpha: 23.6, rho: 2700,
    bron: "6061-T6, MatWeb; σ_toel is een vermoeiingswaarde" },
  { id: "titaan", naam: "Titanium (Ti-6Al-4V)", E: 114000, nu: 0.34, sigma: 500, alpha: 8.6, rho: 4430,
    bron: "Ti-6Al-4V (graad 5), MatWeb" },
  { id: "cube", naam: "Berylliumkoper CuBe2", E: 128000, nu: 0.30, sigma: 600, alpha: 17.0, rho: 8250,
    bron: "CuBe2 (C17200) verouderd, leveranciersdatasheet (o.a. Materion) en MatWeb" },
  { id: "fbrons", naam: "Fosforbrons (CuSn6)", E: 110000, nu: 0.34, sigma: 200, alpha: 17.8, rho: 8800,
    bron: "CuSn6 (C51900) veerhard, leveranciersdatasheet en MatWeb" },
  { id: "invar", naam: "Invar 36", E: 141000, nu: 0.26, sigma: 250, alpha: 1.2, rho: 8100,
    bron: "Invar 36 (FeNi36), leveranciersdatasheet en MatWeb" },
];
export const material = id => MATERIALS.find(m => m.id === id) || MATERIALS[0];
export const MATERIAL_SOURCE = "Typische waarden uit MatWeb (matweb.com) en leveranciersdatasheets; spreiding tussen charges en toestanden is groot, dus controleer met de datasheet van je leverancier.";
