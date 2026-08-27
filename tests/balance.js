/** Balance probe: simulate many fights per boss with a "best available item" bot,
 * report win rate / avg turns / avg HP remaining. Run: node tests/balance.js */
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

function pickAction(fight, scenario) {
  const avail = getAvailableActions(fight);
  const usable = avail.items.filter((i) => i.usable);
  const hard = usable.find((i) => fight.itemDefs[i.id].hardCounterFor.includes(scenario.id));
  if (hard) return { type: "item", itemId: hard.id };
  const sameCat = usable.find((i) => fight.itemDefs[i.id].cat === scenario.cat || fight.itemDefs[i.id].cat === "universal");
  if (sameCat) return { type: "item", itemId: sameCat.id };
  if (usable.length > 0) return { type: "item", itemId: usable[0].id };
  return { type: "fallback", fallbackId: "avast" };
}

const N = 500;
for (const bossId of Object.keys(bosses)) {
  let wins = 0,
    forceMajeure = 0,
    losses = 0,
    totalTurns = 0,
    totalPlayerHp = 0,
    totalBossHp = 0;

  for (let i = 0; i < N; i++) {
    const fight = createFight({ boss: bosses[bossId], itemDefs, fallbackDefs, reactions });
    let safety = 0;
    while (fight.status === "ongoing" && safety < 60) {
      safety++;
      const scenario = getCurrentScenario(fight);
      resolveTurn(fight, pickAction(fight, scenario));
    }
    if (fight.status === "player_win") wins++;
    else if (fight.status === "player_win_forcemajeure") forceMajeure++;
    else losses++;
    totalTurns += fight.turn;
    totalPlayerHp += fight.hp.player;
    totalBossHp += fight.hp.boss;
  }

  console.log(
    `${bossId.padEnd(10)} win=${((wins / N) * 100).toFixed(0)}% forceMajeure=${((forceMajeure / N) * 100).toFixed(
      0
    )}% loss=${((losses / N) * 100).toFixed(0)}%  avgTurns=${(totalTurns / N).toFixed(1)}  avgPlayerHP=${(
      totalPlayerHp / N
    ).toFixed(0)}  avgBossHP=${(totalBossHp / N).toFixed(0)}`
  );
}
