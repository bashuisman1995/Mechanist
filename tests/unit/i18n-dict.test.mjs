// Every dictionary entry has a non-empty English and Dutch text, and placeholders match between the two.
import test from "node:test";
import assert from "node:assert/strict";
import { DICTS } from "../../src/ui/i18n.js";

const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(",");

test("i18n: every key has English and Dutch text with the same placeholders", () => {
  const keys = Object.keys(DICTS.en);
  assert.ok(keys.length > 500, "dictionaries loaded");
  const bad = [];
  for (const k of keys) {
    const en = DICTS.en[k], nl = DICTS.nl[k];
    if (typeof en !== "string" || !en.trim()) bad.push(k + ": empty en");
    else if (typeof nl !== "string" || !nl.trim()) bad.push(k + ": empty nl");
    else if (ph(en) !== ph(nl)) bad.push(k + ": placeholders differ");
  }
  assert.deepEqual(bad, []);
});
