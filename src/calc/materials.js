// Materialen voor de calculators. E en sigma in MPa (= N/mm²).
export const MATERIALS = [
  { id: "staal", naam: "Staal (veerstaal)", E: 210000, nu: 0.30, sigma: 300 },
  { id: "rvs", naam: "RVS", E: 193000, nu: 0.29, sigma: 250 },
  { id: "alu", naam: "Aluminium", E: 70000, nu: 0.33, sigma: 120 },
  { id: "titaan", naam: "Titanium", E: 114000, nu: 0.34, sigma: 500 },
  { id: "cube", naam: "Brons / CuBe", E: 128000, nu: 0.30, sigma: 600 },
  { id: "invar", naam: "Invar", E: 141000, nu: 0.26, sigma: 250 },
];
export const material = id => MATERIALS.find(m => m.id === id) || MATERIALS[0];
