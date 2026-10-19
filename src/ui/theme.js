// Themakleuren van de meetreeksen.
export const SERIES_LIGHT = ["#2B6CA3", "#D95F02", "#2F7D4F", "#8E44C7", "#A6861F", "#C2185B"];
const SERIES_DARK  = ["#6FA8DC", "#D0701C", "#7CC395", "#A06CD6", "#A88C1E", "#E4527F"];
const isDark = () => {
  const a = document.documentElement.getAttribute("data-theme");
  return a ? a === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
export const serieColor = i => (isDark() ? SERIES_DARK : SERIES_LIGHT)[i % 6];
