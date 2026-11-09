// Themakleuren van de meetreeksen: de tokens --series-1..6 in src/style.css (via readColors in draw.js, één keer per themawissel).
import { ui } from "../core/state.js";
import { readColors } from "./draw.js";

export const SERIES_LIGHT = ["#2B6CA3", "#D95F02", "#2F7D4F", "#8E44C7", "#A6861F", "#C2185B"];   // altijd licht: rapportafbeeldingen
export const serieColor = i => {
  readColors();
  return (ui.C.series && ui.C.series[i % 6]) || SERIES_LIGHT[i % 6];
};
