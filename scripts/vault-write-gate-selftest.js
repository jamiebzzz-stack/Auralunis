// Vault write-path premium-gate deterministic self-test.
//
// Product decision: the Encrypted Vault is entirely premium. Reading it is gated (VaultScreen), and
// WRITING to it must be gated too — a non-entitled user cannot save into the Vault from any surface.
// Every write surface must guard with `if (!isPremium) { openPaywall(); return; }` BEFORE the write.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const GUARD = "if (!isPremium) { openPaywall(); return; }";

// Assert the premium guard appears within `window` chars BEFORE the write call (same handler).
function guardedWrite(rel, writeMarker, label) {
  const src = read(rel);
  const writeIdx = src.indexOf(writeMarker);
  if (writeIdx < 0) { bad(`${label}: write call found (${writeMarker})`); return; }
  ok(`${label}: write call found`);
  const before = src.slice(Math.max(0, writeIdx - 320), writeIdx);
  if (before.includes(GUARD)) ok(`${label}: write is premium-gated (paywall before write)`);
  else bad(`${label}: write is NOT premium-gated — expected the guard before it`);
}

console.log("── Every Vault write surface is premium-gated ──");
guardedWrite("src/screens/SkyScreen.tsx", 'addItem({ type: "archive", title: object.name, detail: object.summary });', "Sky deep-sky 'Save + Find'");
guardedWrite("src/screens/HomeScreen.tsx", "addNote(trimmed);", "Home Cosmic Notes");
// Match the semantic object field rather than one exact one-line formatting style.
guardedWrite("src/screens/LearnDetailScreen.tsx", 'type: "lesson",', "Learn lesson mark 'Save'");
guardedWrite("src/features/sky-lens/SkyLensScreen.tsx", 'addItem({\n        type: "archive",', "Sky Lens object save");

console.log(`\nVault write-path premium-gate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
