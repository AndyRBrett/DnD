// Dice: parse expressions like "d20+11", "2d8+5", "+9" (a d20 check), or
// "1d12+7", and roll them with crypto randomness. Pure functions apart from
// the random source, which tests can replace.

const MAX_DICE = 100;

export function randomInt(sides, random = cryptoRandom) {
  return 1 + Math.floor(random() * sides);
}

function cryptoRandom() {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}

// "+9" or "-1" (a bonus on its own) means a d20 check.
export function normalize(expression) {
  const text = String(expression).replace(/[−–]/g, "-").replace(/\s+/g, "").toLowerCase();
  return /^[+-]\d+$/.test(text) ? "d20" + text : text;
}

// Returns { dice: [{ count, sides, sign }], modifier } or null if invalid.
export function parse(expression) {
  const text = normalize(expression);
  if (!text || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(text)) return null;
  const dice = [];
  let modifier = 0;
  for (const [, sign, count, sides, flat] of text.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
    const direction = sign === "-" ? -1 : 1;
    if (flat !== undefined) modifier += direction * Number(flat);
    else dice.push({ count: Number(count || 1), sides: Number(sides), sign: direction });
  }
  const total = dice.reduce((sum, die) => sum + die.count, 0);
  if (!dice.length && modifier === 0) return null;
  if (total > MAX_DICE || dice.some(die => die.sides < 2 || die.sides > 1000)) return null;
  return { dice, modifier };
}

// mode: "normal" | "advantage" | "disadvantage" (applies to a single d20).
export function roll(expression, { mode = "normal", random = cryptoRandom } = {}) {
  const parsed = parse(expression);
  if (!parsed) return null;
  const groups = parsed.dice.map(die => ({
    ...die,
    results: Array.from({ length: die.count }, () => randomInt(die.sides, random))
  }));
  const single20 = groups.length === 1 && groups[0].count === 1 && groups[0].sides === 20 && groups[0].sign === 1;
  let dropped = null;
  if (single20 && mode !== "normal") {
    const other = randomInt(20, random);
    const first = groups[0].results[0];
    const keep = mode === "advantage" ? Math.max(first, other) : Math.min(first, other);
    dropped = keep === first ? other : first;
    groups[0].results = [keep];
  }
  const diceTotal = groups.reduce((sum, group) => sum + group.sign * group.results.reduce((a, b) => a + b, 0), 0);
  const total = diceTotal + parsed.modifier;
  const natural = single20 ? groups[0].results[0] : null;
  return {
    expression: normalize(expression),
    total,
    groups,
    modifier: parsed.modifier,
    mode: single20 ? mode : "normal",
    dropped,
    natural,
    critical: natural === 20,
    fumble: natural === 1,
    breakdown: describe(groups, parsed.modifier, dropped)
  };
}

function describe(groups, modifier, dropped) {
  const parts = groups.map(group => (group.sign < 0 ? "− " : "") + "d" + group.sides + ": " + group.results.join(" + ")
    + (dropped !== null ? " (other " + dropped + ")" : ""));
  if (modifier) parts.push((modifier > 0 ? "+ " : "− ") + Math.abs(modifier));
  return parts.join(" ");
}

// Builds an expression from a dice pool: { 20: 1, 6: 2 } and a modifier.
export function poolExpression(pool, modifier = 0) {
  const dice = Object.entries(pool).filter(([, count]) => count > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([sides, count]) => (count > 1 ? count : "") + "d" + sides);
  const mod = modifier ? (modifier > 0 ? "+" : "-") + Math.abs(modifier) : "";
  return dice.length ? dice.join("+") + mod : "";
}

// From a sheet value like "+11", "2d8+5", "5 × d10", or "17" (a DC), the
// expression to roll, or null when it isn't rollable.
export function rollableFrom(value) {
  const text = normalize(String(value).replace(/\*$/, "").split(/\s/)[0]);
  if (/^d20[+-]\d+$/.test(text) && /^[+\-−]/.test(String(value).trim())) return text;
  return /\d*d\d+/.test(text) && parse(text) ? text : null;
}
