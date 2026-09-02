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

  /**
   * Identity of a target that survives the inventory being rebuilt between
   * turns — the slot elements are replaced wholesale, but the item behind them
   * is the same.
   */
  function keyOf(el) {
    if (!el) return null;
    if (el.dataset.itemId) return "item:" + el.dataset.itemId;
    if (el.dataset.fallback) return "fallback:" + el.dataset.fallback;
    if (el.id) return "#" + el.id;
    const parent = el.parentElement;
    if (!parent) return "?";
    return `${parent.id || parent.className}:${Array.prototype.indexOf.call(parent.children, el)}`;
  }

  /**
   * The slot the highlight last stood on.
   *
   * Only the inventory remembers a position, and only one: stepping down to the
   * buttons and back up should return you to the slot you left. The button row
   * deliberately does not remember — coming down out of the inventory always
   * lands on its left end, see `choose` in moveSpatial.
   */
  let lastSlotKey = null;

  function rememberSlot(el) {
    if (el && el.closest("#itemGrid")) lastSlotKey = keyOf(el);
  }

  /** Geometry of one target in viewport coordinates, plus its centre. */
  function boxOf(el) {
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  /** Lexicographic compare of two ranking keys (arrays of numbers). */
  function better(a, b) {
    if (!b) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  }

  /**
   * Index of the target the stick should move to, by geometry rather than DOM
   * order. Pure: takes boxes, returns an index (-1 for "stay put"), so
   * tests/gamepad-nav.js can check it against the stand's real layout.
   *
   * LEFT/RIGHT always walks the current row and wraps at its ends (pickNearest),
   * so the inventory slots cycle inside themselves instead of spilling into the
   * buttons below.
   *
   * `opts.confine` makes a row a dead end sideways: nothing ahead in the row
   * means the press does nothing, instead of wrapping to its far end or veering
   * off into a neighbouring row. The button row uses it; the inventory does not.
   *
   * UP/DOWN depends on `opts.leftEdge`, which the caller sets per screen:
   *
   *   true  — the battle screen. Changing row lands on that row's leftmost
   *           button, so DOWN from anywhere in the inventory is always
   *           ИСПОЛЬЗОВАТЬ (pickRow). One predictable landing spot beats
   *           "whatever sat directly underneath", which depends on the slot you
   *           happened to be on.
   *   false — the menu, whose boss cards are a real grid three columns wide.
   *           Snapping to the left edge there would fight the layout, so it
   *           keeps the plain nearest-in-that-direction search.
   */
  function pickInDirection(a, boxes, dx, dy, selfIndex, opts) {
    const { leftEdge, choose, confine } = opts || {};
    return dy !== 0 && leftEdge
      ? pickRow(a, boxes, dy, selfIndex, choose)
      : pickNearest(a, boxes, dx, dy, selfIndex, confine);
  }

  /**
   * UP/DOWN on the battle screen: step to the next row of buttons.
   *
   * `choose` picks which button in that row to land on, given its indices from
   * left to right; without one it is the leftmost.
   *
   * A row is "everything overlapping the nearest thing in that direction" —
   * derived from the boxes, so a new button lands in the right row without
   * anyone declaring rows anywhere. Off the last row the search wraps to the
   * far end, which is what makes ПАУЗА (alone above the arena) reachable by
   * pressing DOWN from the bottom of the screen.
   */
  function pickRow(a, boxes, dir, selfIndex, choose) {
    let ahead = -1;
    let aheadGap = Infinity;
    let behind = -1;
    let behindGap = -Infinity;

    for (let i = 0; i < boxes.length; i++) {
      if (i === selfIndex) continue;
      const b = boxes[i];
      // measured centre-to-edge, so anything sharing this row counts as neither
      const forward = dir > 0 ? b.cy - a.b : a.t - b.cy;
      const back = dir > 0 ? a.t - b.cy : b.cy - a.b;
      if (forward > 0) {
        if (forward < aheadGap) {
          aheadGap = forward;
          ahead = i;
        }
      } else if (back > 0 && back > behindGap) {
        behindGap = back;
        behind = i;
      }
    }

    const anchor = ahead >= 0 ? ahead : behind;
    if (anchor < 0) return -1;

    const row = [];
    for (let i = 0; i < boxes.length; i++) {
      if (i === selfIndex) continue;
      const b = boxes[i];
      if (Math.min(boxes[anchor].b, b.b) - Math.max(boxes[anchor].t, b.t) <= 0) continue;
      row.push(i);
    }
    row.sort((x, y) => boxes[x].l - boxes[y].l);
    return choose ? choose(row) : row[0];
  }

  /**
   * Nearest target in the pressed direction — used for LEFT/RIGHT everywhere,
   * and for UP/DOWN on screens that are a real grid rather than rows of buttons.
   *
   * Bucketed rather than scored with one blended number. A single "distance +
   * sideways offset" score mixes two units that do not compare: pressing LEFT
   * on ПЕРЕЗАГРУЗИТЬ used to score a slot in the row *above* better than the
   * button right beside it, because the slot was fewer pixels away in total.
   * That is what made navigation feel like it moved between invisible blocks.
   *
   * Two boxes are "in line" when they overlap on the axis across the press —
   * the same row for LEFT/RIGHT, the same column for UP/DOWN. Buckets, in
   * order: in line ahead; in line behind (wrap to the far end); off line ahead
   * (only reached by something alone in its line); off line behind, so a press
   * is never a dead end.
   *
   * "Overlap" needs a floor, not just a positive number. In the menu the
   * ПОЛНЫЙ ЭКРАН button clips the last boss card by 37px out of 161 — enough to
   * count as the same column and win outright, so DOWN from that card skipped
   * two whole rows. A quarter of the narrower box is the bar for "these really
   * do line up".
   */
  function pickNearest(a, boxes, dx, dy, selfIndex, confine) {
    const horizontal = dx !== 0;
    const dir = horizontal ? dx : dy;
    const picks = [-1, -1, -1, -1];
    const keys = [null, null, null, null];

    for (let i = 0; i < boxes.length; i++) {
      if (i === selfIndex) continue;
      const b = boxes[i];
      const overlap = horizontal
        ? Math.min(a.b, b.b) - Math.max(a.t, b.t)
        : Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const span = horizontal
        ? Math.min(a.b - a.t, b.b - b.t)
        : Math.min(a.r - a.l, b.r - b.l);
      const inLine = overlap > 0 && overlap >= span * 0.25;
      const offset = horizontal ? Math.abs(b.cy - a.cy) : Math.abs(b.cx - a.cx);
      const step = horizontal ? (b.cx - a.cx) * dir : (b.cy - a.cy) * dir;
      if (Math.abs(step) <= 1) continue; // dead sideways: neither ahead nor behind

      const forward = step > 0;
      const slot = (inLine ? 0 : 2) + (forward ? 0 : 1);
      let key;
      if (forward) {
        // gap between the facing edges — 0 for boxes that already touch
        const gap = Math.max(
          0,
          horizontal ? (dir > 0 ? b.l - a.r : a.l - b.r) : dir > 0 ? b.t - a.b : a.t - b.b
        );
        key = [gap + (inLine ? 0 : offset), offset];
      } else {
        key = [-Math.abs(step), offset]; // wrapping: the further back, the better
      }
      if (better(key, keys[slot])) {
        keys[slot] = key;
        picks[slot] = i;
      }
    }

    // confined: only a real neighbour further along this row counts, so the
    // ends of the row hold the highlight instead of throwing it somewhere else
    const hit = confine ? picks[0] : picks.find((i) => i >= 0);
    return hit === undefined || hit < 0 ? -1 : hit;
  }

  /**
   * Whether the screen on show is rows of buttons (battle) or a free grid
   * (menu). Only the row-based screens snap to the left edge — see
   * pickInDirection.
   */
  function leftEdgeScreen() {
    const menu = document.getElementById("menuScreen");
    return !(menu && !menu.classList.contains("hidden") && visible(menu));
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
        if (firstSlot) {
          current = firstSlot;
          rememberSlot(current);
        }
      }
      panelWasLocked = lockedNow;

      if (targets.length === 0) {
        if (current) current.classList.remove("gp-focus");
        current = null;
        return targets;
      }
      // keep the highlight where it was if that element is still on screen
      if (!current || !targets.includes(current)) {
        // The inventory is rebuilt between turns, so the element under the
        // highlight is replaced by an identical one. Follow it by identity
        // first — otherwise the highlight jumps every turn on its own.
        const sameItem = current && targets.find((el) => keyOf(el) === keyOf(current));
        // Failing that, prefer the first inventory slot over whatever comes
        // first in the DOM: landing on ПАУЗА by default means one stray A press
        // opens the pause window instead of picking a tool.
        const firstSlot = targets.find((el) => el.closest("#itemGrid"));
        current = sameItem || firstSlot || targets[Math.min(index, targets.length - 1)];
        index = targets.indexOf(current);
        rememberSlot(current);
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
      rememberSlot(current);
      paint(targets);
    }

    function moveSpatial(dx, dy) {
      const targets = collectTargets();
      if (!targets.length) return;
      if (!current || !targets.includes(current)) {
        current = targets[0];
        index = 0;
        paint(targets);
        return;
      }
      const boxes = targets.map(boxOf);
      const from = targets.indexOf(current);
      const to = pickInDirection(boxes[from], boxes, dx, dy, from, {
        leftEdge: leftEdgeScreen(),
        // The button row is a dead end sideways: LEFT on the leftmost button
        // stays there rather than wrapping round to AVAST or escaping upward
        // into the slots. With only two buttons a wrap is indistinguishable
        // from a plain move, which makes the row impossible to feel out. The
        // inventory keeps wrapping — eleven slots in a ring are a ring.
        confine: !!current.closest("#actionRow"),
        choose: (row) => {
          // Only the inventory is returned to. lastSlotKey never matches a
          // button, so every other row falls through to its left end: coming
          // down out of the inventory is always ПЕРЕЗАГРУЗИТЬ, whichever slot
          // you stepped off.
          const back = row.find((i) => keyOf(targets[i]) === lastSlotKey);
          return back === undefined ? row[0] : back;
        },
      });
      if (to < 0) return;
      current = targets[to];
      index = to;
      rememberSlot(current);
      paint(targets);
    }

    function press() {
      // the intro cutscene is dismissed by clicking anywhere on it
      const cutscene = document.getElementById("cutscene");
      if (cutscene && !cutscene.classList.contains("hidden") && visible(cutscene)) {
        cutscene.click();
        return;
      }
      const targets = sync();
      if (!current || !targets.includes(current)) return;
      // With a pad, moving the highlight onto a slot already puts the item in
      // the fighter's hands, so A is the throw rather than a second selection
      // step. The UI already reads a double-click on a slot as exactly that —
      // reuse it instead of inventing a second channel into the same action.
      if (current.closest("#itemGrid")) {
        current.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        return;
      }
      current.click();
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

  window.IBFighterGamepad = { init, _boxOf: boxOf, _pickInDirection: pickInDirection };
})();
