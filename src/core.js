/**
 * IB Fighter — core game engine (data-driven, no rendering).
 * Pure state machine: createFight() + resolveTurn(). Works in Node and in the browser
 * (attaches to globalThis.IBFighterCore, also exports via module.exports when present).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  root.IBFighterCore = mod;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const PLAYER_MAX_HP = 100;
  const FORCE_MAJEURE_CHANCE = 0.35;

  function defaultRng() {
    return Math.random();
  }

  function randInRange([min, max], rng) {
    return Math.round(min + rng() * (max - min));
  }

  /**
   * @param {object} opts
   * @param {object} opts.boss - one entry from bosses.json
   * @param {object} opts.itemDefs - items.json (id -> item def)
   * @param {object} opts.fallbackDefs - fallback_buttons.json
   * @param {object} [opts.reactions] - data/reactions/*.json merged: scenarioId ->
   *   { <itemId>: string, <fallbackId>: { success, fail } }. Supplies the unique
   *   line explaining what this exact action did against this exact attack.
   * @param {function} [opts.rng] - injectable RNG for deterministic tests
   */
  function createFight({ boss, itemDefs, fallbackDefs, reactions, rng }) {
    rng = rng || defaultRng;
    // Fixed, unshuffled — each boss tells one specific unique attack story, turn by turn.
    const scenarioOrder = boss.scenarios.slice();

    const items = {};
    for (const id of Object.keys(itemDefs)) {
      items[id] = { ...itemDefs[id], usesLeft: itemDefs[id].maxUses };
    }

    return {
      boss,
      itemDefs: items,
      fallbackDefs,
      reactions: reactions || {},
      rng,
      hp: { player: PLAYER_MAX_HP, boss: boss.hp },
      playerMaxHp: PLAYER_MAX_HP,
      scenarioOrder,
      turn: 1,
      activeEffects: {
        defenseMult: null, // { mult, turnsLeft }
        dot: null, // { dmg, turnsLeft }
        disabledItem: null, // { itemId, turnsLeft }
        itemsMultExceptPatch: null, // { mult, exceptItem } — persists rest of fight once set
      },
      log: [],
      status: "ongoing", // ongoing | player_win | player_win_forcemajeure | player_loss
    };
  }

  /** Turn after the last written scenario — the fight forces the climax scenario on repeat. */
  function escalationTurn(fight) {
    return fight.scenarioOrder.length + 1;
  }
  /** Two turns into escalation — player's damage to boss gets a +15% assist (see resolveTurn). */
  function safetyValveTurn(fight) {
    return escalationTurn(fight) + 2;
  }

  function getCurrentScenario(fight) {
    if (fight.turn <= fight.scenarioOrder.length) {
      return fight.scenarioOrder[fight.turn - 1];
    }
    // эскалация: сценарии закончились — форсируем последний (кульминационный), ×1.25 урона
    return fight.scenarioOrder[fight.scenarioOrder.length - 1];
  }

  function isEscalated(fight) {
    return fight.turn >= escalationTurn(fight);
  }

  /** What the player may legally pick this turn (for UI to grey out disabled/exhausted items). */
  function getAvailableActions(fight) {
    const disabledId =
      fight.activeEffects.disabledItem && fight.activeEffects.disabledItem.turnsLeft > 0
        ? fight.activeEffects.disabledItem.itemId
        : null;
    const items = Object.values(fight.itemDefs).map((it) => ({
      id: it.id,
      usable: it.usesLeft > 0 && it.id !== disabledId,
      usesLeft: it.usesLeft,
    }));
    return { items, fallbacks: Object.keys(fight.fallbackDefs) };
  }

  /**
   * Best action still available against this attack, and how good the match is.
   * Mirrors the tiering in resolveAction: an exact counter beats a same-category
   * tool, which beats the universal one, which beats anything at all.
   *
   * @returns {{type:'item', itemId:string, match:string}|{type:'fallback', fallbackId:string, match:string}}
   */
  function suggestAction(fight, scenario) {
    const usable = getAvailableActions(fight)
      .items.filter((i) => i.usable)
      .map((i) => fight.itemDefs[i.id]);

    const hard = usable.find((it) => it.hardCounterFor.includes(scenario.id));
    if (hard) return { type: "item", itemId: hard.id, match: "hard" };

    const sameCat = usable.find((it) => it.cat === scenario.cat);
    if (sameCat) return { type: "item", itemId: sameCat.id, match: "normal" };

    const universal = usable.find((it) => it.cat === "universal");
    if (universal) return { type: "item", itemId: universal.id, match: "universal" };

    if (usable.length > 0) return { type: "item", itemId: usable[0].id, match: "weak" };

    // inventory spent — the fallbacks are all that is left
    return { type: "fallback", fallbackId: "avast", match: "none" };
  }

  /**
   * @param {object} fight - mutated in place
   * @param {{type:'item', itemId:string}|{type:'fallback', fallbackId:string}|{type:'timeout'}} choice
   * @returns {object} turnResult — also pushed onto fight.log
   */
  function resolveTurn(fight, choice) {
    if (fight.status !== "ongoing") {
      throw new Error(`Fight already ended: ${fight.status}`);
    }

    const rng = fight.rng;
    const scenario = getCurrentScenario(fight);
    const escalated = isEscalated(fight);

    let bossRawDmg = randInRange(scenario.dmg, rng);
    if (escalated) bossRawDmg = Math.round(bossRawDmg * 1.25);

    // DoT tick from a previous keylogger hit — unblockable, resolved before this turn's action.
    let dotDmg = 0;
    if (fight.activeEffects.dot && fight.activeEffects.dot.turnsLeft > 0) {
      dotDmg = fight.activeEffects.dot.dmg;
      fight.activeEffects.dot = null;
    }

    const resolution = resolveAction(fight, scenario, bossRawDmg, choice);

    // Safety valve: two turns into escalation, player's damage to boss +15%.
    let bossTakes = resolution.bossTakes;
    if (fight.turn >= safetyValveTurn(fight)) {
      bossTakes = Math.round(bossTakes * 1.15);
    }

    const playerTakes = resolution.playerTakes + dotDmg;

    // Apply damage.
    fight.hp.boss = Math.max(0, fight.hp.boss - bossTakes);
    fight.hp.player = Math.max(0, fight.hp.player - playerTakes);

    // Tick down turn-limited debuffs that were active *this* turn.
    if (fight.activeEffects.defenseMult) {
      fight.activeEffects.defenseMult.turnsLeft -= 1;
      if (fight.activeEffects.defenseMult.turnsLeft <= 0) fight.activeEffects.defenseMult = null;
    }
    if (fight.activeEffects.disabledItem) {
      fight.activeEffects.disabledItem.turnsLeft -= 1;
      if (fight.activeEffects.disabledItem.turnsLeft <= 0) fight.activeEffects.disabledItem = null;
    }

    // Apply this scenario's own effect, taking hold from *next* turn.
    applyScenarioEffect(fight, scenario, bossRawDmg);

    const turnResult = {
      turn: fight.turn,
      scenario: { id: scenario.id, name: scenario.name, techName: scenario.techName, cat: scenario.cat },
      escalated,
      choice,
      tier: resolution.tier,
      bossRawDmg,
      dotDmg,
      bossTakes,
      playerTakes,
      hpAfter: { ...fight.hp },
      note: resolution.note,
    };
    fight.log.push(turnResult);

    if (fight.hp.boss <= 0) {
      const forceMajeure = rng() < FORCE_MAJEURE_CHANCE;
      fight.status = forceMajeure ? "player_win_forcemajeure" : "player_win";
      turnResult.forceMajeureRoll = forceMajeure;
    } else if (fight.hp.player <= 0) {
      fight.status = "player_loss";
    } else {
      fight.turn += 1;
    }

    return turnResult;
  }

  function applyScenarioEffect(fight, scenario, bossRawDmg) {
    const effect = scenario.effect;
    if (!effect) return;
    switch (effect.type) {
      case "debuff_defense_mult":
        fight.activeEffects.defenseMult = { mult: effect.mult, turnsLeft: effect.duration };
        break;
      case "dot":
        fight.activeEffects.dot = { dmg: bossRawDmg, turnsLeft: effect.duration };
        break;
      case "debuff_disable_item": {
        const candidates = Object.values(fight.itemDefs).filter((it) => it.usesLeft > 0);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(fight.rng() * candidates.length)];
          fight.activeEffects.disabledItem = { itemId: pick.id, turnsLeft: effect.duration };
        }
        break;
      }
      case "debuff_items_mult_except_patch":
        fight.activeEffects.itemsMultExceptPatch = { mult: effect.mult, exceptItem: effect.exceptItem };
        break;
      case "armor_pierce":
        // instantaneous, handled inline in resolveAction — nothing to persist
        break;
      default:
        break;
    }
  }

  /** Resolves one player action against the incoming attack; returns { tier, playerTakes, bossTakes, note }. */
  function resolveAction(fight, scenario, bossRawDmg, choice) {
    if (choice.type === "timeout") {
      return { tier: "timeout", playerTakes: bossRawDmg, bossTakes: 0, note: "Игрок не успел выбрать действие." };
    }

    if (choice.type === "fallback") {
      const fb = fight.fallbackDefs[choice.fallbackId];
      if (!fb) throw new Error(`Unknown fallback: ${choice.fallbackId}`);
      const success = fight.rng() < fb.successChance;
      const outcome = success ? "success" : "fail";
      // scenario-specific line first; the generic pool in fallback_buttons.json
      // is only a safety net for a scenario that has no entry yet
      const note =
        reactionNote(fight, scenario.id, choice.fallbackId, outcome) ||
        pick(fb.explanations[outcome], fight.rng);
      if (success) {
        return {
          tier: "fallback_success",
          playerTakes: 0,
          bossTakes: randInRange(fb.dmgToBoss, fight.rng),
          note,
        };
      }
      return {
        tier: "fallback_fail",
        playerTakes: randInRange(fb.dmgToPlayer, fight.rng),
        bossTakes: 0,
        note,
      };
    }

    if (choice.type === "item") {
      const item = fight.itemDefs[choice.itemId];
      if (!item) throw new Error(`Unknown item: ${choice.itemId}`);
      if (item.usesLeft <= 0) throw new Error(`Item exhausted: ${choice.itemId}`);
      const disabled = fight.activeEffects.disabledItem;
      if (disabled && disabled.itemId === choice.itemId && disabled.turnsLeft > 0) {
        throw new Error(`Item disabled this turn: ${choice.itemId}`);
      }

      const tier = item.hardCounterFor.includes(scenario.id)
        ? "hard"
        : item.cat === "universal" || item.cat === scenario.cat
        ? "normal"
        : "weak";

      let blockPercent = item.blockPercent[tier];
      let counterDamage = item.counterDamage[tier];

      // "эффективность защиты игрока ×0.7" — only reduces block, not counter damage.
      if (fight.activeEffects.defenseMult && fight.activeEffects.defenseMult.turnsLeft > 0) {
        blockPercent *= fight.activeEffects.defenseMult.mult;
      }

      // 0-day: все предметы кроме Патча ×0.5 эффективности до конца боя.
      const itemsMult = fight.activeEffects.itemsMultExceptPatch;
      if (itemsMult && item.id !== itemsMult.exceptItem) {
        blockPercent *= itemsMult.mult;
        counterDamage *= itemsMult.mult;
      }

      // armor-pierce (SQLi+privesc): игнорирует часть блока для этой атаки.
      if (scenario.effect && scenario.effect.type === "armor_pierce") {
        blockPercent *= 1 - scenario.effect.ignoreFraction;
      }

      const playerTakes = Math.max(0, Math.round(bossRawDmg * (1 - blockPercent / 100)));
      const bossTakes = Math.round(counterDamage);

      item.usesLeft -= 1;

      return { tier, playerTakes, bossTakes, note: reactionNote(fight, scenario.id, item.id) };
    }

    throw new Error(`Unknown choice type: ${choice.type}`);
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  /** Unique line for "this action against this attack". `outcome` applies to
   * fallbacks only, whose entry is { success, fail } rather than a string. */
  function reactionNote(fight, scenarioId, actionId, outcome) {
    const forScenario = fight.reactions && fight.reactions[scenarioId];
    const entry = forScenario && forScenario[actionId];
    if (!entry) return null;
    if (typeof entry === "string") return entry;
    return (outcome && entry[outcome]) || null;
  }

  return { createFight, resolveTurn, getCurrentScenario, getAvailableActions, suggestAction, PLAYER_MAX_HP };
});
