/**
 * Проверка навигации крестовиной — `node tests/gamepad-nav.js`.
 *
 * Прямоугольники сняты со страницы в бою на 1600×900 (боевой экран, ход открыт),
 * поэтому это не выдуманная сетка, а та самая раскладка, что стоит на стенде.
 * Тест гоняет чистую функцию pickInDirection из src/gamepad.js: она решает, куда
 * уедет подсветка, и именно в ней жил баг с «невидимыми блоками» — влево с
 * ПЕРЕЗАГРУЗИТЬ подсветка прыгала вверх в инвентарь вместо соседней кнопки.
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "gamepad.js"), "utf8");
const win = { addEventListener() {} };
const nav = { getGamepads: () => [] };
const doc = {
  documentElement: { classList: { toggle() {} } },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
new Function("window", "navigator", "document", src)(win, nav, doc);
const { _pickInDirection: pick } = win.IBFighterGamepad;

// боевой экран с подключённым падом: ИСПОЛЬЗОВАТЬ скрыта, в ряду две кнопки
const RAW = [
  ["ПАУЗА", 749, 80, 851, 111],
  ["firewall", 76, 501, 135, 561],
  ["waf", 140, 501, 200, 561],
  ["param_queries", 205, 501, 265, 561],
  ["edr", 270, 501, 330, 561],
  ["antivirus", 335, 501, 395, 561],
  ["backup", 400, 501, 460, 561],
  ["httponly_cookies", 465, 501, 524, 561],
  ["mfa", 529, 501, 589, 561],
  ["password_manager", 594, 501, 654, 561],
  ["ids", 659, 501, 719, 561],
  ["patch", 723, 502, 783, 561],
  ["ПЕРЕЗАГРУЗИТЬ", 561, 722, 1039, 796],
  ["AVAST", 1051, 722, 1530, 796],
  ["ПОДСКАЗКА", 70, 804, 1530, 856],
];
const SLOTS = 11;
// без пада ИСПОЛЬЗОВАТЬ на месте и встаёт первой в ряду действий
const RAW_WITH_USE = RAW.slice(0, SLOTS + 1)
  .concat([["ИСПОЛЬЗОВАТЬ", 70, 722, 549, 796]])
  .concat(RAW.slice(SLOTS + 1));

// главное меню, снято на 1600×900: карточки боссов лежат настоящей сеткой 3 + 2
const MENU = [
  ["ЧЕРВЬ", 412, 312, 655, 447],
  ["МАЛВАРЬ", 671, 312, 914, 447],
  ["ТРОЯН", 930, 312, 1172, 447],
  ["ФИШИНГ", 412, 463, 655, 580],
  ["0-DAY", 671, 463, 914, 580],
  ["СЛУЧАЙНЫЙ", 696, 600, 889, 640],
  ["ТЕМА", 618, 686, 792, 727],
  ["ПОЛНЫЙ ЭКРАН", 806, 686, 967, 727],
];

function build(raw) {
  const names = raw.map((r) => r[0]);
  const boxes = raw.map(([, l, t, r, b]) => ({ l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2 }));
  return { names, boxes };
}

const DIRS = { ВПРАВО: [1, 0], ВЛЕВО: [-1, 0], ВНИЗ: [0, 1], ВВЕРХ: [0, -1] };

let failures = 0;
function check(raw, from, dir, expected, opts = {}) {
  const { leftEdge = true, leftSlot = null, confine = false } = opts;
  const { names, boxes } = build(raw);
  const i = names.indexOf(from);
  if (i < 0) throw new Error(`нет такой цели: ${from}`);
  const [dx, dy] = DIRS[dir];
  // то же, что делает moveSpatial: в инвентарь возвращаемся на покинутый слот,
  // любой другой ряд встречает нас своим левым краем
  const choose = (row) => {
    const back = row.find((k) => names[k] === leftSlot);
    return back === undefined ? row[0] : back;
  };
  const j = pick(boxes[i], boxes, dx, dy, i, { leftEdge, choose, confine });
  const got = j < 0 ? "(остались на месте)" : names[j];
  const ok = got === expected;
  if (!ok) failures++;
  const memo = leftSlot ? ` [уходили со слота ${leftSlot}]` : "";
  console.log(`  ${ok ? "ok  " : "FAIL"} ${from} + ${dir} -> ${got}${memo}${ok ? "" : `  (ждали ${expected})`}`);
}

/** возврат в инвентарь: подсветка помнит слот, с которого ушла вниз */
const recall = (raw, from, dir, leftSlot, expected) => check(raw, from, dir, expected, { leftSlot });
/** ряд ПЕРЕЗАГРУЗИТЬ/AVAST — по горизонтали это тупик в обе стороны */
const inRow = (raw, from, dir, expected) => check(raw, from, dir, expected, { confine: true });
const menu = (from, dir, expected) => check(MENU, from, dir, expected, { leftEdge: false });

console.log("\n--- Инвентарь по горизонтали: сосед, а на краю — замыкание в кольцо ---");
check(RAW, "firewall", "ВПРАВО", "waf");
check(RAW, "waf", "ВЛЕВО", "firewall");
check(RAW, "mfa", "ВПРАВО", "password_manager");
check(RAW, "patch", "ВПРАВО", "firewall");
check(RAW, "firewall", "ВЛЕВО", "patch");

console.log("\n--- Ряд кнопок по горизонтали: без кольца, край держит подсветку ---");
inRow(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВПРАВО", "AVAST");
inRow(RAW, "AVAST", "ВЛЕВО", "ПЕРЕЗАГРУЗИТЬ");
// раньше отсюда подсветку уносило либо в другой конец ряда, либо вверх в слоты
inRow(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВЛЕВО", "(остались на месте)");
inRow(RAW, "AVAST", "ВПРАВО", "(остались на месте)");
inRow(RAW_WITH_USE, "ИСПОЛЬЗОВАТЬ", "ВПРАВО", "ПЕРЕЗАГРУЗИТЬ");
inRow(RAW_WITH_USE, "ИСПОЛЬЗОВАТЬ", "ВЛЕВО", "(остались на месте)");
inRow(RAW_WITH_USE, "AVAST", "ВПРАВО", "(остались на месте)");

console.log("\n--- Вниз из инвентаря: всегда левая кнопка, с какого бы слота ни шагнул ---");
check(RAW, "firewall", "ВНИЗ", "ПЕРЕЗАГРУЗИТЬ");
check(RAW, "backup", "ВНИЗ", "ПЕРЕЗАГРУЗИТЬ");
check(RAW, "patch", "ВНИЗ", "ПЕРЕЗАГРУЗИТЬ");
// без пада левым краем ряда становится ИСПОЛЬЗОВАТЬ
check(RAW_WITH_USE, "patch", "ВНИЗ", "ИСПОЛЬЗОВАТЬ");
check(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВНИЗ", "ПОДСКАЗКА");
check(RAW, "ПОДСКАЗКА", "ВВЕРХ", "ПЕРЕЗАГРУЗИТЬ");

console.log("\n--- Вверх в инвентарь: подсветка возвращается на покинутый слот ---");
recall(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВВЕРХ", "param_queries", "param_queries");
recall(RAW, "AVAST", "ВВЕРХ", "mfa", "mfa");
recall(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВВЕРХ", null, "firewall"); // ещё никуда не уходили
// предмет кончился и слот выпал из ряда — встаём на левый край, а не в пустоту
recall(RAW, "ПЕРЕЗАГРУЗИТЬ", "ВВЕРХ", "исчезнувший_слот", "firewall");

console.log("\n--- ПАУЗА висит в стороне над инвентарём, но остаётся достижимой ---");
check(RAW, "firewall", "ВВЕРХ", "ПАУЗА");
check(RAW, "ПОДСКАЗКА", "ВНИЗ", "ПАУЗА"); // низ экрана — колонка замыкается наверх
check(RAW, "ПАУЗА", "ВНИЗ", "firewall");

console.log("\n--- Меню: сетка боссов ходит вниз/вверх по колонке, а не к левому краю ---");
menu("МАЛВАРЬ", "ВНИЗ", "0-DAY");
menu("0-DAY", "ВВЕРХ", "МАЛВАРЬ");
menu("ФИШИНГ", "ВВЕРХ", "ЧЕРВЬ");
menu("ЧЕРВЬ", "ВНИЗ", "ФИШИНГ");
// под «ТРОЯНОМ» во втором ряду пусто — берётся ближайшая по диагонали, не левая
menu("ТРОЯН", "ВНИЗ", "0-DAY");
menu("0-DAY", "ВНИЗ", "СЛУЧАЙНЫЙ");
menu("СЛУЧАЙНЫЙ", "ВНИЗ", "ТЕМА");
menu("ЧЕРВЬ", "ВПРАВО", "МАЛВАРЬ");
menu("ТРОЯН", "ВПРАВО", "ЧЕРВЬ"); // в меню кольцо остаётся

console.log(
  failures === 0 ? "\nOK — навигация крестовиной ведёт себя предсказуемо.\n" : `\nПРОВАЛОВ: ${failures}\n`
);
process.exit(failures === 0 ? 0 : 1);
