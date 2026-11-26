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

// "+2 adv." or "+2 with advantage" (Feral Instinct): the roll has advantage;
// "+1 (disadvantage in scale mail)": disadvantage.
export const rollModeFrom = value => /\bdisadv/i.test(String(value)) ? "disadvantage"
  : /\badv(antage|\.|\b)/i.test(String(value)) ? "advantage" : "normal";

// Critical-hit damage: every damage die is rolled twice (modifiers once),
// plus `extra` more of the first die (Brutal Critical). "1d12+7" → "3d12+7"
// with one extra.
export function critExpression(expression, extra = 0) {
  const text = normalize(expression);
  let first = null;
  const doubled = text.replace(/(\d*)d(\d+)/g, (_, count, sides) => {
    first ??= sides;
    return Number(count || 1) * 2 + "d" + sides;
  });
  return extra > 0 && first ? doubled.replace(new RegExp("(\\d+)d" + first), (_, count) => (Number(count) + extra) + "d" + first) : doubled;
}

// Advantage or disadvantage rolled as two separate d20s (the second one after
// the first was already in): keep the higher (or lower) natural roll, so a
// natural 20 on either die with advantage is the one that counts.
export function keepD20(first, second, mode) {
  const better = mode === "disadvantage" ? second.natural < first.natural : second.natural > first.natural;
  return { ...(better ? second : first), mode };
}

// A roll made with real dice at the table: the player enters what the d20
// shows (the app adds the modifier, and a 20 or a 1 is still a crit or a
// fumble), or for anything else the dice total before the modifier. Returns
// a result shaped like roll()'s, or null when the number can't come from
// those dice.
export function tableRoll(expression, value, mode = "normal") {
  const parsed = parse(expression);
  const shown = Math.round(Number(value));
  if (!parsed || !parsed.dice.length || String(value).trim() === "" || !Number.isFinite(shown)) return null;
  const single20 = parsed.dice.length === 1 && parsed.dice[0].count === 1 && parsed.dice[0].sides === 20 && parsed.dice[0].sign === 1;
  const low = parsed.dice.reduce((sum, die) => sum + die.sign * (die.sign > 0 ? die.count : die.count * die.sides), 0);
  const high = parsed.dice.reduce((sum, die) => sum + die.sign * (die.sign > 0 ? die.count * die.sides : die.count), 0);
  if (shown < low || shown > high) return null;
  const natural = single20 ? shown : null;
  const mod = parsed.modifier;
  return {
    expression: normalize(expression),
    total: shown + mod,
    groups: parsed.dice.map((die, at) => ({ ...die, results: at === 0 ? [shown] : [] })),
    modifier: mod,
    mode: single20 ? mode : "normal",
    dropped: null,
    natural,
    critical: natural === 20,
    fumble: natural === 1,
    table: true,
    breakdown: "table dice: " + shown + (mod ? (mod > 0 ? " + " : " − ") + Math.abs(mod) : "")
  };
}

// What to ask for when the player rolls real dice: the d20's face, or the
// dice total (the app adds the modifier).
export function tablePrompt(expression, mode = "normal") {
  const parsed = parse(expression);
  if (!parsed || !parsed.dice.length) return "";
  const single20 = parsed.dice.length === 1 && parsed.dice[0].count === 1 && parsed.dice[0].sides === 20;
  const mod = parsed.modifier ? " (the app adds " + (parsed.modifier > 0 ? "+" : "−") + Math.abs(parsed.modifier) + ")" : "";
  if (single20) return (mode === "advantage" ? "Roll two d20s, enter the higher" : mode === "disadvantage" ? "Roll two d20s, enter the lower" : "What does your d20 show?") + mod;
  const dice = parsed.dice.map(die => (die.sign < 0 ? "−" : "") + die.count + "d" + die.sides).join(" + ");
  return "Add up your dice (" + dice + ")" + mod;
}
