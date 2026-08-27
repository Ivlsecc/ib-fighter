/**
 * Smoke test for the core engine — no framework, run with `node tests/smoke.js`.
 * Verifies: data loads, a full fight resolves to a terminal state, debuffs/escalation/
 * safety-valve/force-majeure all fire without throwing, and a timeout turn deals full damage.
 */
const fs = require("fs");
const path = require("path");
const { createFight, resolveTurn, getCurrentScenario, getAvailableActions } = require("../src/core.js");

const dataDir = path.join(__dirname, "..", "data");
const bosses = JSON.parse(fs.readFileSync(path.join(dataDir, "bosses.json"), "utf8"));
const itemDefs = JSON.parse(fs.readFileSync(path.join(dataDir, "items.json"), "utf8"));
const fallbackDefs = JSON.parse(fs.readFileSync(path.join(dataDir, "fallback_buttons.json"), "utf8"));
const reactionsDir = path.join(dataDir, "reactions");
const reactions = Object.assign(
  {},
  ...fs.readdirSync(reactionsDir).map((f) => JSON.parse(fs.readFileSync(path.join(reactionsDir, f), "utf8")))
);

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`  FAIL: ${msg}`);
  }
}

function pickHardCounterItem(fight, scenario, avail) {
  const usableIds = new Set(avail.items.filter((i) => i.usable).map((i) => i.id));
  const entry = Object.values(fight.itemDefs).find(
    (it) => usableIds.has(it.id) && it.hardCounterFor.includes(scenario.id)
  );
  return entry ? entry.id : null;
}

function runFight(bossId, { verbose = false, seed = 1, strategy = "hard-counter" } = {}) {
  const rng = mulberry32(seed);
  const fight = createFight({ boss: bosses[bossId], itemDefs, fallbackDefs, reactions, rng });
  console.log(`\n=== Бой: ${fight.boss.name} (seed=${seed}, strategy=${strategy}) ===`);
  console.log(
    `Порядок сценариев: ${fight.scenarioOrder.map((s) => s.id).join(" -> ")}`
  );

  let safety = 0;
  while (fight.status === "ongoing" && safety < 40) {
    safety++;
    const scenario = getCurrentScenario(fight);
    const avail = getAvailableActions(fight);

    let choice;
    if (strategy === "timeout") {
      choice = { type: "timeout" };
    } else if (strategy === "fallback") {
      choice = { type: "fallback", fallbackId: "avast" };
    } else {
      const hardId = pickHardCounterItem(fight, scenario, avail);
      const anyUsable = avail.items.find((i) => i.usable);
      if (hardId) choice = { type: "item", itemId: hardId };
      else if (anyUsable) choice = { type: "item", itemId: anyUsable.id };
      else choice = { type: "fallback", fallbackId: "reboot" };
    }

    const res = resolveTurn(fight, choice);
    if (verbose) {
      console.log(
        `  T${res.turn}${res.escalated ? "*" : ""} [${res.scenario.name}] choice=${JSON.stringify(
          choice
        )} tier=${res.tier} bossTakes=${res.bossTakes} playerTakes=${res.playerTakes}` +
          (res.dotDmg ? ` (+${res.dotDmg} DoT)` : "") +
          ` -> HP boss=${res.hpAfter.boss} player=${res.hpAfter.player}` +
          (res.note ? ` | ${res.note}` : "")
      );
    }
  }

  assert(safety < 40, `${bossId}: fight did not terminate within 40 turns`);
  assert(fight.status !== "ongoing", `${bossId}: fight ended without a terminal status`);
  console.log(`Итог: ${fight.status} (${fight.log.length} ходов)`);
  return fight;
}

console.log("--- Прогон 1: Червь, игрок всегда бьёт хард-контрой (ожидаем быструю победу) ---");
runFight("worm", { verbose: true, seed: 42, strategy: "hard-counter" });

console.log("\n--- Прогон 2: все 4 босса, хард-контра-стратегия, разные seed ---");
for (const bossId of Object.keys(bosses)) {
  const fight = runFight(bossId, { verbose: false, seed: bossId.length * 7 + 3, strategy: "hard-counter" });
  assert(["player_win", "player_win_forcemajeure", "player_loss"].includes(fight.status), `${bossId}: bad status`);
}

console.log("\n--- Прогон 3: игрок всегда таймаутит (проверяем штрафной 0/0 исход и итоговое поражение) ---");
{
  const fight = runFight("worm", { verbose: true, seed: 7, strategy: "timeout" });
  assert(fight.status === "player_loss", "timeout-only run should end in player_loss");
  assert(
    fight.log.every((t) => t.choice.type === "timeout" && t.bossTakes === 0),
    "timeout turns must deal 0 damage to boss"
  );
}

console.log("\n--- Прогон 4: только фолбэк Avast (проверяем, что бой вообще разрешим без предметов) ---");
{
  const fight = runFight("malware", { verbose: false, seed: 99, strategy: "fallback" });
  assert(["player_win", "player_win_forcemajeure", "player_loss"].includes(fight.status), "fallback-only: bad status");
}

console.log("\n--- Проверка эскалации: сценарии не тасуются и идут по сюжету 1..N, после N — фиксируется финальный ---");
{
  const rng = mulberry32(5);
  const fight = createFight({ boss: bosses.zeroday, itemDefs, fallbackDefs, reactions, rng });
  const written = fight.scenarioOrder;
  const climax = written[written.length - 1];
  for (let i = 0; i < 8 && fight.status === "ongoing"; i++) {
    const scenario = getCurrentScenario(fight);
    if (fight.turn <= written.length) {
      assert(scenario.id === written[fight.turn - 1].id, `turn ${fight.turn}: expected story beat ${written[fight.turn - 1].id}, got ${scenario.id}`);
    } else {
      assert(scenario.id === climax.id, `turn ${fight.turn}: expected climax scenario ${climax.id}, got ${scenario.id}`);
    }
    resolveTurn(fight, { type: "fallback", fallbackId: "reboot" });
  }
}

console.log("\n--- Реакции: у каждого сценария есть свой текст на каждый предмет и на оба фолбэка ---");
{
  const itemIds = Object.keys(itemDefs);
  const fallbackIds = Object.keys(fallbackDefs);
  const seen = new Map(); // text -> where it came from, to catch copy-paste
  let checked = 0;
  for (const boss of Object.values(bosses)) {
    for (const scenario of boss.scenarios) {
      const entry = reactions[scenario.id];
      assert(entry, `нет реакций для сценария ${scenario.id}`);
      if (!entry) continue;
      const collected = [];
      for (const id of itemIds) {
        const text = entry[id];
        assert(typeof text === "string" && text.trim(), `${scenario.id}: нет текста для предмета ${id}`);
        if (text) collected.push([`${scenario.id}/${id}`, text]);
      }
      for (const id of fallbackIds) {
        for (const outcome of ["success", "fail"]) {
          const text = entry[id] && entry[id][outcome];
          assert(typeof text === "string" && text.trim(), `${scenario.id}: нет текста для ${id}.${outcome}`);
          if (text) collected.push([`${scenario.id}/${id}.${outcome}`, text]);
        }
      }
      for (const [where, text] of collected) {
        checked++;
        assert(!seen.has(text), `дубль текста: ${where} совпадает с ${seen.get(text)}`);
        if (!seen.has(text)) seen.set(text, where);
      }
    }
  }
  console.log(`  проверено уникальных реакций: ${checked}`);
}

console.log("\n--- Реакция доезжает до результата хода ---");
{
  const rng = mulberry32(11);
  const fight = createFight({ boss: bosses.worm, itemDefs, fallbackDefs, reactions, rng });
  const scenario = getCurrentScenario(fight);
  const res = resolveTurn(fight, { type: "item", itemId: "firewall" });
  assert(res.note === reactions[scenario.id].firewall, `note не подставился: ${res.note}`);
}

console.log(`\n${failures === 0 ? "OK — все проверки прошли." : `ОШИБКИ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
