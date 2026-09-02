/**
 * Battle UI — inventory grid with use limits, turn timer, damage-matrix resolution
 * feedback, fallback buttons, boss-select menu for all 4 bosses, sprite art + procedural
 * WebAudio SFX.
 */
(function () {
  "use strict";

  const DIFFICULTY_LABEL = {
    easy: "Лёгкий",
    medium: "Средний",
    "medium-hard": "Средне-сложный",
    max: "Максимальный",
  };

  const TIMING = {
    windup: 700,
    throw: 500,
    // just long enough to read the attack name; the banner stays on screen
    // through the choice, so there is no reason to block the player here
    nameHold: 1200,
    resolveHold: 700,
    cutsceneFade: 400,
    cutscenePartHold: 4800,
  };

  const CAT_LABEL = {
    network: "сеть",
    malware: "вредонос",
    web: "веб/сайт",
    social: "обман",
    zeroday: "0-day",
    universal: "любые",
  };

  const FORCE_MAJEURE_LINES = [
    "Пока вы добивали процесс, вредонос успел выгрузить копию на внешний C2-сервер. Контроль потерян.",
    "Скрытый бэкдор сработал в момент удаления — управление системой перехвачено удалённо.",
    "Логическая бомба активировалась при завершении процесса. Система ушла в критический сбой.",
    "Вирус успел зашифровать резервные копии за секунду до отключения — восстановить нечего.",
  ];
  const FORCE_MAJEURE_PITCH =
    "Даже правильная игра иногда не спасает от 0-day — реальные атаки могут обойти любую защиту " +
    "одним экземпляром. Именно поэтому нужна эшелонированная защита, а не один инструмент. Приходи — " +
    "разберём, как строятся такие эшелоны на практике.";

  const el = (id) => document.getElementById(id);
  /** gamepad.js stamps this on <html> while a pad is connected. */
  const padConnected = () => document.documentElement.classList.contains("gamepad-on");
  const dom = {
    menuScreen: el("menuScreen"),
    menuBgCanvas: el("menuBgCanvas"),
    bossGrid: el("bossGrid"),
    randomBossBtn: el("randomBossBtn"),
    battleScreen: el("battleScreen"),
    fullscreenBtn: el("fullscreenBtn"),
    themeToggle: el("themeToggle"),
    themeLabel: el("themeLabel"),
    pauseBtn: el("pauseBtn"),
    pauseOverlay: el("pauseOverlay"),
    resumeBtn: el("resumeBtn"),
    quitBtn: el("quitBtn"),
    cutscene: el("cutscene"),
    cutsceneText: el("cutsceneText"),
    stage: el("stage"),
    bgCanvas: el("bgCanvas"),
    playerSprite: el("playerSprite"),
    heldItem: el("heldItem"),
    bossSprite: el("bossSprite"),
    playerBarFill: el("playerBarFill"),
    playerHpText: el("playerHpText"),
    bossName: el("bossName"),
    bossBarFill: el("bossBarFill"),
    bossHpText: el("bossHpText"),
    turnCounter: el("turnCounter"),
    attackBanner: el("attackBanner"),
    attackIcon: el("attackIcon"),
    attackName: el("attackName"),
    attackTech: el("attackTech"),
    attackCat: el("attackCat"),
    resolveFlash: el("resolveFlash"),
    projectile: el("projectile"),
    burst: el("burst"),
    resultWindow: el("resultWindow"),
    resultTier: el("resultTier"),
    resultDamage: el("resultDamage"),
    resultNote: el("resultNote"),
    resultNextBtn: el("resultNextBtn"),
    inventoryPanel: el("inventoryPanel"),
    itemGrid: el("itemGrid"),
    itemCard: el("itemCard"),
    itemCardIcon: el("itemCardIcon"),
    itemCardName: el("itemCardName"),
    itemCardCat: el("itemCardCat"),
    itemCardUses: el("itemCardUses"),
    itemCardDesc: el("itemCardDesc"),
    itemCardLimits: el("itemCardLimits"),
    useBtn: el("useBtn"),
    useIcon: el("useIcon"),
    actionRow: el("actionRow"),
    hintBtn: el("hintBtn"),
    hintOverlay: el("hintOverlay"),
    hintAttack: el("hintAttack"),
    hintIcon: el("hintIcon"),
    hintPickName: el("hintPickName"),
    hintWhy: el("hintWhy"),
    hintNextBtn: el("hintNextBtn"),
    endScreen: el("endScreen"),
    endTitle: el("endTitle"),
    endText: el("endText"),
    endPitch: el("endPitch"),
    restartBtn: el("restartBtn"),
  };

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  function fmtChoiceLabel(choice) {
    if (choice.type === "timeout") return "таймаут";
    if (choice.type === "fallback") return choice.fallbackId;
    return choice.itemId;
  }

  function tierLabel(tier) {
    return (
      {
        hard: "ХАРД-КОНТРА",
        normal: "СРЕДНИЙ БЛОК",
        weak: "СЛАБЫЙ БЛОК",
        timeout: "ТАЙМАУТ",
        fallback_success: "УСПЕХ",
        fallback_fail: "ПРОВАЛ",
      }[tier] || tier
    );
  }

  function spritePath(bossId, pose) {
    return `assets/img/${bossId}/${pose}.png`;
  }

  /** Light/dark palette lives entirely in CSS; this only flips the attribute
   *  and remembers the choice for the next visitor at the stand. */
  const THEME_KEY = "ibfighter-theme";

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute("aria-checked", String(dark));
      dom.themeLabel.textContent = dark ? "Тёмная тема" : "Светлая тема";
    }
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch (e) {
      /* private mode / storage disabled — the theme still works for this session */
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {
      /* ignore */
    }
    applyTheme(saved === "dark" ? "dark" : "light");
    dom.themeToggle.onclick = () => {
      const nowDark = document.documentElement.getAttribute("data-theme") === "dark";
      applyTheme(nowDark ? "light" : "dark");
    };
  }

  // one reactions file per boss, merged into a single scenarioId -> actions map
  const REACTION_FILES = ["worm", "malware", "trojan", "phishing", "zeroday"];

  async function main() {
    const [bosses, itemDefs, fallbackDefs, ...reactionParts] = await Promise.all([
      loadJson("data/bosses.json"),
      loadJson("data/items.json"),
      loadJson("data/fallback_buttons.json"),
      ...REACTION_FILES.map((name) => loadJson(`data/reactions/${name}.json`)),
    ]);
    const reactions = Object.assign({}, ...reactionParts);

    IBFighterBackground.initBackground(dom.menuBgCanvas, { density: 1 });
    let stageBg = null;

    let fight = null;
    let sessionId = 0;

    function buildMenu() {
      dom.bossGrid.innerHTML = "";
      for (const bossId of Object.keys(bosses)) {
        const boss = bosses[bossId];
        const card = document.createElement("button");
        card.className = "boss-card";
        card.innerHTML =
          `<span class="boss-card-name">${boss.name}</span>` +
          `<span class="boss-card-type">${boss.threatType}</span>` +
          `<span class="boss-card-diff">${DIFFICULTY_LABEL[boss.difficulty] || boss.difficulty}</span>`;
        card.onclick = () => {
          IBFighterAudio.menuBoop();
          startBattle(bossId);
        };
        dom.bossGrid.appendChild(card);
      }
      dom.randomBossBtn.onclick = () => {
        IBFighterAudio.menuBoop();
        const ids = Object.keys(bosses);
        startBattle(ids[Math.floor(Math.random() * ids.length)]);
      };
    }

    function showMenu() {
      dom.battleScreen.classList.add("hidden");
      dom.menuScreen.classList.remove("hidden");
    }

    /** Fullscreen intro: fades in part1, holds, cross-fades to part2, holds, fades out.
     * Click anywhere skips to the next beat immediately. */
    async function playCutscene(boss) {
      dom.cutscene.classList.remove("hidden");
      let skip = null;
      const skipPromise = () => new Promise((resolve) => (skip = resolve));
      dom.cutscene.onclick = () => skip && skip();

      async function showBeat(text) {
        dom.cutsceneText.textContent = text;
        dom.cutsceneText.classList.remove("visible");
        void dom.cutsceneText.offsetWidth;
        dom.cutsceneText.classList.add("visible");
        await Promise.race([delay(TIMING.cutscenePartHold), skipPromise()]);
        dom.cutsceneText.classList.remove("visible");
        await delay(TIMING.cutsceneFade);
      }

      await showBeat(boss.intro.part1);
      await showBeat(boss.intro.part2);
      dom.cutscene.onclick = null;
      dom.cutscene.classList.add("hidden");
    }

    async function startBattle(bossId) {
      dom.menuScreen.classList.add("hidden");
      sessionId += 1;
      const mySession = sessionId;
      await playCutscene(bosses[bossId]);
      if (mySession !== sessionId) return; // exited mid-cutscene
      dom.battleScreen.classList.remove("hidden");
      if (stageBg) stageBg.stop();
      stageBg = IBFighterBackground.initBackground(dom.bgCanvas, { density: 2.4, skyline: false });
      newFight(bossId);
      runFightLoop(mySession);
    }

    function closePause() {
      dom.pauseOverlay.classList.add("hidden");
    }

    dom.pauseBtn.onclick = () => {
      IBFighterAudio.menuBoop();
      dom.pauseOverlay.classList.remove("hidden");
      dom.resumeBtn.focus();
    };
    dom.resumeBtn.onclick = closePause;
    dom.quitBtn.onclick = () => {
      closePause();
      sessionId += 1; // invalidates any in-flight runFightLoop iteration
      showMenu();
    };

    function newFight(bossId) {
      fight = IBFighterCore.createFight({ boss: bosses[bossId], itemDefs, fallbackDefs, reactions });
      fight.bossId = bossId;
      dom.bossName.textContent = fight.boss.name;
      dom.endScreen.classList.add("hidden");
      dom.playerSprite.src = spritePath("player", "idle");
      dom.playerSprite.className = "fighter player-fighter";
      clearHeldItem();
      dom.bossSprite.src = spritePath(bossId, "idle");
      dom.bossSprite.className = "fighter boss-fighter" + (bossId === "zeroday" ? " glitching" : "");
      // on screen from the first frame of the fight, locked until it is the
      // player's turn — the inventory should never blink in and out
      dom.inventoryPanel.classList.remove("hidden");
      dom.inventoryPanel.classList.add("locked");
      canAct = false;
      selectedItemId = null; // never carry a pick across fights
      buildItemGrid();
      renderHud();
    }

    function renderHud() {
      const pPct = Math.max(0, (fight.hp.player / fight.playerMaxHp) * 100);
      const bPct = Math.max(0, (fight.hp.boss / fight.boss.hp) * 100);
      dom.playerBarFill.style.width = pPct + "%";
      dom.bossBarFill.style.width = bPct + "%";
      dom.playerHpText.textContent = `${fight.hp.player}/${fight.playerMaxHp}`;
      dom.bossHpText.textContent = `${fight.hp.boss}/${fight.boss.hp}`;
      dom.turnCounter.textContent = `ХОД ${fight.turn}`;
    }

    let selectedItemId = null;
    let focusedIndex = 0;
    let itemCells = [];
    let canAct = false; // true only while the turn is actually open

    function buildItemGrid() {
      const keepSelected = selectedItemId;
      dom.itemGrid.innerHTML = "";
      itemCells = [];
      const avail = IBFighterCore.getAvailableActions(fight);
      const usableMap = new Map(avail.items.map((i) => [i.id, i]));
      for (const itemId of Object.keys(fight.itemDefs)) {
        const item = fight.itemDefs[itemId];
        const state = usableMap.get(itemId);
        const btn = document.createElement("button");
        btn.className = `slot cat-${item.cat}`;
        btn.disabled = !state.usable;
        btn.dataset.itemId = itemId;
        btn.title = `${item.shortName} — ${item.plainDesc}`;
        btn.innerHTML =
          `<img src="assets/img/items/${itemId}.png" alt="${item.shortName}">` +
          `<span class="item-uses">${item.usesLeft}</span>`;
        // re-clicking the current pick is silent: otherwise the first half of a
        // double-click beeps twice before the throw
        btn.addEventListener("click", () => selectItem(itemId, itemId === selectedItemId));
        // double-click is the shortcut for "pick it and press ИСПОЛЬЗОВАТЬ"
        btn.addEventListener("dblclick", () => {
          selectItem(itemId, true);
          if (!dom.useBtn.disabled) dom.useBtn.click();
        });
        btn.addEventListener("mouseenter", () => showItemCard(itemId));
        // the gamepad moves its highlight with focus(), so this one listener
        // serves the stick and the Tab key both
        btn.addEventListener("focus", () => showItemCard(itemId));
        dom.itemGrid.appendChild(btn);
        itemCells.push(btn);
      }
      selectedItemId = null;
      dom.useBtn.disabled = true;
      dom.useIcon.classList.add("hidden");
      dom.useIcon.removeAttribute("src");
      showItemCard(null);
      clearHeldItem();
      clearHint(); // a hint belongs to the attack that prompted it, not the next one
      focusedIndex = itemCells.findIndex((c) => !c.disabled);
      updateFocusVisuals();
      // a pick made while the previous turn was resolving survives the rebuild
      if (keepSelected) selectItem(keepSelected, true);
    }

    function clearHint() {
      dom.actionRow.querySelectorAll(".hinted").forEach((b) => b.classList.remove("hinted"));
      itemCells.forEach((c) => c.classList.remove("hinted"));
    }

    const MATCH_WHY = {
      hard: "Это точный контр-инструмент против этой атаки — он закрывает её полностью.",
      normal: "Он работает по тому же типу угрозы, так что удар смягчит, хоть и не полностью.",
      universal: "Точного средства не осталось. Универсальный хотя бы заметит атаку и частично прикроет.",
      weak: "Подходящего инструмента не осталось — этот сработает слабо, но лучше, чем ничего.",
      none: "Предметы кончились. Остались только аварийные кнопки внизу.",
    };

    /** Opens the hint box, then marks the recommended action once it is closed. */
    async function showHint(scenario) {
      const pick = IBFighterCore.suggestAction(fight, scenario);
      const isItem = pick.type === "item";
      const def = isItem ? fight.itemDefs[pick.itemId] : fight.fallbackDefs[pick.fallbackId];
      const id = isItem ? pick.itemId : pick.fallbackId;
      const name = isItem ? def.shortName : def.name;

      dom.hintAttack.textContent = `Атака бьёт по направлению «${CAT_LABEL[scenario.cat] || scenario.cat}».`;
      dom.hintIcon.src = `assets/img/items/${id}.png`;
      dom.hintPickName.textContent = name;
      dom.hintWhy.textContent =
        (isItem ? `${def.plainDesc}. ` : "") + (MATCH_WHY[pick.match] || "");
      dom.hintOverlay.classList.remove("hidden");

      await new Promise((resolve) => {
        dom.hintNextBtn.onclick = () => {
          dom.hintNextBtn.onclick = null;
          resolve();
        };
        dom.hintNextBtn.focus();
      });
      dom.hintOverlay.classList.add("hidden");

      // highlight only after the box is gone, so the player sees where to look
      clearHint();
      const target = isItem
        ? itemCells.find((c) => c.dataset.itemId === id)
        : dom.actionRow.querySelector(`.fallback-btn[data-fallback="${id}"]`);
      if (target) target.classList.add("hinted");
    }

    /** Shows the item in the fighter's hands, over his chest. */
    function showHeldItem(id) {
      dom.heldItem.src = `assets/img/items/held/${id}.png`;
      dom.heldItem.classList.remove("hidden");
      // restart the pop-in animation on every fresh pick
      void dom.heldItem.offsetWidth;
      dom.heldItem.style.animation = "none";
      void dom.heldItem.offsetWidth;
      dom.heldItem.style.animation = "";
    }

    function clearHeldItem() {
      dom.heldItem.classList.add("hidden");
      dom.heldItem.removeAttribute("src");
    }

    const CARD_EMPTY_TEXT =
      "Наведи мышь или пройдись крестовиной по слотам — здесь появится, что делает инструмент и против чего он силён.";

    /**
     * Fills the card under the inventory with everything known about one tool.
     * `null` puts it back into the "nothing under the cursor yet" state.
     *
     * Deliberately says what the tool is and where it stops, never which of
     * this boss's attacks it happens to answer: that would hand the player the
     * turn's solution before they have thought about it. The ПОДСКАЗКА button
     * is where an answer is asked for on purpose.
     */
    function showItemCard(itemId) {
      const item = itemId ? fight.itemDefs[itemId] : null;
      if (!item) {
        dom.itemCard.classList.add("empty");
        dom.itemCardIcon.classList.add("hidden");
        dom.itemCardIcon.removeAttribute("src");
        dom.itemCardName.textContent = "выбери, чем защититься";
        dom.itemCardCat.textContent = "";
        dom.itemCardCat.className = "";
        dom.itemCardUses.textContent = "";
        dom.itemCardDesc.textContent = CARD_EMPTY_TEXT;
        dom.itemCardLimits.textContent = "";
        return;
      }
      dom.itemCard.classList.remove("empty");
      dom.itemCardIcon.src = `assets/img/items/${item.id}.png`;
      dom.itemCardIcon.classList.remove("hidden");
      dom.itemCardName.textContent = item.shortName;
      dom.itemCardCat.textContent = CAT_LABEL[item.cat] || item.cat;
      dom.itemCardCat.className = `cat-${item.cat}`;
      dom.itemCardUses.textContent =
        item.usesLeft > 0 ? `осталось ${item.usesLeft} из ${item.maxUses}` : "израсходован";
      dom.itemCardDesc.textContent = `${item.plainDesc}. ${item.longDesc}`;
      dom.itemCardLimits.textContent = item.limits;
    }

    /** Item the card falls back to when the cursor leaves the row. */
    function restingCardItem() {
      if (selectedItemId) return selectedItemId;
      const focused = itemCells[focusedIndex];
      return focused ? focused.dataset.itemId : null;
    }

    function updateFocusVisuals() {
      itemCells.forEach((c, i) => c.classList.toggle("focused", i === focusedIndex));
      if (focusedIndex >= 0 && itemCells[focusedIndex]) {
        showItemCard(itemCells[focusedIndex].dataset.itemId);
      }
    }

    function selectItem(itemId, silent) {
      const cell = itemCells.find((c) => c.dataset.itemId === itemId);
      if (!cell || cell.disabled) return;
      if (!silent) IBFighterAudio.select();
      selectedItemId = itemId;
      itemCells.forEach((c) => c.classList.toggle("selected", c.dataset.itemId === itemId));
      showItemCard(itemId);
      // browsing is allowed between turns, but the throw itself only once the
      // attack is on screen — otherwise you would be answering it blind
      dom.useBtn.disabled = !canAct;
      // the button carries the picked item's icon, so the primary action
      // always shows what it is about to do
      dom.useIcon.src = `assets/img/items/${itemId}.png`;
      dom.useIcon.classList.remove("hidden");
      showHeldItem(itemId);
      focusedIndex = itemCells.indexOf(cell);
      updateFocusVisuals();
    }

    function onKeydown(e) {
      if (dom.inventoryPanel.classList.contains("locked")) return;
      const enabledIdx = itemCells.map((c, i) => (!c.disabled ? i : -1)).filter((i) => i >= 0);
      if (enabledIdx.length === 0) return;
      const curPos = enabledIdx.indexOf(focusedIndex);
      if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        focusedIndex = enabledIdx[(curPos + 1 + enabledIdx.length) % enabledIdx.length];
        updateFocusVisuals();
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        focusedIndex = enabledIdx[(curPos - 1 + enabledIdx.length) % enabledIdx.length];
        updateFocusVisuals();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectItem(itemCells[focusedIndex].dataset.itemId);
        // ИСПОЛЬЗОВАТЬ is hidden while a pad is plugged in, so Enter has to
        // carry the throw too — otherwise the keyboard has no way to act.
        if (padConnected() && !dom.useBtn.disabled) dom.useBtn.click();
      }
    }
    document.addEventListener("keydown", onKeydown);

    // the grid element itself survives every rebuild, so one listener is enough:
    // leaving the row puts the card back on whatever is picked or focused
    dom.itemGrid.addEventListener("mouseleave", () => showItemCard(restingCardItem()));

    // The gamepad moves its highlight by adding .gp-focus and calling focus().
    // Watching the class rather than the focus event on purpose: a browser only
    // fires focus events while the document itself is focused, so after a click
    // on the browser chrome the stick would still move the highlight and the
    // card would silently stop following it.
    let lastStickItem = null;
    new MutationObserver(() => {
      const lit = dom.itemGrid.querySelector(".slot.gp-focus");
      const id = lit ? lit.dataset.itemId : null;
      // Only an actual stick move counts. The observer also fires on the
      // .focused and .selected classes, and without this guard a mouse click
      // would show the clicked tool for an instant before the highlight the
      // stick was parked on stole the card back.
      if (id === lastStickItem) return;
      lastStickItem = id;
      if (!id) return;
      // With a pad the highlight *is* the pick: the tool goes into the fighter's
      // hands as the stick passes over it, and A throws it. Without one, moving
      // the highlight only previews — mouse and keyboard still pick explicitly.
      if (padConnected()) selectItem(id, true);
      else showItemCard(id);
    }).observe(dom.itemGrid, { attributes: true, attributeFilter: ["class"], subtree: true });

    async function playAttackIntro(scenario) {
      dom.attackBanner.classList.remove("hidden");
      dom.attackIcon.textContent = "⚔";
      dom.attackName.textContent = "…";
      dom.attackTech.textContent = "";
      dom.attackCat.textContent = "";
      dom.bossSprite.classList.add("attacking");
      dom.bossSprite.src = spritePath(fight.bossId, "attack");
      IBFighterAudio.windup();
      await delay(TIMING.windup);
      dom.attackIcon.textContent = "☣";
      await delay(TIMING.throw);
      dom.bossSprite.classList.remove("attacking");
      dom.bossSprite.src = spritePath(fight.bossId, "idle");
      dom.attackName.textContent = scenario.name;
      dom.attackTech.textContent = scenario.techName || "";
      dom.attackCat.textContent = CAT_LABEL[scenario.cat] || scenario.cat;
      dom.attackCat.className = `cat-${scenario.cat}`;
      await delay(TIMING.nameHold);
    }

    /** Opens the choice window; waits for a click, no time limit — returns the chosen action. */
    function openChoiceWindow(scenario) {
      canAct = true;
      dom.inventoryPanel.classList.remove("locked");
      // Deliberately no buildItemGrid() here. playResolve already rebuilt the
      // grid with this turn's counts and disabled item, and browsing is open
      // from that moment — through the result window and the attack animation.
      // Rebuilding again at the moment the turn opens replaced every slot
      // element, which yanked the highlight back to the first slot a second or
      // two after the boss struck, right out from under whoever had already
      // moved it.
      // a pick carried over from the previous turn is ready to throw at once
      dom.useBtn.disabled = !selectedItemId;
      dom.hintBtn.onclick = () => {
        IBFighterAudio.menuBoop();
        showHint(scenario);
      };

      return new Promise((resolveChoice) => {
        function cleanup(result) {
          canAct = false;
          dom.useBtn.onclick = null;
          dom.hintBtn.onclick = null;
          dom.actionRow.querySelectorAll(".fallback-btn").forEach((b) => (b.onclick = null));
          // stays visible, just stops accepting input until the next turn
          dom.inventoryPanel.classList.add("locked");
          clearHeldItem();
          clearHint();
          resolveChoice(result);
        }

        dom.useBtn.onclick = () => {
          if (!selectedItemId) return;
          IBFighterAudio.throwItem();
          cleanup({ type: "item", itemId: selectedItemId });
        };
        dom.actionRow.querySelectorAll(".fallback-btn").forEach((b) => {
          b.onclick = () => {
            IBFighterAudio.throwItem();
            cleanup({ type: "fallback", fallbackId: b.dataset.fallback });
          };
        });
      });
    }

    const BOSS_HIT_POSES = new Set(["worm", "zeroday", "phishing"]);

    /** Icon the player just threw, or null when the turn timed out. */
    function choiceIcon(choice) {
      if (choice.type === "item") return `assets/img/items/${choice.itemId}.png`;
      if (choice.type === "fallback") return `assets/img/items/${choice.fallbackId}.png`;
      return null;
    }

    /** Centre of an element in #stage coordinates. */
    function centreIn(stageRect, el, xFrac, yFrac) {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - stageRect.left + r.width * xFrac,
        y: r.top - stageRect.top + r.height * yFrac,
      };
    }

    /** Throws the icon across the arena; resolves at the impact point. */
    async function flyProjectile(iconSrc) {
      const stageRect = dom.stage.getBoundingClientRect();
      const from = centreIn(stageRect, dom.playerSprite, 0.62, 0.55);
      const to = centreIn(stageRect, dom.bossSprite, 0.45, 0.5);
      dom.projectile.src = iconSrc;
      dom.projectile.classList.remove("hidden");
      const flight = dom.projectile.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg) scale(0.7)`, offset: 0 },
          { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 60}px) rotate(360deg) scale(1.15)`, offset: 0.55 },
          { transform: `translate(${to.x}px, ${to.y}px) rotate(720deg) scale(1)`, offset: 1 },
        ],
        { duration: 460, easing: "cubic-bezier(.35,.1,.6,1)" }
      );
      // Never await the animation alone: `finished` does not resolve while the
      // tab is not rendering (backgrounded, screen asleep), and the whole turn
      // would hang there. The timeout is the animation's own duration plus a
      // margin, so in normal play the promise always wins.
      await Promise.race([flight.finished.catch(() => {}), delay(700)]);
      dom.projectile.classList.add("hidden");
      return to;
    }

    function showBurst(at) {
      dom.burst.style.left = `${at.x}px`;
      dom.burst.style.top = `${at.y}px`;
      dom.burst.classList.remove("hidden");
      dom.burst.style.animation = "none";
      void dom.burst.offsetWidth; // reflow so the burst replays every hit
      dom.burst.style.animation = "";
      setTimeout(() => dom.burst.classList.add("hidden"), 460);
    }

    const TIER_TONE = {
      hard: "tier-good",
      fallback_success: "tier-good",
      normal: "tier-mixed",
      weak: "tier-mixed",
      fallback_fail: "tier-bad",
      timeout: "tier-bad",
    };

    /** The window that opens out of the burst: what happened, and why. */
    async function showResultWindow(result) {
      dom.resultTier.textContent = tierLabel(result.tier);
      dom.resultTier.className = TIER_TONE[result.tier] || "";
      const dotNote = result.dotDmg ? ` · утечка ${result.dotDmg}` : "";
      dom.resultDamage.textContent = `боссу ${result.bossTakes} · тебе ${result.playerTakes}${dotNote}`;
      dom.resultNote.textContent = result.note || "";
      dom.resultWindow.classList.remove("hidden");

      // No timeout here on purpose: the window waits for an explicit press, so
      // nobody loses the explanation because they read slower than a timer.
      await new Promise((resolve) => {
        dom.resultNextBtn.onclick = () => {
          dom.resultNextBtn.onclick = null;
          resolve();
        };
        dom.resultNextBtn.focus();
      });
      dom.resultWindow.classList.add("hidden");
    }

    async function playResolve(result) {
      dom.attackBanner.classList.add("hidden");

      const icon = choiceIcon(result.choice);
      const impact = icon ? await flyProjectile(icon) : null;
      if (impact) showBurst(impact);

      if (result.tier === "timeout") {
        IBFighterAudio.timeoutPenalty();
      } else if (result.tier === "hard") {
        IBFighterAudio.hardCounter();
      } else if (result.bossTakes > 0) {
        IBFighterAudio.hitBoss();
      }
      if (result.playerTakes > 0 && result.tier !== "timeout") {
        IBFighterAudio.hitPlayer();
      }
      dom.resolveFlash.className = result.bossTakes > 0 ? "flash-boss" : result.playerTakes > 0 ? "flash-player" : "";
      // restart animation
      void dom.resolveFlash.offsetWidth;
      dom.resolveFlash.classList.remove("hidden");

      if (result.playerTakes > 0) {
        dom.playerSprite.src = spritePath("player", "hurt");
        dom.playerSprite.classList.add("hit");
        dom.stage.classList.remove("shake");
        void dom.stage.offsetWidth;
        dom.stage.classList.add("shake");
      } else if (result.bossTakes > 0) {
        // took nothing and landed a counter — lunge in with the punch pose
        dom.playerSprite.src = spritePath("player", "punch");
        dom.playerSprite.classList.add("attacking");
      } else {
        dom.playerSprite.src = spritePath("player", "block");
      }
      if (result.bossTakes > 0) {
        dom.bossSprite.classList.add("hit");
        if (BOSS_HIT_POSES.has(fight.bossId)) dom.bossSprite.src = spritePath(fight.bossId, "hit");
      }

      renderHud();
      await delay(TIMING.resolveHold);
      dom.resolveFlash.classList.add("hidden");

      // Bring the inventory back to life before the explanation opens: counts
      // are already the next turn's, so the player can read and pre-pick while
      // the window is up instead of staring at a greyed-out panel.
      if (fight.status === "ongoing") {
        buildItemGrid();
        dom.inventoryPanel.classList.remove("locked");
      }
      await showResultWindow(result);
      dom.bossSprite.classList.remove("hit");
      dom.playerSprite.classList.remove("hit", "attacking");
      if (fight.status === "ongoing") {
        dom.playerSprite.src = spritePath("player", "idle");
        dom.bossSprite.src = spritePath(fight.bossId, "idle");
      } else if (fight.status === "player_loss") {
        dom.playerSprite.src = spritePath("player", "ko");
        dom.playerSprite.classList.add("knocked-out");
      }
    }

    function showEndScreen() {
      dom.endScreen.classList.remove("hidden");
      if (fight.status === "player_win") {
        dom.endTitle.textContent = "ПОБЕДА";
        dom.endText.textContent = `${fight.boss.name} нейтрализован. Система защищена.`;
        dom.endPitch.textContent = "";
        IBFighterAudio.victory();
      } else if (fight.status === "player_win_forcemajeure") {
        dom.endTitle.textContent = "СИСТЕМА СКОМПРОМЕТИРОВАНА";
        dom.endText.textContent = FORCE_MAJEURE_LINES[Math.floor(Math.random() * FORCE_MAJEURE_LINES.length)];
        dom.endPitch.textContent = FORCE_MAJEURE_PITCH;
        IBFighterAudio.forceMajeure();
      } else {
        dom.endTitle.textContent = "ПОРАЖЕНИЕ";
        dom.endText.textContent = `${fight.boss.name} захватил систему.`;
        dom.endPitch.textContent = "";
        IBFighterAudio.defeat();
      }
    }

    async function runFightLoop(mySession) {
      while (fight.status === "ongoing" && mySession === sessionId) {
        const scenario = IBFighterCore.getCurrentScenario(fight);
        await playAttackIntro(scenario);
        if (mySession !== sessionId) return;
        const choice = await openChoiceWindow(scenario);
        if (mySession !== sessionId) return;
        const result = IBFighterCore.resolveTurn(fight, choice);
        await playResolve(result);
      }
      if (mySession === sessionId) showEndScreen();
    }

    dom.restartBtn.onclick = () => {
      dom.endScreen.classList.add("hidden");
      showMenu();
    };

    dom.fullscreenBtn.onclick = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        dom.fullscreenBtn.textContent = "⛶ ПОЛНЫЙ ЭКРАН";
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
        dom.fullscreenBtn.textContent = "⛶ ОБЫЧНЫЙ РЕЖИМ";
      }
    };
    document.addEventListener("fullscreenchange", () => {
      dom.fullscreenBtn.textContent = document.fullscreenElement ? "⛶ ОБЫЧНЫЙ РЕЖИМ" : "⛶ ПОЛНЫЙ ЭКРАН";
    });

    initTheme();
    IBFighterGamepad.init();
    buildMenu();
    showMenu();
  }

  main().catch((err) => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#ff6b6b;padding:20px;">Ошибка загрузки: ${err.message}\n\nЕсли открыли index.html напрямую (file://) — браузер блокирует fetch() локальных JSON.\nЗапустите локальный сервер, например: python -m http.server, и откройте http://localhost:8000/</pre>`;
  });
})();
