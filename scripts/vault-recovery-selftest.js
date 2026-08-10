// Vault recovery / data-integrity deterministic self-test.
//
// Guards the two defects found in the 31a2a366 deep audit:
//
//   H4  A transient decrypt failure plus one new note made the existing notes unreachable.
//       The old code cleared loadFailedRef inside addItem whenever a recovery copy existed,
//       so the persistence effect then overwrote the MAIN blob with just the new item, and
//       nothing ever read the recovery slot back.
//
//   M4  A successful decrypt whose entries failed sanitisation wrote the sanitised SUBSET
//       back over the main blob, silently dropping older/unknown-schema entries.
//
// And the interaction between the two fixes: an unparsable entry must not suppress the
// pending/recovery merge, or a note written during a failed session is stranded forever
// (that entry re-fails parsing on every future launch).
//
// This drives the REAL decision functions from src/state/vaultPersistence.ts against an
// in-memory storage, so it cannot pass by re-implementing the logic it is testing.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const ts = require(path.join(ROOT, "node_modules/typescript"));
require.extensions[".ts"] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const V = require(path.join(SRC, "state/vaultPersistence.ts"));

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const note = (id, detail) => ({
  id, type: "note", title: "Cosmic Note", detail, createdAtISO: "2026-01-01T00:00:00.000Z",
});
// An entry a FUTURE build writes and this build cannot parse. It must survive untouched.
const UNKNOWN = { id: "future-1", type: "constellation-sketch", payload: { strokes: 12 } };

console.log("── Part A: single-pass split (no reference-identity contract) ──");
{
  const { valid, rejected } = V.splitVaultItems([note("a", "one"), UNKNOWN, note("b", "two")]);
  eq("A valid entries extracted", valid.map((i) => i.id), ["a", "b"]);
  eq("A unknown entry captured verbatim", rejected, [UNKNOWN]);
  eq("A non-array input is inert", V.splitVaultItems("nope"), { valid: [], rejected: [] });
  // The split must not depend on the sanitizer returning the same object references.
  const cloned = JSON.parse(JSON.stringify([note("a", "one"), UNKNOWN]));
  eq("A works on structurally-equal clones", V.splitVaultItems(cloned).rejected.length, 1);
}

console.log("\n── Part B: write target + payload ──");
{
  eq("B healthy session writes the main blob", V.selectWriteTarget(false), V.VAULT_STORAGE_KEY);
  eq("B failed session writes the pending slot", V.selectWriteTarget(true), V.VAULT_PENDING_STORAGE_KEY);
  // The lossless-write invariant: unknown entries ride along on every MAIN write.
  eq(
    "B main write carries unknown entries through",
    V.composeWritePayload([note("a", "one")], [UNKNOWN], false),
    [note("a", "one"), UNKNOWN]
  );
  // A pending write must NOT carry them — they still live in the untouched main blob.
  eq(
    "B pending write carries items only",
    V.composeWritePayload([note("new", "written during outage")], [UNKNOWN], true),
    [note("new", "written during outage")]
  );
}

console.log("\n── Part C: the H4 + M4 scenario, end to end ──");
{
  // In-memory storage standing in for AsyncStorage. `decrypt` fails when the blob is fenced.
  const storage = new Map();
  let decryptWorks = true;
  const write = (k, items) => storage.set(k, JSON.stringify(items));
  const read = (k) => {
    if (!storage.has(k)) return null;
    if (!decryptWorks) return null; // transient Keychain/decrypt outage
    return JSON.parse(storage.get(k));
  };

  // LAUNCH 1 — healthy. Vault holds a real note AND an entry this build cannot parse.
  write(V.VAULT_STORAGE_KEY, [note("keeper", "the user's existing note"), UNKNOWN]);

  // LAUNCH 2 — decrypt fails. Main blob is fenced; the user adds a note anyway.
  decryptWorks = false;
  const loadFailed = read(V.VAULT_STORAGE_KEY) === null;
  eq("C launch2 load is marked failed", loadFailed, true);
  const target = V.selectWriteTarget(loadFailed);
  eq("C launch2 writes to the pending slot", target, V.VAULT_PENDING_STORAGE_KEY);
  const created = note("pending-1", "written during the outage");
  write(target, V.composeWritePayload([created], [], loadFailed));

  // THE H4 REGRESSION: the main blob must be byte-identical — untouched by that session.
  eq(
    "C launch2 leaves the main blob untouched",
    JSON.parse(storage.get(V.VAULT_STORAGE_KEY)).map((e) => e.id),
    ["keeper", "future-1"]
  );

  // LAUNCH 3 — healthy again. The unparsable entry is still present, and must NOT suppress
  // the merge (that was the stranding bug).
  decryptWorks = true;
  const mainRaw = read(V.VAULT_STORAGE_KEY);
  const { valid, rejected } = V.splitVaultItems(mainRaw);
  eq("C launch3 parses the surviving note", valid.map((i) => i.id), ["keeper"]);
  eq("C launch3 still holds the unknown entry", rejected, [UNKNOWN]);

  const pendingSlot = V.splitVaultItems(read(V.VAULT_PENDING_STORAGE_KEY));
  const folded = V.foldAuxiliarySlot(valid, pendingSlot, rejected);
  eq("C launch3 merge is required", folded.changed, true);

  // THE STRANDED-NOTE REGRESSION: the pending note is now visible in the vault.
  eq(
    "C launch3 restores the pending note",
    folded.items.map((i) => i.id).sort(),
    ["keeper", "pending-1"]
  );
  // THE M4 REGRESSION: the unknown entry survives, verbatim, exactly once.
  eq("C launch3 preserves the unknown entry", folded.unknownEntries, [UNKNOWN]);

  // The durable write that precedes deleting the slot must contain everything.
  const payload = V.composeWritePayload(folded.items, folded.unknownEntries, false);
  write(V.VAULT_STORAGE_KEY, payload);
  storage.delete(V.VAULT_PENDING_STORAGE_KEY); // only after the write above
  eq(
    "C final main blob holds note + restored note + unknown entry",
    JSON.parse(storage.get(V.VAULT_STORAGE_KEY)).map((e) => e.id).sort(),
    ["future-1", "keeper", "pending-1"]
  );

  // LAUNCH 4 — the unknown entry must not multiply, and must never be lost.
  const relaunch = V.splitVaultItems(read(V.VAULT_STORAGE_KEY));
  eq("C launch4 unknown entry is still exactly one", relaunch.rejected, [UNKNOWN]);
  eq("C launch4 both notes visible", relaunch.valid.map((i) => i.id).sort(), ["keeper", "pending-1"]);
}

console.log("\n── Part E: an unknown entry must never multiply ──");
{
  // The defect this guards: a healthy launch used to copy the readable main blob into the
  // recovery slot merely because it held an unparsable record, then immediately folded that
  // slot back in — duplicating the record. The enlarged blob re-failed parsing next launch,
  // so the count DOUBLED every time: 1 -> 2 -> 4 -> 8 -> 16.
  let main = [note("keeper", "the user's existing note"), UNKNOWN];

  for (let launch = 1; launch <= 5; launch += 1) {
    const { valid, rejected } = V.splitVaultItems(main);
    // Healthy load: unparsable entries are held, and NO recovery copy is taken (they already
    // persist losslessly in the main blob). Nothing to fold, so the vault is simply rewritten.
    main = V.composeWritePayload(valid, rejected, false);
    const copies = V.splitVaultItems(main).rejected.length;
    eq(`E launch ${launch}: exactly one unknown entry`, copies, 1);
  }
  eq("E the real note survives every launch", V.splitVaultItems(main).valid.map((i) => i.id), ["keeper"]);

  // Defence in depth for a recovery slot already sitting on a user's device from an older
  // build: folding it must not duplicate a record we are already carrying.
  const legacySlot = V.splitVaultItems([note("keeper", "x"), UNKNOWN]);
  const folded = V.foldAuxiliarySlot([note("keeper", "x")], legacySlot, [UNKNOWN]);
  eq("E legacy recovery slot does not duplicate a known unknown", folded.unknownEntries, [UNKNOWN]);
  eq("E nothing to merge, so no rewrite is triggered", folded.changed, false);

  // A slot carrying the same record twice collapses to one.
  const dupSlot = { valid: [], rejected: [UNKNOWN, JSON.parse(JSON.stringify(UNKNOWN))] };
  eq(
    "E duplicates within one slot collapse",
    V.foldAuxiliarySlot([], dupSlot, []).unknownEntries,
    [UNKNOWN]
  );

  // A genuinely NEW unknown record must still be adopted.
  const OTHER = { id: "future-2", type: "nebula-sketch", payload: 1 };
  eq(
    "E a genuinely new unknown entry is still adopted",
    V.foldAuxiliarySlot([], { valid: [], rejected: [OTHER] }, [UNKNOWN]).unknownEntries,
    [UNKNOWN, OTHER]
  );
}

console.log("\n── Part D: source invariants that must not regress ──");
{
  const ctx = fs.readFileSync(path.join(SRC, "state/AuraLunisVaultContext.tsx"), "utf8");
  const has = (needle, n) => (ctx.includes(needle) ? ok(n) : bad(`${n} — expected: ${needle}`));
  const hasnt = (needle, n) => (!ctx.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

  // H4: adding an item must never unblock main-blob writes.
  hasnt("if (recoveryPreservedRef.current) loadFailedRef.current = false;", "D addItem cannot unblock main writes");
  hasnt("loadFailedRef.current = false;\n        }\n      })", "D a successful write cannot unblock main writes");
  // M4 / stranding: the merge must not be gated on dropped entries.
  hasnt("droppedEntries ?", "D auxiliary merge is not gated on dropped entries");
  has("await mergeAuxiliarySlots(valid)", "D healthy load always merges auxiliary slots");
  // A readable blob must NOT be copied to recovery just because it holds an unknown record;
  // that copy is what made the entry duplicate on every launch.
  hasnt(
    "if (rejected.length > 0) await preserveRecovery(saved)",
    "D healthy load takes no recovery copy for merely-unparsable entries"
  );
  // The slot may only be removed after a durable write.
  has("await AsyncStorage.removeItem(key)", "D auxiliary slot is cleared only inside the merge");
  has("selectWriteTarget(failed)", "D write target comes from the shared decision fn");
}

console.log(`\nVault recovery self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
