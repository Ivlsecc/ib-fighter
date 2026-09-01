/**
 * Gamepad control (Xbox-style pads via the standard mapping).
 *
 * Deliberately generic: instead of wiring every screen by hand, it walks the
 * interactive elements that are actually on screen, moves a highlight between
 * them and clicks the one in focus. New buttons in the UI become reachable
 * without touching this file.
 *
 * Modal windows (pause / hint / result) scope navigation to themselves, so the
 * stick can never wander onto the controls behind an open window.
 *
 * Mouse and keyboard keep working exactly as before — this only adds a third
 * way in.
 */
(function () {
  "use strict";

  // standard mapping: https://w3c.github.io/gamepad/#remapping
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const AXIS_X = 0;
  const AXIS_Y = 1;
  const DEADZONE = 0.55;
  const REPEAT_FIRST = 380; // ms before a held direction starts repeating
  const REPEAT_NEXT = 140;

  // Navigation order is DOM order, so this list only decides what counts as a
  // target — not where it sits.
  const TARGETS = [
    "#bossGrid .boss-card",
    "#randomBossBtn",
    "#themeToggle",
    "#fullscreenBtn",
    "#pauseBtn",
    "#itemGrid .slot",
    "#useBtn",
    ".fallback-btn",
    "#hintBtn",
    "#resultNextBtn",
    "#hintNextBtn",
    "#resumeBtn",
    "#quitBtn",
    "#restartBtn",
  ].join(",");

  // innermost open window wins; navigation is trapped inside it
  const MODALS = ["#pauseOverlay", "#hintOverlay", "#resultWindow", "#endScreen"];

  function visible(el) {
    if (!el || el.disabled) return false;
    // getClientRects() is empty when the element or any ancestor is display:none.
    // offsetParent is NOT usable here: it is always null for position:fixed
    // elements, which would make the modal overlays look hidden and let the
    // stick roam onto the battle controls behind them.
    if (el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function activeScope() {
    for (const sel of MODALS) {
      const el = document.querySelector(sel);
      if (el && !el.classList.contains("hidden") && visible(el)) return el;
    }
    return document;
  }

  function collectTargets() {
    const scope = activeScope();
    return Array.from(scope.querySelectorAll(TARGETS)).filter((el) => {
      if (!visible(el)) return false;
      // the inventory is on screen between turns but not accepting input
      const panel = el.closest("#inventoryPanel");
      return !(panel && panel.classList.contains("locked"));
    });
  }

  function init() {
    let index = 0;
    let current = null;
    let prevButtons = {};
    let heldDir = "0,0";
    let heldSince = 0;
    let lastRepeat = 0;
    let connected = false;
    let timer = null;
    let panelWasLocked = true;

    function paint(targets) {
      for (const el of document.querySelectorAll(".gp-focus")) {
        if (el !== current) el.classList.remove("gp-focus");
      }
      if (current && targets.includes(current)) {
        current.classList.add("gp-focus");
        try {
          current.focus({ preventScroll: true });
        } catch (e) {
          /* focus() is best-effort — the highlight is what matters */
        }
      }
    }

    function sync() {
      const targets = collectTargets();

      // The turn just opened. Focus was parked on ПАУЗА while the inventory was
      // locked, so drop it onto the first tool — that is what the player wants
      // to press next, and it keeps a stray A off the pause window.
      const panel = document.getElementById("inventoryPanel");
      const lockedNow = !panel || panel.classList.contains("locked") || panel.classList.contains("hidden");
      if (panelWasLocked && !lockedNow) {
        const firstSlot = targets.find((el) => el.closest("#itemGrid"));
        if (firstSlot) current = firstSlot;
      }
      panelWasLocked = lockedNow;

      if (targets.length === 0) {
        if (current) current.classList.remove("gp-focus");
        current = null;
        return targets;
      }
      // keep the highlight where it was if that element is still on screen
      if (!current || !targets.includes(current)) {
        // Prefer the first inventory slot over whatever comes first in the DOM:
        // landing on ПАУЗА by default means one stray A press opens the pause
        // window instead of picking a tool.
        const firstSlot = targets.find((el) => el.closest("#itemGrid"));
        current = firstSlot || targets[Math.min(index, targets.length - 1)];
        index = targets.indexOf(current);
      } else {
        index = targets.indexOf(current);
      }
      paint(targets);
      return targets;
    }

    /** Linear step through DOM order — used by the bumpers and as the fallback
     *  when nothing sits in the requested direction. */
    function move(step) {
      const targets = collectTargets();
      if (!targets.length) return;
      index = (targets.indexOf(current) + step + targets.length) % targets.length;
      current = targets[index];
      paint(targets);
    }

    /** Nearest target in the pressed direction. Linear order would make the
     *  player click through all nine slots to reach the button under them;
     *  going by position is what anyone expects from a stick. */
    function moveSpatial(dx, dy) {
      const targets = collectTargets();
      if (!targets.length) return;
      if (!current || !targets.includes(current)) {
        current = targets[0];
        paint(targets);
        return;
      }
      const a = current.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;

      let best = null;
      let bestScore = Infinity;
      for (const el of targets) {
        if (el === current) continue;
        const b = el.getBoundingClientRect();
        const vx = b.left + b.width / 2 - ax;
        const vy = b.top + b.height / 2 - ay;
        const along = dx ? vx * dx : vy * dy;
        if (along <= 4) continue; // not in the direction asked for
        const across = dx ? Math.abs(vy) : Math.abs(vx);
        const score = along + across * 2.5; // straight ahead beats diagonal
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }

      if (best) {
        current = best;
        index = targets.indexOf(best);
        paint(targets);
      } else {
        move(dx + dy > 0 ? 1 : -1); // edge of the screen — wrap in DOM order
      }
    }

    function press() {
      // the intro cutscene is dismissed by clicking anywhere on it
      const cutscene = document.getElementById("cutscene");
      if (cutscene && !cutscene.classList.contains("hidden") && visible(cutscene)) {
        cutscene.click();
        return;
      }
      const targets = sync();
      if (current && targets.includes(current)) current.click();
    }

    function back() {
      // B closes whatever window is open, otherwise opens pause
      const resume = document.getElementById("resumeBtn");
      const pauseOverlay = document.getElementById("pauseOverlay");
      if (pauseOverlay && !pauseOverlay.classList.contains("hidden")) {
        resume.click();
        return;
      }
      const hintNext = document.getElementById("hintNextBtn");
      const hintOverlay = document.getElementById("hintOverlay");
      if (hintOverlay && !hintOverlay.classList.contains("hidden")) {
        hintNext.click();
        return;
      }
      const pauseBtn = document.getElementById("pauseBtn");
      if (pauseBtn && visible(pauseBtn)) pauseBtn.click();
    }

    function edge(pad, code) {
      const b = pad.buttons[code];
      const now = !!(b && (b.pressed || b.value > 0.5));
      const was = !!prevButtons[code];
      prevButtons[code] = now;
      return now && !was;
    }

    /** @returns {[number, number]} one of the four directions, or [0, 0] */
    function direction(pad) {
      const down = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (down(BTN.RIGHT)) return [1, 0];
      if (down(BTN.LEFT)) return [-1, 0];
      if (down(BTN.DOWN)) return [0, 1];
      if (down(BTN.UP)) return [0, -1];
      const x = pad.axes[AXIS_X] || 0;
      const y = pad.axes[AXIS_Y] || 0;
      // whichever axis is pushed further wins, so a sloppy diagonal still
      // resolves to one clear direction
      if (Math.abs(x) > Math.abs(y)) {
        if (x > DEADZONE) return [1, 0];
        if (x < -DEADZONE) return [-1, 0];
      } else {
        if (y > DEADZONE) return [0, 1];
        if (y < -DEADZONE) return [0, -1];
      }
      return [0, 0];
    }

    function poll() {
      const now = performance.now();
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) {
        if (p && p.connected) {
          pad = p;
          break;
        }
      }

      if (pad) {
        const [dx, dy] = direction(pad);
        const key = `${dx},${dy}`;
        if (key !== heldDir) {
          heldDir = key;
          heldSince = now;
          lastRepeat = now;
          if (dx || dy) moveSpatial(dx, dy);
        } else if (dx || dy) {
          const waited = now - heldSince;
          const since = now - lastRepeat;
          if (waited > REPEAT_FIRST && since > REPEAT_NEXT) {
            lastRepeat = now;
            moveSpatial(dx, dy);
          }
        }

        if (edge(pad, BTN.A)) press();
        if (edge(pad, BTN.B)) back();
        if (edge(pad, BTN.X)) {
          const hint = document.getElementById("hintBtn");
          if (hint && visible(hint)) hint.click();
        }
        if (edge(pad, BTN.START)) back();
        if (edge(pad, BTN.LB)) move(-1);
        if (edge(pad, BTN.RB)) move(1);

        sync();
      }

    }

    function setConnected(on) {
      connected = on;
      document.documentElement.classList.toggle("gamepad-on", on);
      const badge = document.getElementById("gamepadBadge");
      if (badge) badge.classList.toggle("hidden", !on);
      // setInterval rather than requestAnimationFrame: rAF stops entirely in a
      // backgrounded or non-compositing tab, and a stand's pad should keep
      // responding regardless of what the browser thinks about painting.
      if (on && timer === null) timer = setInterval(poll, 16);
      if (!on && timer !== null) {
        clearInterval(timer);
        timer = null;
        if (current) current.classList.remove("gp-focus");
        current = null;
      }
    }

    window.addEventListener("gamepadconnected", () => setConnected(true));
    window.addEventListener("gamepaddisconnected", () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      setConnected(Array.from(pads).some((p) => p && p.connected));
    });

    // a pad already held down when the page loads only shows up after any input,
    // so check once in case the browser already knows about it
    const existing = navigator.getGamepads ? navigator.getGamepads() : [];
    if (Array.from(existing).some((p) => p && p.connected)) setConnected(true);
  }

  window.IBFighterGamepad = { init };
})();
