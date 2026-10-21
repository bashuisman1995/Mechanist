import { t } from "../ui/i18n.js";
// Materialen voor de calculators. E en sigma in MPa (= N/mm²), alpha in µm/(m·K), rho in kg/m³.
// sigma = σ_toel (σ_allow): toelaatbare spanning, ≈ vermoeiingssterkte met veiligheid (geen vloeigrens); de gebruiker kan hem aanpassen.
// c = soortelijke warmte J/(kg·K), k = warmtegeleiding W/(m·K), sy = vloeigrens (keramiek: druksterkte) MPa; toegevoegd voor de contact- en thermische calculators.
// Alle waarden zijn typische waarden (MatWeb / leveranciersdatasheets) en dienen als beginschatting.
export const MATERIALS = [
  { id: "staal", E: 210000, nu: 0.30, sigma: 300, alpha: 11.5, rho: 7850, c: 480, k: 46, sy: 1000 },
  { id: "rvs", E: 193000, nu: 0.29, sigma: 250, alpha: 17.3, rho: 7900, c: 500, k: 16, sy: 215 },
  { id: "alu", E: 70000, nu: 0.33, sigma: 120, alpha: 23.6, rho: 2700, c: 896, k: 167, sy: 275 },
  { id: "titaan", E: 114000, nu: 0.34, sigma: 500, alpha: 8.6, rho: 4430, c: 526, k: 6.7, sy: 880 },
  { id: "cube", E: 128000, nu: 0.30, sigma: 600, alpha: 17.0, rho: 8250, c: 420, k: 105, sy: 1100 },
  { id: "fbrons", E: 110000, nu: 0.34, sigma: 200, alpha: 17.8, rho: 8800, c: 380, k: 70, sy: 450 },
  { id: "invar", E: 141000, nu: 0.26, sigma: 250, alpha: 1.2, rho: 8100, c: 515, k: 10.2, sy: 280 },
  { id: "alumina", E: 370000, nu: 0.22, sigma: 150, alpha: 7.2, rho: 3900, c: 880, k: 25, sy: 2500 },
  { id: "wc", E: 600000, nu: 0.22, sigma: 400, alpha: 5.5, rho: 14500, c: 200, k: 85, sy: 4000 },
  { id: "zerodur", E: 90300, nu: 0.243, sigma: 10, alpha: 0.05, rho: 2530, c: 820, k: 1.46, sy: 30 },
];
// weergavenamen en bronnen volgen de gekozen taal (id's blijven Nederlands: zo staan ze in opgeslagen modellen)
MATERIALS.forEach(m => Object.defineProperties(m, {
  naam: { get() { return t("mat." + m.id + ".nm"); }, enumerable: false },
  bron: { get() { return t("mat." + m.id + ".src"); }, enumerable: false }
}));
export const material = id => MATERIALS.find(m => m.id === id) || MATERIALS[0];
export const materialSource = () => t("mat.source");
