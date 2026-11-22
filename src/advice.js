// Claude suggestions: the prompt, request body, and answer parsing. Shared by
// the local server (src/worker.js) and the Supabase edge function
// (supabase/functions/dnd-advise/advice.js is a byte-for-byte copy; npm test
// checks they match). Raw HTTP rather than the SDK: the project installs no
// dependencies and both runtimes ship single files.

export const CLAUDE_MODEL = "claude-opus-5-5";
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
  "Only recommend abilities listed under READY on the character's sheet, or ordinary actions any adventurer could attempt (move, hide, help, talk, search, shove). Never recommend anything listed under UNCONFIRMED; if one looks relevant, put it in ask_dm as something to confirm with the DM.",
  "Do not invent spell slots, uses, items, or rules. When an ability has a cost or limit, mention checking it. Never state outcomes, damage, or success; the DM decides those.",
  "situation is a 2-4 word label such as \"Combat\" or \"Talking to the bartender\". ask_dm is one question the player could ask the DM, ideally one that would clarify the bigger picture or the immediate options.",
  "The DM updates are speech-to-text transcripts and may contain recognition errors or fragments; read them charitably and in context.",
  "Player actions are what the players said their characters are doing; the DM has not necessarily resolved them. Build on what this character already declared instead of repeating it, and account for what the others are doing.",
  "The campaign history is the group's own notes and may mention stats or abilities; those never count as available unless the character's sheet lists them as READY."
].join("\n");

export function sheetText(character) {
  const lines = String(character.moves ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  const body = line => line.includes("|") ? line.slice(line.indexOf("|") + 1).trim() : line;
  const ready = lines.filter(line => !/^check\s*\|/i.test(line)).map(line => "- " + body(line));
  const check = lines.filter(line => /^check\s*\|/i.test(line)).map(line => "- " + body(line));
  return [
    "Character: " + character.name + (character.role ? " (" + character.role + ")" : ""),
    "READY abilities:\n" + (ready.join("\n") || "- none recorded"),
    "UNCONFIRMED abilities (do not recommend):\n" + (check.join("\n") || "- none")
  ].join("\n\n");
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
export function claudeRequest(apiKey, character, scenes, history = "", actions = [], question = "") {
  const session = sessionWindow(scenes);
  const latest = session.at(-1);
  const earlier = session.slice(0, -1);
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
