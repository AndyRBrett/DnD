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
  "The DM updates are speech-to-text transcripts and may contain recognition errors or fragments; read them charitably and in context. A long session may begin with a recap of its earlier part, written from the transcript; treat it as what happened, and the lines after it as the newest.",
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
// recap (optional): { text, uptoAt } from the running recap; the session
// block then carries only what happened after it.
export function claudeRequest(apiKey, character, scenes, history = "", actions = [], question = "", table = "", recap = null) {
  const after = sinceRecap(scenes, actions, recap);
  const session = sessionWindow(after.scenes);
  // A split party: the latest update is the newest one this character heard
  // (one starting "🔒 To:" went only to the characters it names), found in
  // the whole session, and none at all if they haven't heard one yet.
  const latest = [...scenes].reverse().find(scene => sceneHeardBy(scene.text, character.name)) ?? null;
  const earlier = session.filter(scene => scene !== latest);
  const latestAt = Number(latest?.created ?? Infinity);
  // Actions before the first update kept here are left out only when older
  // updates were trimmed; after a recap, everything after its cutoff counts.
  const trimmed = session.length < after.scenes.length;
  const firstAt = trimmed ? Number(earlier[0]?.created ?? session[0]?.created ?? -Infinity) : -Infinity;
  const timeline = [
    ...earlier.map(scene => ({ at: Number(scene.created ?? 0), line: "DM: " + scene.text })),
    ...after.actions.filter(action => action.created < latestAt && action.created >= firstAt)
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
  if (after.recap) content.push(recapBlock(after.recap));
  if (timeline.length) {
    content.push({
      type: "text",
      text: (after.recap ? "THIS SESSION SINCE THAT RECAP" : "THIS SESSION SO FAR") + " (DM updates and what players said their characters did, oldest first" + (session.length < after.scenes.length ? "; the earliest were trimmed" : "") + "):\n" + timeline.map(entry => "- " + entry.line).join("\n"),
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
export async function readAdvice(response, onUsage = () => {}) {
  if (!response.ok) {
    console.error("Claude request failed", response.status, (await response.text()).slice(0, 300));
    throw new AdviceError(response.status === 429 ? "Claude is busy. Try again in a moment." : "Claude could not answer. Use the suggestions above.");
  }
  const message = await response.json();
  onUsage(usageOf(message));
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
  "The DM updates are speech-to-text transcripts and may contain recognition errors; read them charitably. A long session may begin with a recap of its earlier part, written from the transcript; treat it as what happened, and the lines after it as the newest."
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
  "The DM updates are speech-to-text transcripts and may contain recognition errors or fragments; read them charitably and in context. A long session may begin with a recap of its earlier part, written from the transcript; treat it as what happened, and the lines after it as the newest."
].join("\n");

// The story every DM ask carries: history and the session, cached.
function storyBlocks(scenes, history, actions, recap = null) {
  const after = sinceRecap(scenes, actions, recap);
  const session = sessionWindow(after.scenes);
  const firstAt = session.length < after.scenes.length ? Number(session[0]?.created ?? -Infinity) : -Infinity;
  const timeline = [
    ...session.map(scene => ({ at: Number(scene.created ?? 0), line: "DM: " + scene.text })),
    ...after.actions.filter(action => Number(action.created) >= firstAt).map(action => ({ at: Number(action.created), line: action.name + " (player): " + action.text }))
  ].sort((a, b) => a.at - b.at);
  const blocks = [];
  if (String(history).trim()) blocks.push({ type: "text", text: "CAMPAIGN HISTORY (the group's notes on earlier sessions, oldest first):\n\n" + String(history).trim(), cache_control: { type: "ephemeral", ttl: "1h" } });
  if (after.recap) blocks.push(recapBlock(after.recap));
  if (timeline.length) blocks.push({ type: "text", text: (after.recap ? "THIS SESSION SINCE THAT RECAP" : "THIS SESSION SO FAR") + " (DM updates and what players said their characters did, oldest first):\n" + timeline.map(entry => "- " + entry.line).join("\n"), cache_control: { type: "ephemeral" } });
  return blocks;
}

// mode: "enemies" (stat blocks from a description) or "dm" (the assistant).
// party: [{ name, role }] from the roster. table: the DM's TABLE STATE.
export function dmRequest(apiKey, mode, { scenes = [], history = "", actions = [], party = [], prompt = "", table = "", recap = null } = {}) {
  const enemies = mode === "enemies";
  const content = storyBlocks(scenes, history, actions, recap);
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

async function readJsonAnswer(response, onUsage = () => {}) {
  if (!response.ok) {
    console.error("Claude request failed", response.status, (await response.text()).slice(0, 300));
    throw new AdviceError(response.status === 429 ? "Claude is busy. Try again in a moment." : "Claude could not answer. Try again.");
  }
  const message = await response.json();
  onUsage(usageOf(message));
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
export async function readEnemies(response, onUsage) {
  const answer = await readJsonAnswer(response, onUsage);
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
export async function readDmHelp(response, onUsage) {
  const answer = await readJsonAnswer(response, onUsage);
  return {
    answer: String(answer.answer ?? "").slice(0, 1200),
    ideas: (Array.isArray(answer.ideas) ? answer.ideas : []).slice(0, 3).map(idea => ({
      title: String(idea.title ?? "").slice(0, 120),
      detail: String(idea.detail ?? "").slice(0, 500),
      line: String(idea.line ?? "").slice(0, 600)
    }))
  };
}

// ── Cost: what each call used, and the running recap ──

// The token counts Claude reports for one call, for the dnd_ai_tokens log.
export function usageOf(message) {
  const usage = message?.usage ?? {};
  const count = value => Math.max(0, Math.round(Number(value) || 0));
  return {
    model: String(message?.model ?? "").slice(0, 60),
    input_tokens: count(usage.input_tokens),
    output_tokens: count(usage.output_tokens),
    cache_read: count(usage.cache_read_input_tokens),
    cache_write: count(usage.cache_creation_input_tokens)
  };
}

// A long session is sent as a short recap of its earlier part plus the newest
// lines word for word, so each call carries less and the recap block caches.
// Once more than RECAP_TRIGGER characters have piled up since the last recap,
// all but the newest RECAP_KEEP characters are folded into it by the cheap
// model. A recap that can't be made never blocks advice: the old one (or the
// raw session) is used.
export const RECAP_MODEL = "claude-haiku-5-5";
export const RECAP_TRIGGER = 12000;
export const RECAP_KEEP = 4000;

export const recapSystem = [
  "You keep the running recap of a Dungeons & Dragons session in progress, so an assistant can follow the story without the raw transcript.",
  "You get the recap so far (it may be empty) and the newest lines: DM updates, which are live speech-to-text with recognition errors and stray fragments, and what players said their characters do, including dice rolls and attack results.",
  "Write the updated recap of the whole session so far as plain text: the earlier recap's facts plus the new lines, in order. Keep names, places, clues, NPC words that matter, rolls that decided something, who was hurt or knocked out, resources spent, and open threads. Mark anything the DM sent only to some characters (lines starting \"🔒 To:\") with who heard it.",
  "Fix obvious speech-to-text errors using the party and NPC names (for example \"maze\" for mage). Drop fragments that carry no story. Never invent events, outcomes, or motives, and don't guess at secrets: if a line is unclear, leave it out or say it is unclear.",
  "Under 700 words. No headings or commentary, just the recap."
].join("\n");

const entryLine = entry => entry.kind === "scene" ? "DM: " + entry.text : entry.name + " (player): " + entry.text;
function storyEntries(scenes, actions) {
  return [
    ...scenes.map(scene => ({ kind: "scene", at: Number(scene.created ?? 0), text: String(scene.text ?? "") })),
    ...actions.map(action => ({ kind: "action", at: Number(action.created ?? 0), name: action.name, text: String(action.text ?? "") }))
  ].sort((a, b) => a.at - b.at || (a.kind === "scene" ? -1 : 1));
}

// A fingerprint of every line up to a cutoff. A recap keeps the fingerprint
// of what it covers; if the DM edits or deletes one of those lines, the
// fingerprint no longer matches and the recap is dropped and rebuilt.
export function storySignature(scenes, actions, uptoAt) {
  let hash = 2166136261;
  for (const entry of storyEntries(scenes, actions)) {
    if (entry.at > uptoAt) break;
    for (const char of entry.at + "\u0000" + entryLine(entry) + "\u0001") hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  }
  return hash.toString(36);
}
export const recapValid = (scenes, actions, recap) => Boolean(recap?.text) && Number.isFinite(Number(recap.uptoAt))
  && recap.sig === storySignature(scenes, actions, Number(recap.uptoAt));

// What happened after the recap: scenes and actions newer than its cutoff.
// A recap that no longer matches the story (an edit or deletion) is ignored.
export function sinceRecap(scenes, actions, recap) {
  if (!recapValid(scenes, actions, recap)) return { scenes, actions, recap: null };
  const cut = Number(recap.uptoAt);
  return {
    scenes: scenes.filter(scene => Number(scene.created ?? 0) > cut),
    actions: actions.filter(action => Number(action.created ?? 0) > cut),
    recap
  };
}

function recapBlock(recap) {
  return { type: "text", text: "THIS SESSION, EARLIER (a recap of the first part of tonight, written from the transcript):\n" + String(recap.text).trim(), cache_control: { type: "ephemeral", ttl: "1h" } };
}

// Whether the recap is due, and if so which lines to fold in and the new cutoff.
export function recapPlan(scenes, actions, recap = null) {
  const after = sinceRecap(scenes, actions, recap);
  const entries = storyEntries(after.scenes, after.actions);
  const size = entries.reduce((total, entry) => total + entryLine(entry).length + 3, 0);
  if (size <= RECAP_TRIGGER) return { due: false };
  let kept = 0;
  let split = entries.length;
  while (split > 0 && kept + entryLine(entries[split - 1]).length + 3 <= RECAP_KEEP) kept += entryLine(entries[--split]).length + 3;
  // Never split two lines that happened in the same moment.
  while (split > 0 && split < entries.length && entries[split].at === entries[split - 1].at) split -= 1;
  const fold = entries.slice(0, split);
  if (!fold.length) return { due: false };
  return { due: true, lines: fold.map(entryLine), uptoAt: fold.at(-1).at };
}

export function recapRequest(apiKey, previous, lines, party = []) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2026-10-21" },
    body: JSON.stringify({
      model: RECAP_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: recapSystem,
      messages: [{ role: "user", content: "THE PARTY: " + party.map(member => member.name).join(", ")
        + "\n\nRECAP SO FAR:\n" + (String(previous ?? "").trim() || "(none yet)")
        + "\n\nNEWEST LINES, oldest first:\n" + lines.map(line => "- " + line).join("\n") }]
    })
  };
}

export async function readRecap(response, onUsage = () => {}) {
  if (!response.ok) throw new AdviceError("Recap failed (" + response.status + ").");
  const message = await response.json();
  onUsage(usageOf(message));
  const text = (message.content ?? []).filter(block => block.type === "text").map(block => block.text).join("").trim();
  if (message.stop_reason !== "end_turn" || !text) throw new AdviceError("Recap failed (" + message.stop_reason + ").");
  return text.slice(0, 6000);
}

// Brings the recap up to date when it's due. Returns { recap, changed }; on
// any failure the old recap comes back unchanged.
// A recap the story no longer matches is rebuilt from the start (and, if that
// isn't due or fails, none is used).
export async function refreshRecap(apiKey, scenes, actions, recap = null, party = [], onUsage = () => {}, fetchImpl = fetch) {
  const current = recapValid(scenes, actions, recap) ? recap : null;
  const plan = recapPlan(scenes, actions, current);
  if (!plan.due) return { recap: current, changed: false };
  try {
    const text = await readRecap(await fetchImpl(CLAUDE_URL, { ...recapRequest(apiKey, current?.text, plan.lines, party), signal: AbortSignal.timeout(30000) }), onUsage);
    return { recap: { text, uptoAt: plan.uptoAt, sig: storySignature(scenes, actions, plan.uptoAt) }, changed: true };
  } catch (error) {
    console.error("recap", error?.message ?? error);
    return { recap: current, changed: false };
  }
}
