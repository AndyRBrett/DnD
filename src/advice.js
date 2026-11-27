// Claude suggestions: the prompt, request body, and answer parsing. Shared by
// the local server (src/worker.js) and the Supabase edge function
// (supabase/functions/dnd-advise/advice.js is a byte-for-byte copy; npm test
// checks they match). Raw HTTP rather than the SDK: the project installs no
// dependencies and both runtimes ship single files.

export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

export const adviceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "big_picture", "situation", "options", "ask_dm"],
  properties: {
    answer: { type: "string" },
    big_picture: { type: "string" },
    situation: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "why", "explain", "declare"],
        properties: {
          action: { type: "string" },
          why: { type: "string" },
          explain: { type: "string" },
          declare: { type: "string" }
        }
      }
    },
    ask_dm: { type: "string" }
  }
};

export const adviceSystem = [
  "You help a player at an in-person Dungeons & Dragons table decide what their character could do next.",
  "First read the story, not just the last line. From the campaign history and everything the DM has said this session, work out the bigger picture the DM is building: the party's objective, the threats and mysteries in play, what NPCs seem to want, clues and foreshadowing the DM has planted, unresolved threads, and where the story seems to be heading. Connect the latest update to that picture.",
  "Then give exactly three options that respond to the latest DM update and, where it fits, move the party toward the bigger picture: following a lead, using a planted clue, protecting the objective, or testing a theory. Prefer options that a thoughtful player who remembered the whole story would think of.",
  "big_picture is one or two short sentences on what the DM seems to be building toward right now. Present theories as possibilities (\"maybe\", \"seems\"), never as facts the DM has not revealed, and do not spoil or decide secrets.",
  "The player reads your answer on a phone mid-game, so be brief and concrete. For each option: action is a short title (one sentence); why is one short sentence on why it fits the story; explain says how the move works in plain words for someone new to D&D (whether it uses the action, bonus action, reaction, or movement; range or area; who rolls what, such as an attack roll or the target's saving throw; and any cost, uses, or concentration), in one or two sentences, from the sheet line and standard 5th edition rules, adding \"check with the DM\" where the table's version may differ; declare is how the player would announce it at the table, one sentence in third person present tense starting with the character's name (for example \"The White Wizard casts Bless on Logan, Dum Dum, and Arcturus.\"), with no outcome.",
  "If the player asks a question, answer it directly in answer: two to four plain sentences that use the story, the sheet, and standard 5th edition rules, saying where the DM's ruling decides it. Then make the three options fit the question. If there is no question, answer is an empty string.",
  "Never recommend anything listed under SPENT: the character has no uses or spell slots left for it until a rest.",
  "TABLE STATE comes from the app and is current: the round and whose turn it is, this character's HP, AC, conditions, and what is left of their spell slots and limited uses, the party's HP, and the enemies. When it is this character's turn in a fight, make the three options things to do this turn (action, bonus action, movement), weighing their HP, conditions, and what they have left, and protecting allies who are low. Enemy HP and AC are hidden: never guess numbers; Bloodied means about half or less.",
  "Only recommend abilities listed under READY on the character's sheet, or ordinary actions any adventurer could attempt (move, hide, help, talk, search, shove). Never recommend anything listed under UNCONFIRMED; if one looks relevant, put it in ask_dm as something to confirm with the DM.",
  "Do not invent spell slots, uses, items, or rules. When an ability has a cost or limit, mention checking it. Never state outcomes, damage, or success; the DM decides those.",
  "situation is a 2-4 word label such as \"Combat\" or \"Talking to the bartender\". ask_dm is one question the player could ask the DM, ideally one that would clarify the bigger picture or the immediate options.",
  "The DM updates are speech-to-text transcripts and may contain recognition errors or fragments; read them charitably and in context.",
  "An update starting \"🔒 To:\" was told only to the characters it names (the party is split up). Those characters know it; the others are elsewhere and don't, unless they've regrouped.",
  "Player actions are what the players said their characters are doing; the DM has not necessarily resolved them. Build on what this character already declared instead of repeating it, and account for what the others are doing.",
  "The campaign history is the group's own notes and may mention stats or abilities; those never count as available unless the character's sheet lists them as READY."
].join("\n");

// character.spent (optional): "Fireball: no 3rd-level or higher spell slot
// left" lines from the player's phone. Those abilities leave READY and are
// listed as spent until a rest.
export function sheetText(character) {
  const lines = String(character.moves ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  const body = line => line.includes("|") ? line.slice(line.indexOf("|") + 1).trim() : line;
  const spent = (Array.isArray(character.spent) ? character.spent : []).map(String);
  const spentNames = spent.map(item => item.split(":")[0].trim().toLowerCase()).filter(Boolean);
  // Takes spent abilities out of a line, even one that lists several
  // ("Bless, Spiritual Weapon, Spirit Guardians"); null if none are left.
  const withoutSpent = text => {
    const [list, ...rest] = text.split(" — ");
    const names = list.split(/,\s*/).map(name => name.trim()).filter(Boolean);
    const left = names.filter(name => !spentNames.includes(name.toLowerCase()));
    if (!names.length || left.length === names.length) return text;
    return left.length ? [left.join(", "), ...rest].join(" — ") : null;
  };
  const ready = lines.filter(line => !/^check\s*\|/i.test(line)).map(line => withoutSpent(body(line))).filter(Boolean).map(text => "- " + text);
  const check = lines.filter(line => /^check\s*\|/i.test(line)).map(line => "- " + body(line));
  return [
    "Character: " + character.name + (character.role ? " (" + character.role + ")" : ""),
    "READY abilities:\n" + (ready.join("\n") || "- none recorded"),
    ...(spent.length ? ["SPENT right now, out of uses until a rest (do not recommend):\n" + spent.map(item => "- " + item).join("\n")] : []),
    "UNCONFIRMED abilities (do not recommend):\n" + (check.join("\n") || "- none")
  ].join("\n\n");
}

// "🔒 To: The White Wizard" on an update's first line: only those characters
// heard it (the app's split-party updates; src/encounter.js reads the same).
export function sceneHeardBy(text, name) {
  const value = String(text ?? "");
  if (!value.startsWith("🔒 To: ")) return true;
  const plain = entry => String(entry ?? "").trim().toLowerCase().replace(/^the\s+/, "");
  const end = value.indexOf("\n");
  return value.slice("🔒 To: ".length, end < 0 ? undefined : end).split(",").some(entry => plain(entry) === plain(name));
}

// Keeps the most recent updates that fit, oldest first, so a long session
// still sends hours of narration.
export const SESSION_CHARS = 30000;
export function sessionWindow(scenes) {
  const kept = [];
  let total = 0;
  for (const scene of [...scenes].reverse()) {
    total += scene.text.length + 3;
    if (kept.length && total > SESSION_CHARS) break;
    kept.unshift(scene);
  }
  return kept;
}

// scenes: this table's DM updates, oldest to newest (the whole session),
// each { text, created? (ms) }. actions: what players said their characters
// do, each { name, text, created (ms) }, woven in by time. history: the
// campaign's notes so far (may be empty). The history and the session so far
// come first with cache breakpoints, so every character asking about the same
// moment reuses them; only the sheet, latest update, and newest actions vary.
// table (optional): a short TABLE STATE snapshot from the player's phone.
export function claudeRequest(apiKey, character, scenes, history = "", actions = [], question = "", table = "") {
  const session = sessionWindow(scenes);
  // A split party: the latest update is the newest one this character heard
  // (one starting "🔒 To:" went only to the characters it names).
  const latest = [...session].reverse().find(scene => sceneHeardBy(scene.text, character.name)) ?? session.at(-1);
  const earlier = session.filter(scene => scene !== latest);
  const latestAt = Number(latest?.created ?? Infinity);
  const firstAt = Number(earlier[0]?.created ?? session[0]?.created ?? -Infinity);
  const timeline = [
    ...earlier.map(scene => ({ at: Number(scene.created ?? 0), line: "DM: " + scene.text })),
    ...actions.filter(action => action.created < latestAt && action.created >= firstAt)
      .map(action => ({ at: action.created, line: action.name + " (player): " + action.text }))
  ].sort((a, b) => a.at - b.at);
  const newest = actions.filter(action => action.created >= latestAt);
  const content = [];
  if (history.trim()) {
    content.push({
      type: "text",
      text: "CAMPAIGN HISTORY (the group's notes on earlier sessions, oldest first):\n\n" + history.trim(),
      cache_control: { type: "ephemeral", ttl: "1h" }
    });
  }
  if (timeline.length) {
    content.push({
      type: "text",
      text: "THIS SESSION SO FAR (DM updates and what players said their characters did, oldest first" + (session.length < scenes.length ? "; the earliest were trimmed" : "") + "):\n" + timeline.map(entry => "- " + entry.line).join("\n"),
      cache_control: { type: "ephemeral" }
    });
  }
  content.push({ type: "text", text: sheetText(character) + "\n\nLATEST DM UPDATE:\n" + (latest?.text ?? "(none yet)")
    + (newest.length ? "\n\nPLAYER ACTIONS SINCE THAT UPDATE (declared, not yet resolved by the DM):\n" + newest.map(action => "- " + action.name + ": " + action.text).join("\n") : "")
    + (String(table).trim() ? "\n\nTABLE STATE (from the app, right now):\n" + String(table).trim().slice(0, 2000) : "")
    + (question.trim() ? "\n\nTHE PLAYER'S QUESTION:\n" + question.trim().slice(0, 300) : "") });
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: adviceSchema } },
      system: adviceSystem,
      messages: [{ role: "user", content }]
    })
  };
}

export class AdviceError extends Error {}

// Returns { answer, bigPicture, situation, options: [{action, why, explain,
// declare}] (three), question } or throws
// AdviceError with a message fit to show a player.
export async function readAdvice(response) {
  if (!response.ok) {
    console.error("Claude request failed", response.status, (await response.text()).slice(0, 300));
    throw new AdviceError(response.status === 429 ? "Claude is busy. Try again in a moment." : "Claude could not answer. Use the suggestions above.");
  }
  const message = await response.json();
  if (message.stop_reason === "refusal") throw new AdviceError("Claude declined this one. Use the suggestions above.");
  if (message.stop_reason === "max_tokens") throw new AdviceError("Claude ran long. Try again.");
  let advice;
  try {
    advice = JSON.parse(message.content.find(block => block.type === "text")?.text ?? "");
  } catch {
    throw new AdviceError("Claude's answer was unreadable. Try again.");
  }
  return {
    answer: String(advice.answer ?? "").slice(0, 1200),
    bigPicture: String(advice.big_picture ?? "").slice(0, 400),
    situation: String(advice.situation).slice(0, 80),
    options: advice.options.slice(0, 3).map(option => ({
      action: String(option.action).slice(0, 400),
      why: String(option.why).slice(0, 300),
      explain: String(option.explain ?? "").slice(0, 500),
      declare: String(option.declare ?? "").slice(0, 300)
    })),
    question: String(advice.ask_dm).slice(0, 300)
  };
}

// ── For the DM: enemies built from a description, and a DM assistant ──────
// Both are host-only (the edge function and the local server check) and use
// the same story context as a player's ask: the campaign history and this
// session, cached the same way.

export const enemySchema = {
  type: "object",
  additionalProperties: false,
  required: ["enemies", "note"],
  properties: {
    enemies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "count", "cr", "ac", "hp", "init", "speed", "saves", "attacks", "routine", "abilities"],
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
          cr: { type: "string" },
          ac: { type: "integer" },
          hp: { type: "string" },
          init: { type: "integer" },
          speed: { type: "integer" },
          saves: { type: "array", items: { type: "integer" } },
          attacks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "hit", "damage", "extra_damage", "extra_type", "save", "dc", "effect"],
              properties: {
                name: { type: "string" },
                hit: { type: "integer" },
                damage: { type: "string" },
                extra_damage: { type: "string" },
                extra_type: { type: "string" },
                save: { type: "string" },
                dc: { type: "integer" },
                effect: { type: "string" }
              }
            }
          },
          routine: { type: "array", items: { type: "integer" } },
          abilities: { type: "string" }
        }
      }
    },
    note: { type: "string" }
  }
};

export const enemySystem = [
  "You build enemy stat blocks for the DM of an in-person Dungeons & Dragons 5th edition game. The DM describes the enemies they want; you return stat blocks the DM's app can run.",
  "Fit them to the story so far: names, flavor and abilities should belong to the scene the DM is running. Balance them for the party in PARTY (their levels and size) and the difficulty the DM asks for (default: a fair fight). Use standard 5th edition math for the challenge rating you choose: AC, HP, attack bonus, damage per round and save DCs in line with that CR.",
  "name is what the DM's tracker shows (\"Masked Croupier\"); the app numbers copies. count is how many of this enemy (1 to 12; what the DM asked for, or a sensible number). cr is the challenge rating as a string (\"1/2\", \"5\"). hp is dice like \"11d8+22\". init is the Dexterity modifier. saves is exactly six integers: Str, Dex, Con, Int, Wis, Cha save bonuses.",
  "attacks: at most three. name is short; put \"(×2)\" in the name when the enemy makes that attack twice in a turn (\"Brass Rake (×2)\"). hit is the to-hit bonus; damage is dice like \"1d10+4\". When a hit also does something, fill extra_damage and extra_type (\"2d6\", \"fire\") and/or save, dc and effect (\"Str\", 14, \"pulled 10 ft toward it\"); otherwise leave them as empty strings and dc 0. routine is the indexes of the attacks one turn uses (usually [0]; [0, 1] for claws and a bite).",
  "abilities is two to four short plain sentences: multiattack, special moves with their saves and recharge, resistances and immunities, and one line of tactics (how they fight, when they flee). Write everything in your own words.",
  "At most four different enemies. note is one sentence to the DM: how hard the fight should be for this party and one way to make it more interesting.",
  "The DM updates are speech-to-text transcripts and may contain recognition errors; read them charitably."
].join("\n");

export const dmSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "ideas"],
  properties: {
    answer: { type: "string" },
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "line"],
        properties: { title: { type: "string" }, detail: { type: "string" }, line: { type: "string" } }
      }
    }
  }
};

export const dmSystem = [
  "You help the Dungeon Master of an in-person Dungeons & Dragons 5th edition game, mid-session, from their phone. The players cannot see your answer.",
  "Read the campaign history and the whole session first: the party's objective, the threats and mysteries, what NPCs want, threads left open, and what the players have been doing. Everything you suggest should fit that story and build on it.",
  "The DM may ask for a twist, an NPC (a name, a look, a voice, what they want), a description of a place or moment, what enemies would do now (their tactics given TABLE STATE), a ruling, or anything else. Answer what they asked.",
  "answer is two to four short sentences that answer the DM directly. ideas are up to three options: title is a few words; detail is one or two sentences on how it plays and why it fits; line is something the DM could read or post to the table as is (narration in second person plural or an NPC's words), or an empty string when there's nothing to read out.",
  "Never decide for the players or spend their resources. Leave rolls and outcomes to the table. Keep secrets the DM has not revealed out of any line meant for the players.",
  "TABLE STATE comes from the DM's app: the round and turn, the party's HP and conditions, and the enemies with their real HP. Use it for tactics and pacing.",
  "The DM updates are speech-to-text transcripts and may contain recognition errors or fragments; read them charitably and in context."
].join("\n");

// The story every DM ask carries: history and the session, cached.
function storyBlocks(scenes, history, actions) {
  const session = sessionWindow(scenes);
  const firstAt = Number(session[0]?.created ?? -Infinity);
  const timeline = [
    ...session.map(scene => ({ at: Number(scene.created ?? 0), line: "DM: " + scene.text })),
    ...actions.filter(action => Number(action.created) >= firstAt).map(action => ({ at: Number(action.created), line: action.name + " (player): " + action.text }))
  ].sort((a, b) => a.at - b.at);
  const blocks = [];
  if (String(history).trim()) blocks.push({ type: "text", text: "CAMPAIGN HISTORY (the group's notes on earlier sessions, oldest first):\n\n" + String(history).trim(), cache_control: { type: "ephemeral", ttl: "1h" } });
  if (timeline.length) blocks.push({ type: "text", text: "THIS SESSION SO FAR (DM updates and what players said their characters did, oldest first):\n" + timeline.map(entry => "- " + entry.line).join("\n"), cache_control: { type: "ephemeral" } });
  return blocks;
}

// mode: "enemies" (stat blocks from a description) or "dm" (the assistant).
// party: [{ name, role }] from the roster. table: the DM's TABLE STATE.
export function dmRequest(apiKey, mode, { scenes = [], history = "", actions = [], party = [], prompt = "", table = "" } = {}) {
  const enemies = mode === "enemies";
  const content = storyBlocks(scenes, history, actions);
  content.push({ type: "text", text: "PARTY:\n" + party.map(member => "- " + member.name + (member.role ? " (" + member.role + ")" : "")).join("\n")
    + (String(table).trim() ? "\n\nTABLE STATE (from the DM's app, right now):\n" + String(table).trim().slice(0, 3000) : "")
    + "\n\n" + (enemies ? "THE ENEMIES THE DM WANTS:\n" : "THE DM ASKS:\n") + String(prompt).trim().slice(0, 600) });
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: enemies ? enemySchema : dmSchema } },
      system: enemies ? enemySystem : dmSystem,
      messages: [{ role: "user", content }]
    })
  };
}

async function readJsonAnswer(response) {
  if (!response.ok) {
    console.error("Claude request failed", response.status, (await response.text()).slice(0, 300));
    throw new AdviceError(response.status === 429 ? "Claude is busy. Try again in a moment." : "Claude could not answer. Try again.");
  }
  const message = await response.json();
  if (message.stop_reason === "refusal") throw new AdviceError("Claude declined this one. Try rewording it.");
  if (message.stop_reason === "max_tokens") throw new AdviceError("Claude ran long. Try again.");
  try {
    return JSON.parse(message.content.find(block => block.type === "text")?.text ?? "");
  } catch {
    throw new AdviceError("Claude's answer was unreadable. Try again.");
  }
}

const whole = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Math.round(Number(value)))) : fallback;
const DICE = /^\d{1,2}d\d{1,3}(\s*[+-]\s*\d{1,3})?$|^\d{1,4}$/;
const ABILITY_SHORT = ["Str", "Dex", "Con", "Int", "Wis", "Cha"];

// Returns { enemies: [template + count], note }: the encounter tracker's
// template shape ({ name, cr, ac, hp, init, speed, saves, attacks: [[name,
// hit, damage, rider?]], routine, abilities }), with every number clamped
// and dice that don't parse dropped.
export async function readEnemies(response) {
  const answer = await readJsonAnswer(response);
  const enemies = (Array.isArray(answer.enemies) ? answer.enemies : []).slice(0, 4).map(enemy => {
    // Attacks whose damage doesn't roll are dropped; kept[i] is where the
    // original attack i ended up, so the routine still names the right ones.
    const kept = [];
    const attacks = (Array.isArray(enemy.attacks) ? enemy.attacks : []).slice(0, 3)
      .map((attack, index) => [attack, index])
      .filter(([attack]) => DICE.test(String(attack.damage ?? "").trim()))
      .map(([attack, index], position) => {
        kept[index] = position;
        const rider = {};
        if (DICE.test(String(attack.extra_damage ?? "").trim()) && String(attack.extra_damage).trim()) Object.assign(rider, { damage: String(attack.extra_damage).replace(/\s/g, ""), type: String(attack.extra_type ?? "").slice(0, 20) });
        const save = ABILITY_SHORT.find(short => short.toLowerCase() === String(attack.save ?? "").slice(0, 3).toLowerCase());
        if (save && Number(attack.dc) > 0) Object.assign(rider, { save, dc: whole(attack.dc, 5, 30, 13), ...(attack.effect ? { effect: String(attack.effect).slice(0, 120) } : {}), ...(rider.damage ? { half: true } : {}) });
        const base = [String(attack.name ?? "Attack").slice(0, 40), whole(attack.hit, -5, 20, 0), String(attack.damage).replace(/\s/g, "")];
        return Object.keys(rider).length ? [...base, rider] : base;
      });
    const saves = Array.from({ length: 6 }, (_, index) => whole(enemy.saves?.[index], -5, 20, 0));
    return {
      name: String(enemy.name ?? "Enemy").slice(0, 40) || "Enemy",
      count: whole(enemy.count, 1, 12, 1),
      cr: String(enemy.cr ?? "").slice(0, 6),
      ac: whole(enemy.ac, 5, 30, 12),
      hp: DICE.test(String(enemy.hp ?? "").trim()) ? String(enemy.hp).replace(/\s/g, "") : "10",
      init: whole(enemy.init, -5, 15, 0),
      speed: whole(enemy.speed, 0, 120, 30),
      saves,
      attacks,
      routine: [...new Set((Array.isArray(enemy.routine) ? enemy.routine : [0]).map(index => kept[Number(index)]).filter(Number.isInteger))].slice(0, 4),
      abilities: String(enemy.abilities ?? "").slice(0, 1000)
    };
  });
  if (!enemies.length) throw new AdviceError("Claude didn't return any enemies. Try describing them again.");
  return { enemies, note: String(answer.note ?? "").slice(0, 400) };
}

// Returns { answer, ideas: [{ title, detail, line }] (up to three) }.
export async function readDmHelp(response) {
  const answer = await readJsonAnswer(response);
  return {
    answer: String(answer.answer ?? "").slice(0, 1200),
    ideas: (Array.isArray(answer.ideas) ? answer.ideas : []).slice(0, 3).map(idea => ({
      title: String(idea.title ?? "").slice(0, 120),
      detail: String(idea.detail ?? "").slice(0, 500),
      line: String(idea.line ?? "").slice(0, 600)
    }))
  };
}
