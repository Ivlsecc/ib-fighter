/**
 * Skyline silhouettes + falling-code "matrix rain" background, rendered on a canvas.
 * Self-contained, no external assets — matches the hacker-aesthetic spec in section 9
 * of the design doc (dark navy sky, random lit windows, green code rain over rooftops).
 */
(function () {
  "use strict";

  const CODE_CHARS = "01".split("");
  const WINDOW_COLORS = ["#22d3ee", "#f59e0b", "#22c55e"];

  /** Sky and silhouette colours come from the CSS palette, so the canvas
   *  follows the light/dark toggle instead of carrying its own copies. */
  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function makeSkyline(width, buildingCount) {
    const buildings = [];
    let x = 0;
    while (x < width + 60) {
      const w = 40 + Math.random() * 50;
      const h = 80 + Math.random() * 180;
      const windows = [];
      const cols = Math.max(2, Math.floor(w / 14));
      const rows = Math.max(3, Math.floor(h / 18));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (Math.random() < 0.35) {
            windows.push({
              x: c * (w / cols) + 3,
              y: r * (h / rows) + 3,
              color: WINDOW_COLORS[Math.floor(Math.random() * WINDOW_COLORS.length)],
              on: Math.random() < 0.85,
            });
          }
        }
      }
      buildings.push({ x, w, h, windows });
      x += w + 4 + Math.random() * 10;
    }
    return buildings;
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.density] - code columns per 14px of width; >1 packs
   *   them tighter rather than spilling extra columns off the right edge
   * @param {boolean} [opts.skyline] - draw the building silhouettes. The battle
   *   stage turns this off: the fighters need a clean backdrop.
   */
  function initBackground(canvas, { density = 1, skyline: drawSkyline = true } = {}) {
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let buildings = [];
    let drops = [];
    let raf = null;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = canvas.width = Math.max(1, Math.floor(rect.width));
      height = canvas.height = Math.max(1, Math.floor(rect.height));
      buildings = drawSkyline ? makeSkyline(width) : [];
      // tighten the spacing instead of raising the count: with a fixed 14px
      // pitch the extra columns land past the right edge and never show
      const colWidth = Math.max(5, 14 / density);
      const colCount = Math.ceil(width / colWidth) + 1;
      drops = Array.from({ length: colCount }, (_, i) => ({
        x: i * colWidth,
        y: Math.random() * -height,
        speed: 40 + Math.random() * 70,
        len: 4 + Math.floor(Math.random() * 10),
      }));
    }

    let sky = themeColor("--sky", "#dbe4f7");
    let skyline = themeColor("--skyline", "#232c4d");

    let lastT = performance.now();
    let sinceThemeCheck = 0;
    function frame(t) {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      // re-read the palette a few times a second so the toggle takes effect
      // without tearing down and rebuilding the whole scene
      sinceThemeCheck += dt;
      if (sinceThemeCheck > 0.25) {
        sinceThemeCheck = 0;
        sky = themeColor("--sky", sky);
        skyline = themeColor("--skyline", skyline);
      }

      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // matrix rain (upper portion, behind skyline)
      ctx.font = "12px monospace";
      ctx.textBaseline = "top";
      for (const d of drops) {
        for (let i = 0; i < d.len; i++) {
          const cy = d.y - i * 14;
          if (cy < -14 || cy > height) continue;
          const alpha = 1 - i / d.len;
          ctx.fillStyle = `rgba(21, 128, 61, ${(0.55 * alpha).toFixed(2)})`;
          ctx.fillText(CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)], d.x, cy);
        }
        d.y += d.speed * dt;
        if (d.y - d.len * 14 > height) {
          d.y = Math.random() * -height * 0.5;
          d.speed = 40 + Math.random() * 70;
        }
      }

      if (drawSkyline) {
        // skyline silhouettes along the bottom edge
        ctx.fillStyle = skyline;
        for (const b of buildings) {
          const by = height - b.h;
          ctx.fillRect(b.x, by, b.w, b.h);
          for (const win of b.windows) {
            if (!win.on) continue;
            ctx.fillStyle = win.color;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(b.x + win.x, by + win.y, 5, 8);
            ctx.globalAlpha = 1;
            ctx.fillStyle = skyline;
          }
        }
        // ground strip with neon edge
        ctx.fillStyle = skyline;
        ctx.fillRect(0, height - 6, width, 6);
        ctx.fillStyle = "rgba(14, 116, 144, 0.7)";
        ctx.fillRect(0, height - 6, width, 2);
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
      },
    };
  }

  window.IBFighterBackground = { initBackground };
})();
