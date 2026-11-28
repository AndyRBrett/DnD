import { recommend, coachingPrompt, partyPrompt, characterAbilities, withoutSpent } from "./scene-options.js";
// A practice table is marked by its opening update (no database change), and
// the device that started it also remembers it, in case 30+ updates push the
// opening line out of view.
const PRACTICE_MARK = "PRACTICE TABLE";
import { backend, storage } from "./backend.js";
import { organizeSheet, basics, conditions, sectionMeaning, lookupRule } from "./rules.js";
import { roll, poolExpression, rollableFrom, rollModeFrom, parse as parseDice, critExpression, keepD20, tableRoll, tablePrompt } from "./dice.js";
import { createDie, percentileLabels } from "./dice3d.js";
import { templates as enemyTemplates, createEnemies, parseSaves, formatSaves, enemySave, saveBonus, applyHp, status as enemyStatus, standing, rollInitiative, publicEnemies, combatOrder, nextTurn, upNext, isSittingOut, sittingOut, maxHpFromSheet, changePartyHp, partyHpStatus, combatStats, acRange, concentrationDc, attackOutcome, hitReportText, hitHandledText, parseHitReport, attackAskText, parseAttackAsk, attackVerdictText, parseTypedToHit, chronicleLine, attacksFromNotes, riderText, deathSave, buildAttack, abilityMods, attackBreakdown, slotKey, resourceLeft, spendResource, rest as restResources, hitDice, HIT_DICE, castableLevels, upcastAttack, spentAbilities, pickEncounter, scenePassages, boardMoment, SKILLS, ABILITY_FULL, rollAskText, parseRollAsk, rollAskLabel, rollAskVerdict, rollAskBonus, rollAskResults, enemyTier, TIERS, enemyRoutine, swingCount, sceneAudience, addressScene, sceneFor, sceneIsFor } from "./encounter.js";
import { party as starterParty, recap as starterRecap, sheets } from "./campaign.js";
// Everyone can attack from hiding: advantage for that one attack (and while
// Invisible it's on by itself).
const HIDDEN_OPTION = { name: "Hidden or unseen", mode: "advantage", lasts: "attack", hidden: true,
  note: "Attacking from hiding, unseen, or Invisible: advantage. The attack gives your position away." };
for (const sheet of Object.values(sheets)) {
  if (sheet?.attacks?.length && !(sheet.attackOptions ?? []).some(option => option.hidden)) sheet.attackOptions = [...(sheet.attackOptions ?? []), HIDDEN_OPTION];
}

const $ = id => document.getElementById(id);
// Longest player action (migration 0016: was 300).
const ACTION_MAX = 1000;
// Replaces a container's contents only when the new markup differs from what
// was last drawn there. The 1.5-second poll redraws often; skipping identical
// redraws keeps taps from landing on a button that was just swapped out, and
// keeps what the DM is reading (an enemy's last roll) and typing in place.
function renderInto(container, nodes) {
  const html = nodes.map(node => node.outerHTML ?? node.textContent).join("");
  if (container.renderedHtml === html && container.childNodes.length) return false;
  container.renderedHtml = html;
  container.replaceChildren(...nodes);
  return true;
}
const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
const room = new URLSearchParams(location.search).get("room");
let isHost = false;
let state;
let editId;
let syncing = false;
let listening = false;
let recognition;
let restartTimer;
let publishTimer;
let publishDeadline;
let writing = false;
let pendingSpeech = "";
let lastFinal = 0;
let ended = false;

function list(id, values) {
  $(id).replaceChildren(...values.map(value => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  }));
}

function selectedCharacter() {
  return state?.party[Number($("character").value)];
}

// ── Suggestions → the Attack card. A suggestion that names something on the
// card (Reckless Attack, Hunter's Mark, Trip Attack, Greataxe) gets a button
// that opens the Attack card with that attack picked and that option ticked,
// so "use Reckless" isn't a hunt for the right checkbox. ──
// Curly and straight apostrophes match: the roster says Hunter’s Mark, the
// Attack card Hunter's Mark.
const matchable = text => String(text).toLowerCase().replace(/[‘’ʼ]/g, "'");
const baseName = name => matchable(name.replace(/\s*\(.*\)\s*$/, "").replace(/\s+(shot|attack)$/i, "").trim());
function cardLink(text, index) {
  const sheet = sheets[partyName(index)];
  if (!sheet || isHost) return null;
  // Only what the suggestion is about (its name, before "—"), never its
  // description: "no Rage damage, Reckless" must not link Reckless.
  const titled = String(text).match(/^(?:From your sheet, if available|Also on your sheet):\s*(.+?)\s+—/);
  const words = matchable(titled ? titled[1] : String(text));
  let option = null;
  let choice = null;
  for (const entry of sheet.attackOptions ?? []) {
    if (entry.rage || entry.hidden) continue; // Raging follows the rage itself
    const picked = (entry.choices ?? []).find(([name]) => words.includes(matchable(name)));
    if (picked) { option = entry; choice = picked[0]; break; }
    const base = baseName(entry.name);
    if (!option && base.length > 3 && new RegExp("\\b" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(words)) option = entry;
  }
  const attacks = attacksFor(index);
  // "Razor Shuriken (Q)" is named "Razor Shuriken" in a suggestion.
  let attackIndex = attacks.findIndex(attack => words.includes(matchable(attack.name)) || (baseName(attack.name).length > 3 && words.includes(baseName(attack.name))));
  // A feature on the "This turn" strip (Living Shadow, Action Surge, Rage).
  const features = (sheet.resources ?? []).flatMap(resource => [resource.name, ...(resource.covers ?? []).map(entry => Array.isArray(entry) ? entry[0] : entry)]);
  const feature = features.find(name => name.length > 3 && words.includes(matchable(name))) ?? null;
  if (!option && attackIndex < 0 && !feature) return null;
  const label = [feature ?? "", attackIndex >= 0 ? attacks[attackIndex].name : "", option ? (choice ?? option.name.replace(/\s*\(.*\)\s*$/, "")) : ""].filter(Boolean).join(" + ");
  return { option, choice, attackIndex, feature, label };
}
function cardLinkButton(link, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quiet card-link";
  button.textContent = "⚔️ Set up on the Attack card: " + link.label;
  button.onclick = () => useOnCard(link, index);
  return button;
}
function useOnCard(link, index) {
  if (Number($("character").value) !== index || !state?.combat) return;
  showTab("combat");
  // Which attack, decided now: a melee-only option (Reckless) needs a melee
  // weapon picked, whatever was selected when the suggestion was drawn.
  const attacks = attacksFor(index);
  let attackIndex = link.attackIndex;
  if (attackIndex < 0 && link.option?.melee && (attacks[attackFlow.index]?.ranged || attacks[attackFlow.index]?.save)) {
    attackIndex = attacks.findIndex(attack => !attack.ranged && !attack.save);
  }
  if (attackIndex >= 0 && attackIndex !== attackFlow.index) $("attack-list").children[attackIndex]?.click();
  if (link.option) {
    // Tick the card's own checkbox, so whatever it does (spend a slot for
    // Hunter's Mark, start concentrating) happens the usual way.
    const box = $("attack-options").querySelector('label[data-option="' + CSS.escape(link.option.name) + '"] input');
    if (box && !box.checked && !box.disabled) box.click();
    if (link.choice) {
      const pick = $("attack-options").parentElement.querySelector('select[data-option="' + CSS.escape(link.option.name) + '"]');
      queueMicrotask(() => {
        const live = $("attack-options").parentElement.querySelector('select[data-option="' + CSS.escape(link.option.name) + '"]') ?? pick;
        if (live && [...live.options].some(entry => entry.value === link.choice)) { live.value = link.choice; live.dispatchEvent(new Event("change")); }
      });
    }
  }
  // A strip feature isn't spent for them: point at its button instead.
  if (link.feature) {
    const button = [...$("turn-features").querySelectorAll("button, .turn-feature")].find(item => matchable(item.textContent).includes(matchable(link.feature)));
    button?.classList.add("is-suggested");
    setTimeout(() => button?.classList.remove("is-suggested"), 6000);
  }
  scrollToCard($("attack-card"));
}

// Scroll a card so its top sits just under the pinned header and character
// bar (scrollIntoView's "start" tucks it underneath them).
// With a duration (ms), it glides there at that pace instead of the browser's
// quick smooth scroll, so a player can follow where they're being taken.
function scrollToCard(element, duration = 0) {
  if (!element) return;
  requestAnimationFrame(() => {
    const covered = [document.querySelector(".hdr"), $("char-bar")]
      .filter(bar => bar && !bar.hidden && bar.offsetParent !== null)
      .reduce((sum, bar) => sum + bar.getBoundingClientRect().height, 0);
    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - covered - 8);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!duration || still) { window.scrollTo({ top, behavior: still ? "auto" : "smooth" }); return; }
    const from = window.scrollY;
    const start = performance.now();
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      window.scrollTo(0, from + (top - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const TURN_CARD_GLIDE = 1400; // ms: the slow ride back up to End my turn

function showOptions() {
  const character = selectedCharacter();
  if (!character) return;
  storage.set("dnd-character", $("character").value);
  $("character-role").textContent = character.role;
  drawConditions();
  drawConcentration(); // a save waiting for this character shows up now
  if (state) drawRollAsks(); // and a roll the DM asked of them
  const rolls = sheets[character.name]?.rolls ?? [];
  $("quick-rolls").hidden = !rolls.length;
  $("quick-roll-chips").replaceChildren(...rollTiles(rolls));
  $("combat-rolls").replaceChildren(...rollTiles(rolls));
  $("combat-rolls-card").hidden = !rolls.length || isHost;
  drawCombat();
  updateChips();
  $("action-label").textContent = "What is " + character.name + " doing?";
  // On a shared phone, say whose post this is right on the button.
  $("action-submit").textContent = "Post as " + character.name.replace(/^The /, "");
  // A split party: only the updates this character heard (the DM sees all).
  const recent = isHost ? state.scenes : state.scenes.filter(scene => sceneIsFor(scene, character.name));
  const advice = recommend(withoutSpent(character, spentFor(Number($("character").value))), recent);
  const latest = recent.at(-1);
  $("situation").textContent = advice.situation + (latest ? " · Updated " +
    new Date(latest.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
  const line = latest ? sceneText(latest) : "";
  $("responding-to").textContent = line ? "Responding to: “" + (line.length > 140 ? line.slice(0, 140) + "…" : line) + "”" : "";
  showAdvice(advice, character);
}

function rollTiles(rolls) {
  return rolls.map(([label, value]) => {
    const expression = rollableFrom(value);
    const tile = document.createElement(expression ? "button" : "div");
    tile.className = "stat" + (value.endsWith("*") ? " is-unconfirmed" : "") + (expression ? " is-rollable" : "");
    if (expression) {
      tile.type = "button";
      tile.setAttribute("aria-label", "Roll " + label + " (" + expression + ")");
      tile.onclick = () => openDice(expression, label, null, rollModeFrom(value));
    }
    const number = document.createElement("strong");
    number.textContent = value.replace(/\*$/, "");
    const name = document.createElement("span");
    name.textContent = label;
    tile.append(number, name);
    return tile;
  });
}

function showAdvice(advice, character) {
  const index = Number($("character").value);
  $("options").replaceChildren(...advice.options.map(text => {
    const item = document.createElement("li");
    item.textContent = text;
    // Only a suggestion named after something on the sheet ("From your
    // sheet: Hunter's Mark — …") gets a card link; general advice doesn't.
    const link = /^(?:From your sheet, if available|Also on your sheet):/.test(text) ? cardLink(text, index) : null;
    if (link) item.append(cardLinkButton(link, index));
    return item;
  }));
  $("ask-dm").textContent = advice.question;
  drawSheet(character);
  resetClaude();
}

let claudeFor = "";
function resetClaude() {
  const key = $("character").value + ":" + (state?.scenes.at(-1)?.id ?? "");
  $("claude").hidden = !state?.ai || ended;
  $("claude-off").hidden = !$("claude").hidden;
  if (key === claudeFor) return;
  claudeFor = "";
  $("claude-answer").hidden = true;
  $("claude-status").textContent = "";
}

async function askClaude(question = "") {
  const index = $("character").value;
  const sceneId = state?.scenes.at(-1)?.id;
  const buttons = [$("ask-claude"), $("question-form").querySelector("button")];
  for (const button of buttons) button.disabled = true;
  $("claude-status").textContent = (question ? "Claude is thinking about your question" : "Claude is reading the whole story")
    + " (about a minute). Keep playing: the answer shows up here.";
  try {
    const advice = await backend.advise(room, Number(index), question, spentFor(Number(index)), tableContext(Number(index)));
    // The answer cost a Claude call: show it even if the scene moved on or
    // someone switched characters while it was being written, and say so.
    const switched = $("character").value !== index;
    const movedOn = !question && state.scenes.at(-1)?.id !== sceneId;
    claudeFor = $("character").value + ":" + (state.scenes.at(-1)?.id ?? ""); // stays until the next update
    $("claude-reply").hidden = !advice.answer;
    $("claude-asked").textContent = question ? "You asked: “" + question + "”" : "";
    $("claude-reply").querySelector("span").textContent = advice.answer ?? "";
    $("claude-situation").textContent = "Claude · " + advice.situation;
    $("claude-big-picture").hidden = !advice.bigPicture;
    $("claude-big-picture").querySelector("span").textContent = advice.bigPicture ?? "";
    $("claude-options").replaceChildren(...advice.options.map(option => claudeOption(option, Number(index))));
    $("claude-ask").textContent = advice.question;
    $("claude-answer").hidden = false;
    $("claude-status").textContent = switched ? "This answer is for " + state.party[Number(index)]?.name + "."
      : movedOn ? "Written for the update before the latest one; ask again for a fresh read." : "";
    if (question) $("question-text").value = "";
    if (currentTab === "moves") scrollToCard($("claude-answer"));
  } catch (error) {
    $("claude-status").textContent = error.message || "Claude could not answer. Try again.";
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

// One Claude option: what to do, why, how it works, and an editable line to
// post straight into the story.
// After "Add to story": on your own turn in a fight, the next step is the
// Combat tab (with the suggestion set up on the Attack card when it names
// something there); otherwise the Scene, at your post, where the DM answers.
function goAfterDeclare(option, characterIndex) {
  if (Number($("character").value) !== characterIndex) return;
  const combat = state?.combat;
  if (combat && combat.turn === "pc:" + characterIndex) {
    const link = cardLink(option.action ?? "", characterIndex);
    if (link) useOnCard(link, characterIndex);
    else { showTab("combat"); scrollToCard($("combat-head"), TURN_CARD_GLIDE); }
    return;
  }
  showTab("scene");
  const newest = $("since-actions").firstElementChild;
  (newest && !$("since-wrap").hidden ? newest : $("since-wrap")).scrollIntoView({ behavior: "smooth", block: "center" });
  $("notice").textContent = "Added to the story. The DM's reply shows up here.";
}
function claudeOption(option, characterIndex) {
  const item = document.createElement("li");
  const action = document.createElement("span");
  action.textContent = option.action;
  const why = document.createElement("small");
  why.textContent = option.why;
  item.append(action, why);
  if (option.explain) {
    const explain = document.createElement("p");
    explain.className = "how-it-works";
    const label = document.createElement("strong");
    label.textContent = "How it works: ";
    explain.append(label, option.explain);
    item.append(explain);
  }
  const link = cardLink(option.action ?? "", characterIndex); // the action itself, not its explanation
  if (link) item.append(cardLinkButton(link, characterIndex));
  if (option.declare && backend.postAction && Array.isArray(state?.actions)) {
    const form = document.createElement("form");
    form.className = "declare";
    const field = document.createElement("textarea");
    field.rows = 2;
    field.maxLength = ACTION_MAX;
    field.value = option.declare;
    field.setAttribute("aria-label", "Edit this action before adding it to the story");
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "secondary";
    button.textContent = "Add to story";
    form.append(field, button);
    form.onsubmit = async event => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text) return;
      button.disabled = true;
      try {
        await backend.postAction(room, characterIndex, text);
        button.textContent = "Added ✓";
        await sync();
        goAfterDeclare(option, characterIndex);
      } catch (error) {
        button.disabled = false;
        $("claude-status").textContent = error.message;
      }
    };
    item.append(form);
  }
  return item;
}

$("question-form").onsubmit = event => {
  event.preventDefault();
  const question = $("question-text").value.trim();
  if (question) askClaude(question);
};

// ── Character sheet: stats, then Attacks / Spells by level / Features /
// Skills / Table moves, each entry tappable for the built-in rule. No AI call.
function sheetEntry(entry) {
  const item = document.createElement("details");
  item.className = "sheet-entry";
  const summary = document.createElement("summary");
  const name = document.createElement("span");
  name.className = "entry-name";
  name.textContent = entry.name;
  summary.append(name);
  if (entry.rule?.meta) {
    const meta = document.createElement("small");
    meta.textContent = entry.rule.meta;
    summary.append(meta);
  }
  item.append(summary);
  const rule = document.createElement("p");
  rule.textContent = entry.rule?.text ?? "A move specific to your table. Its details are in the note below; ask the DM about limits.";
  item.append(rule);
  for (const note of entry.notes) {
    const tableNote = document.createElement("p");
    tableNote.className = "table-note";
    const label = document.createElement("strong");
    label.textContent = "At your table: ";
    tableNote.append(label, note);
    item.append(tableNote);
  }
  return item;
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const signed = value => (value >= 0 ? "+" : "") + value;

// The full sheet (ability scores, combat stats, saves, skills, spellcasting,
// items, routine, open questions) for characters that have one in campaign.js.
function drawFullSheet(character) {
  const full = sheets[character.name];
  $("sheet-full").hidden = !full;
  if (!full) return $("sheet-full").replaceChildren();
  const parts = [element("p", "fineprint", full.note)];

  const scores = element("div", "ability-grid");
  for (const [label, score, modifier] of full.abilities) {
    const box = element("div", "ability");
    box.append(element("span", "ability-label", label), element("strong", "", signed(modifier)), element("span", "ability-score", String(score)));
    scores.append(box);
  }
  parts.push(scores);

  const pairList = (title, pairs) => {
    const list = element("dl", "sheet-pairs");
    for (const [label, value] of pairs) {
      const dd = element("dd", "", value);
      const meaning = sectionMeaning(label);
      if (meaning) dd.append(element("small", "pair-meaning", meaning));
      list.append(element("dt", "", label), dd);
    }
    const wrap = element("section", "sheet-section");
    wrap.append(element("h3", "", title), list);
    return wrap;
  };
  parts.push(pairList("Combat", full.combat));

  const saves = element("section", "sheet-section");
  const saveChips = element("div", "chips saves");
  for (const [label, value, status] of full.saves) {
    const chip = element("span", status ? "is-proficient" : "", label + " " + value + (status ? " ●" : ""));
    if (status) chip.title = status;
    saveChips.append(chip);
  }
  saves.append(element("h3", "", "Saving throws (● proficient)"), saveChips);
  parts.push(saves);

  const skills = element("details", "sheet-section sheet-skills");
  skills.append(element("summary", "", "Skills (all 18)"));
  const table = element("ul", "skill-list");
  for (const [name, ability, value, status] of full.skills) {
    const row = element("li", status === "proficient" ? "is-proficient" : "");
    row.append(element("span", "", name + " "), element("small", "", ability), element("strong", "", value));
    if (status) row.append(element("em", "", status));
    // Tap a skill to roll it (and share it): "roll Deception" is one tap.
    if (rollableFrom(value)) {
      row.classList.add("is-rollable");
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.title = "Roll " + name;
      row.onclick = () => rollSkill(name, value);
      row.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); rollSkill(name, value); } };
    }
    table.append(row);
  }
  skills.append(table);
  parts.push(skills);

  if (full.spellcasting) parts.push(pairList("Spellcasting", full.spellcasting));
  if (full.items?.length) {
    const items = element("section", "sheet-section");
    items.append(element("h3", "", "Magic items"));
    for (const [name, text] of full.items) {
      const item = element("p", "sheet-item");
      item.append(element("strong", "", name), element("span", "", text));
      items.append(item);
    }
    parts.push(items);
  }
  for (const [title, lines] of [...(full.lists ?? []), ["First-turn attack routine", full.routine], ["Table defaults (the DM can change these)", full.defaults], ["Identity", full.identity?.map(([label, value]) => label + ": " + value)]]) {
    if (!lines?.length) continue;
    const box = element("details", "sheet-section");
    box.append(element("summary", "", title));
    const list = element(title.startsWith("Open") ? "ol" : "ul", "sheet-lines");
    for (const line of lines) list.append(element("li", "", line));
    box.append(list);
    parts.push(box);
  }
  $("sheet-full").replaceChildren(...parts);
}

function drawSheet(character) {
  drawFullSheet(character);
  const sheet = organizeSheet(character);
  $("sheet-stats").replaceChildren(...sheet.stats.map(stat => {
    const chip = document.createElement("span");
    chip.textContent = stat;
    return chip;
  }));
  $("sheet-sections").replaceChildren(...sheet.sections.map(section => {
    const wrap = document.createElement("section");
    wrap.className = "sheet-section";
    const title = document.createElement("h3");
    title.textContent = section.title;
    wrap.append(title);
    const meaning = sectionMeaning(section.title);
    if (meaning) wrap.append(Object.assign(document.createElement("p"), { className: "section-meaning", textContent: meaning }));
    wrap.append(...section.entries.map(sheetEntry));
    return wrap;
  }));
  $("sheet-confirm").hidden = !sheet.confirm.length;
  $("sheet-confirm-list").replaceChildren(...sheet.confirm.map(sheetEntry));
  $("character-empty").hidden = sheet.sections.length > 0 || sheet.confirm.length > 0;
}

$("basics-list").replaceChildren(...basics.flatMap(([term, text]) => {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = text;
  return [dt, dd];
}));

// ── Character chips (the select stays as the source of truth) ──
function updateChips() {
  for (const chip of $("char-chips").children) {
    const active = chip.dataset.index === $("character").value;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  }
}
function drawChips() {
  $("char-chips").replaceChildren(...state.party.map(({ name }, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.index = String(index);
    chip.textContent = name.replace(/^The /, "");
    chip.onclick = () => {
      $("character").value = String(index);
      $("character").dispatchEvent(new Event("change"));
    };
    return chip;
  }));
  updateChips();
}

// ── Tabs ──
const TAB_KEY = "dnd-tab";
let currentTab = "scene";
function showTab(name) {
  if (name === "claude") name = "moves"; // Claude now lives on the Moves tab
  if (!$("tab-" + name) || $("tab-" + name).hidden) name = "scene";
  if (state && (name === "sheet" || name === "combat")) queueMicrotask(drawHp);
  currentTab = name;
  for (const panel of document.querySelectorAll(".tab-panel")) panel.hidden = panel.dataset.panel !== name;
  for (const button of document.querySelectorAll(".tab-btn")) {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  }
  if (name === "scene") $("tab-scene").classList.remove("has-news");
  $("char-bar").hidden = name === "dm";
  storage.set(TAB_KEY, name);
  window.scrollTo({ top: 0 });
}
for (const button of document.querySelectorAll(".tab-btn")) button.onclick = () => showTab(button.dataset.tab);

function drawRoster() {
  const stored = $("character").value || storage.get("dnd-character");
  $("character").replaceChildren(...state.party.map(({name}, index) => new Option(name, index)));
  if (state.party[Number(stored)]) $("character").value = stored ?? "0";
  drawChips();
  drawPartyActions();
  if (!isHost) return;
  $("roster").replaceChildren(...state.party.map(({name, role, moves}, index) => {
    const box = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = name;
    box.append(legend);
    for (const [key, value, label, limit] of [
      ["name", name, "Name", 70],
      ["role", role, "Class and subclass", 90],
      ["moves", moves, "Available abilities", 5000]
    ]) {
      const wrapper = document.createElement("label");
      const field = document.createElement(key === "moves" ? "textarea" : "input");
      wrapper.append(label, field);
      field.name = key + index;
      field.maxLength = limit;
      field.value = value;
      field.required = key === "name";
      box.append(wrapper);
    }
    return box;
  }));
  // A table started before a character joined the campaign (JPeso) can add
  // them from the roster, up to eight.
  const here = new Set(state.party.map(member => member.name));
  const missing = starterParty.filter(member => !here.has(member.name));
  if (missing.length && state.party.length < 8) {
    const row = document.createElement("div");
    row.className = "action-row roster-add";
    for (const member of missing) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "ghost";
      add.textContent = "Add " + member.name + " to this table";
      add.onclick = async () => {
        add.disabled = true;
        try {
          await backend.saveParty(room, [...state.party.map(({ name, role, moves }) => ({ name, role, moves })), { name: member.name, role: member.role, moves: member.moves }]);
          $("notice").textContent = member.name + " joined the table.";
          await sync();
        } catch (error) {
          add.disabled = false;
          $("notice").textContent = /five characters/i.test(error.message) ? "Adding a sixth character needs the latest database update (migration 0019)." : error.message;
        }
      };
      row.append(add);
    }
    $("roster").append(row);
  }
}

async function sync() {
  if (!room || syncing || ended || ($("table").hidden && !boardMode)) return;
  syncing = true;
  try {
    const fresh = await backend.room(room);
    applyRoom(fresh);
    cacheRoom(fresh);
  } catch (error) {
    // The server says the table is gone (ended, or idle for 3 days). It can
    // answer with 404 or 400 depending on the error code, so read the message.
    if (error.status === 404 || /ended or expired/i.test(error.message)) {
      ended = true;
      stopMic();
      $("notice").textContent = "This table has ended. Tables close after 3 days without any activity. The DM can start a new one from the home screen; a campaign's HP, spell slots, and story carry over.";
      $("scene").textContent = "Session ended.";
      $("history").replaceChildren();
      $("action-form").hidden = true;
      $("options").replaceChildren();
      for (const id of ["situation", "ask-dm"]) $(id).textContent = "";
      $("coach-controls").hidden = true;
      $("claude").hidden = true;
      $("character-library").hidden = true;
      $("host").hidden = true;
      $("party-editor").hidden = true;
      $("close-wrap").hidden = true;
      $("copy").hidden = true;
      $("tv").hidden = true;
      $("edit").hidden = true;
      $("connection").textContent = "ENDED";
      drawBoard();
    } else if (error.status === 401) {
      clearInterval(poll);
      poll = undefined;
      stopMic();
      showLobby("Sign in to join the table.");
    } else {
      $("connection").textContent = "RECONNECTING";
    }
  } finally {
    syncing = false;
  }
}

// Draws the table from a room snapshot: the server's answer, or (cached) the
// copy saved on this phone, shown at once on a reload while the first request
// is still out. A cached snapshot never triggers actions (turn advancing).
function applyRoom(fresh, { cached = false } = {}) {
  // The TV board only shows the table: even signed in as the DM it never
  // acts as host (no encounter publishing, no automatic turn advancing).
  const asHost = Boolean(fresh.isHost) && !boardMode;
  const hostChanged = asHost !== isHost;
  const rosterChanged = JSON.stringify(state?.party) !== JSON.stringify(fresh.party);
  const scenesChanged = JSON.stringify(state?.scenes) !== JSON.stringify(fresh.scenes)
    || JSON.stringify(state?.actions) !== JSON.stringify(fresh.actions);
  const previous = state;
  const previousCached = stateCached;
  state = fresh;
  stateCached = cached;
  // Hurt by someone else while concentrating (the DM applied an enemy's hit).
  // Not against a cached snapshot: that damage may be hours old.
  if (previous && !previousCached && !isHost) checkRemoteDamage(previous, fresh);
  if (!cached) concentrationEndsAtZero();
  if (boardMode) queueMicrotask(drawBoard);
  if (JSON.stringify(previous?.combat) !== JSON.stringify(fresh.combat)) combatChanged(previous);
  else if (JSON.stringify(previous?.hp) !== JSON.stringify(fresh.hp) || previous?.hpUnavailable !== fresh.hpUnavailable) drawCombat();
  if (previous && JSON.stringify(previous.resources) !== JSON.stringify(fresh.resources) && !rosterChanged && !scenesChanged) showOptions();
  if (hostChanged) setHost(asHost);
  if (!previous) rememberTable(room);
  if (rosterChanged || hostChanged) drawRoster();
  if (scenesChanged) {
    if (previous && previous.scenes.at(-1)?.id !== state.scenes.at(-1)?.id && myScene()?.id === state.scenes.at(-1)?.id) flashScene();
    renderStory();
  }
  $("action-form").hidden = !backend.postAction || !Array.isArray(state.actions) || ended;
  if ($("party-actions").hidden === (isHost && Boolean(backend.postAction) && Array.isArray(state.actions))) drawPartyActions();
  if (rosterChanged || scenesChanged) showOptions();
  if (scenesChanged && !rosterChanged) drawHitInbox();
  if (scenesChanged && attackFlow.step === "waiting") drawAttack(); // the DM's call on a to-hit roll
  if (!cached) handleTurnEnds(); // also retries one whose publish failed
  if (isPractice()) {
    $("practice-banner").hidden = false;
    setText("table-code", " · " + tableLabel(room).toUpperCase() + " · PRACTICE");
  }
  if (typeof state.historyChars === "number") $("history-size").textContent = "· " + describeSize(state.historyChars);
  setText("connection", cached ? "CATCHING UP" : isHost ? "HOST" : "PLAYER");
  if (!cached) sayHere();
  drawHere();
}
// The latest snapshot, kept on this phone for a fast reload (written only
// when it changed; dropped after the table's 8 idle hours).
const roomCacheKey = () => "dnd-room-cache:" + room;
let stateCached = false;
// Tables close after 3 days idle (dnd_live_room / worker roomAge).
const tableAge = 3 * 24 * 60 * 60 * 1000;
let cachedText = "";
function cacheRoom(fresh) {
  const text = JSON.stringify(fresh);
  if (text === cachedText) return;
  cachedText = text;
  storage.set(roomCacheKey(), JSON.stringify({ at: Date.now(), state: fresh }));
}
function showCachedRoom() {
  if (state) return;
  const saved = readJson(roomCacheKey(), null);
  if (!saved?.state?.party || Date.now() - saved.at > tableAge) return;
  try {
    applyRoom(saved.state, { cached: true });
  } catch (error) {
    // Start over from the server's answer, host controls included: leaving
    // isHost set would stop the live answer from showing the DM tab.
    console.error(error);
    state = undefined;
    setHost(false);
  }
}

function flashScene() {
  if (currentTab !== "scene") $("tab-scene").classList.add("has-news");
  const panel = document.querySelector(".scene-panel");
  panel.classList.remove("fresh");
  void panel.offsetWidth;
  panel.classList.add("fresh");
}

function setDraft(value) {
  $("draft").value = value.slice(0, 1500);
  noteDraftStart();
}
// Player posts that arrive while the DM is writing an update would land under
// "Earlier updates" the moment it's published, unseen. Remember the newest
// post the DM had when this draft started; anything newer stays in Since then
// on the DM's phone, marked, until the next update.
let draftActionMark = null;
const maxActionId = () => Math.max(0, ...(state?.actions ?? []).map(action => Number(action.id) || 0));
const writtenOverKey = () => "dnd-written-over:" + room;
function noteDraftStart() {
  if (!$("draft").value.trim()) draftActionMark = null;
  else if (draftActionMark === null) draftActionMark = maxActionId();
}

function addPendingSpeech() {
  if (!editId && pendingSpeech) {
    const combined = [$("draft").value.trim(), pendingSpeech].filter(Boolean).join(" ");
    setDraft(combined);
    pendingSpeech = combined.slice(1500).trim();
  }
}

function clearPublishTimers() {
  clearTimeout(publishTimer);
  clearTimeout(publishDeadline);
  publishDeadline = undefined;
}

// Phones finalize speech on short pauses, which published fragments like
// "The". Wait for a real pause, hold drafts under five words until the DM has
// been quiet for a while, and cap continuous speech at one update every ~9 s.
function queuePublish(delay) {
  clearTimeout(publishTimer);
  if ($("auto").checked && !editId && !ended && !sceneTo()) {
    const words = $("draft").value.trim().split(/\s+/).filter(Boolean).length;
    const short = words < 5;
    publishTimer = setTimeout(() => publish(true), short ? Math.max(delay, 7000) : delay);
    if (!short) publishDeadline ??= setTimeout(() => publish(true), 9000);
  }
}

async function publish(automatic = false) {
  if (writing || ended || (automatic && (!$("auto").checked || editId))) return;
  // Speech never goes out privately on its own: with To set to part of the
  // party, the transcript waits in the draft for the DM's Publish update.
  if (automatic && sceneTo()) { $("manual-controls").open = true; return; }
  const text = $("draft").value.trim();
  if (!text) {
    if (!automatic) {
      $("manual-controls").open = true;
      $("notice").textContent = "Type the update in the box first, then tap Publish update.";
      $("draft").focus();
    }
    return;
  }
  clearPublishTimers();
  const id = editId;
  // A new update goes to the group picked under To (an edit keeps its own line).
  const to = id ? null : sceneTo();
  const posted = to ? addressScene(text, to) : text;
  if (posted.length > 1500) {
    $("notice").textContent = "Too long with the To line: trim " + (posted.length - 1500) + " characters.";
    return;
  }
  const mark = draftActionMark ?? maxActionId();
  const previousScene = state?.scenes?.at(-1)?.id ?? null; // before a poll can bring in the new one
  writing = true;
  $("publish").disabled = true;
  try {
    await backend.postScene(room, posted, id);
    // Only the update published here counts: the one right after this scene.
    if (!id) storage.set(writtenOverKey(), JSON.stringify({ after: mark, previous: previousScene }));
    draftActionMark = null;
    if ($("draft").value.trim() === text) setDraft("");
    else if (!id && $("draft").value.startsWith(text + " ")) setDraft($("draft").value.slice(text.length + 1));
    editId = undefined;
    $("cancel").hidden = true;
    $("publish").textContent = "Publish update";
    $("notice").textContent = "";
    if (id) restoreDraft();
    if (pendingSpeech) addPendingSpeech();
    await sync();
    if (!editId && $("draft").value.trim() && lastFinal) queuePublish(1200);
  } catch (error) {
    $("manual-controls").open = true;
    $("notice").textContent = "Update still in the draft. " + error.message;
  } finally {
    writing = false;
    $("publish").disabled = false;
  }
}

// Phones lock their screens and stop speech recognition when the browser
// leaves the foreground, so a host on a phone holds a screen wake lock while
// listening and resumes listening when the tab comes back.
let wakeLock;
let resumeOnReturn = false;
async function holdScreen() {
  if (!("wakeLock" in navigator) || document.hidden || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = undefined; });
  } catch {}
}
function releaseScreen() {
  wakeLock?.release().catch(() => {});
  wakeLock = undefined;
}

function stopMic() {
  listening = false;
  clearTimeout(restartTimer);
  try { recognition?.stop(); } catch {}
  releaseScreen();
  $("mic").textContent = "Start listening";
  $("host").classList.remove("listening");
}

function startMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!isSecureContext || !SpeechRecognition) {
    $("mic-status").textContent = "Voice capture needs Chrome (Android or computer) or Safari (iPhone) on an https:// link or localhost. You can still type updates below.";
    $("manual-controls").open = true;
    return;
  }
  clearTimeout(restartTimer);
  listening = true;
  const speech = new SpeechRecognition();
  recognition = speech;
  speech.lang = "en-US";
  speech.interimResults = true;
  speech.continuous = true;
  speech.onstart = () => {
    if (recognition === speech) $("mic-status").textContent = "Listening for the DM…";
  };
  speech.onresult = event => {
    if (recognition !== speech || ended) return;
    const interim = [];
    const final = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      (result.isFinal ? final : interim).push(result[0].transcript.trim());
    }
    if (interim.length) {
      clearTimeout(publishTimer);
      $("mic-status").textContent = "Hearing: " + interim.join(" ");
    }
    if (final.length) {
      if (!interim.length) $("mic-status").textContent = "Listening for the DM…";
      lastFinal = Date.now();
      pendingSpeech = [pendingSpeech, final.join(" ")].filter(Boolean).join(" ").slice(0, 3000);
      addPendingSpeech();
      queuePublish(interim.length ? 3500 : 2500);
    }
  };
  speech.onerror = event => {
    if (recognition !== speech || event.error === "no-speech" || event.error === "aborted") return;
    stopMic();
    $("mic-status").textContent = ["not-allowed", "service-not-allowed"].includes(event.error)
      ? "The browser blocked the mic. Allow microphone access for this site, then tap Start listening."
      : "Mic stopped (" + event.error + "). Check the connection and audio input, then tap Start listening.";
  };
  speech.onend = () => {
    if (recognition !== speech) return;
    if (lastFinal && $("draft").value.trim()) queuePublish(1050);
    if (listening) restartTimer = setTimeout(startMic, 450);
  };
  try {
    speech.start();
    holdScreen();
    $("mic").textContent = "Stop listening";
    $("host").classList.add("listening");
    $("mic-status").textContent = "Opening microphone…";
  } catch {
    stopMic();
    $("mic-status").textContent = "Couldn't open the microphone. Tap Start listening to try again.";
  }
}

$("mic").onclick = () => {
  resumeOnReturn = false;
  if (listening) {
    stopMic();
    $("mic-status").textContent = "Microphone paused.";
  } else startMic();
};
$("auto").onchange = () => {
  if (!$("auto").checked) {
    clearPublishTimers();
    $("manual-controls").open = true;
  }
  else if (lastFinal && $("draft").value.trim()) queuePublish(1000);
};
$("draft").oninput = () => { clearPublishTimers(); noteDraftStart(); };
// The update box stays open or closed the way the DM left it (open by default).
const MANUAL_KEY = "dnd-manual-open";
$("manual-controls").open = storage.get(MANUAL_KEY) !== "0";
$("manual-controls").addEventListener("toggle", () => storage.set(MANUAL_KEY, $("manual-controls").open ? "1" : "0"));
$("publish").onclick = () => publish();
let savedDraft = "";
$("edit").onclick = () => {
  const latest = state?.scenes.at(-1);
  if (!latest) return;
  openStoryEditor($("scene-current"), { kind: "scene", id: latest.id, text: latest.text });
};
function restoreDraft() {
  if (savedDraft) {
    setDraft([savedDraft, $("draft").value].filter(Boolean).join(" "));
    savedDraft = "";
  }
}
$("cancel").onclick = () => {
  editId = undefined;
  setDraft("");
  restoreDraft();
  addPendingSpeech();
  $("cancel").hidden = true;
  $("publish").textContent = "Publish update";
};
$("character").onchange = () => { showOptions(); sayHere(); if (state && !isHost) renderStory(); }; // a split party: each character has its own scene
$("ask-claude").onclick = () => askClaude();
async function copyForChat(wholeParty) {
  const character = selectedCharacter();
  if (!character || ended) return;
  const me = withoutSpent(character, spentFor(Number($("character").value)));
  let prompt = coachingPrompt(me, state.scenes);
  let partial = false;
  if (wholeParty) {
    // The room read keeps only the latest updates: fetch the whole session.
    const log = backend.sessionLog ? await backend.sessionLog(room).catch(() => null) : null;
    partial = !log;
    prompt = partyPrompt(me, state.party, log?.scenes ?? state.scenes, log?.actions ?? state.actions ?? [], { partial });
  }
  try {
    await navigator.clipboard.writeText(prompt);
    $("coach-status").textContent = (wholeParty ? "Copied the scene and the whole party" + (partial ? " (latest updates only)." : ".") : "Copied.")
      + " Paste into your D&D chat for a deeper answer.";
  } catch {
    window.prompt("Copy this prompt into your D&D chat", prompt);
  }
}
$("copy-coach").onclick = () => copyForChat(false);
$("copy-party").onclick = () => copyForChat(true);
$("copy").onclick = async () => {
  const shareLink = async href => {
    if (!navigator.share || !matchMedia("(pointer: coarse)").matches) return false;
    try {
      await navigator.share({ title: "D&D Table Live", text: "Join the table and pick your character:", url: href });
    } catch (error) {
      if (error.name !== "AbortError") return false;
    }
    return true;
  };
  const link = new URL("?room=" + room, location.href);
  if (["localhost", "127.0.0.1"].includes(link.hostname)) {
    try {
      const { origin } = await fetch("/api/local-player-origin").then(response => response.json());
      if (origin) {
        const player = new URL(origin);
        link.host = player.host;
      }
    } catch {}
  }
  if (await shareLink(link.href)) return;
  try {
    await navigator.clipboard.writeText(link.href);
    $("notice").textContent = "Player link copied. Send it to the table.";
  } catch {
    window.prompt("Copy this player link", link.href);
  }
};
$("party-form").onsubmit = async event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.submitter;
  button.disabled = true;
  try {
    // Every character on the form (one to eight), not a fixed five.
    const count = [...data.keys()].filter(key => /^name\d+$/.test(key)).length;
    const party = Array.from({length: count}, (_, index) => Object.fromEntries(
      ["name", "role", "moves"].map(key => [key, data.get(key + index)])
    ));
    // The full sheet, HP, and resources all follow the name: say so before a
    // rename quietly drops them.
    const renamed = party.map((entry, index) => [state.party[index]?.name, String(entry.name ?? "").trim()])
      .filter(([before, after]) => before && after && before !== after && (sheets[before] || hpRecord(state.party.findIndex(character => character.name === before)) || state.resources?.[before]));
    if (renamed.length && !window.confirm(renamed.map(([before, after]) => before + " → " + after).join("\n")
      + "\n\nThe full sheet, HP, and spell slots are kept by name, so a renamed character starts without them (rename back to get them again). Save anyway?")) return;
    await backend.saveParty(room, party);
    $("notice").textContent = "Character sheets updated.";
    await sync();
  } catch (error) {
    $("notice").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("close").onclick = async () => {
  if (!window.confirm(isPractice() ? "End this practice table? Nothing from it is saved."
    : "End this table for everyone? Its updates and character entries will be deleted.")) return;
  const save = !isPractice() && Boolean(backend.endTable) && state?.scenes.length > 1
    && window.confirm("Add this session's updates to the campaign history first, so Claude remembers them next time?");
  stopMic();
  try {
    if (backend.endTable) await backend.endTable(room, save);
    else await backend.closeRoom(room);
    location.href = "./";
  } catch (error) {
    $("notice").textContent = error.message;
  }
};
// ── Export for ChatGPT: history + sheets + this table, as one text file ──
function sheetForExport(character) {
  const { ready, check } = characterAbilities(character);
  return [
    "### " + character.name + (character.role ? " (" + character.role + ")" : ""),
    "Ready (used in play or confirmed):",
    ...(ready.length ? ready.map(line => "- " + line) : ["- none recorded"]),
    "Check with the DM before using:",
    ...(check.length ? check.map(line => "- " + line) : ["- none"])
  ].join("\n");
}
$("export-chatgpt").onclick = async () => {
  const button = $("export-chatgpt");
  button.disabled = true;
  try {
    const history = $("history-text").value.trim() || await backend.history(room) || "";
    const today = new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
    // The room read keeps only the latest 30 updates: export the whole session.
    const log = backend.sessionLog && !isPractice() ? await backend.sessionLog(room).catch(() => null) : null;
    const updates = isPractice() ? [] : (log?.scenes ?? state.scenes).map(scene =>
      "- [" + new Date(scene.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "] " + scene.text);
    const text = [
      "D&D CAMPAIGN EXPORT: THE ONYX JEWEL (" + today + ", from D&D Table Live)",
      "",
      "How to use this: it's our full campaign record. Read it, then continue helping me as a player in this campaign from where the latest updates leave off. Treat \"Check with the DM\" abilities as unconfirmed, never decide outcomes for the DM, and keep track of names, places, and open threads below.",
      "",
      "== CAMPAIGN HISTORY ==",
      history || "(none saved yet)",
      "",
      "== CURRENT CHARACTER SHEETS ==",
      ...state.party.map(sheetForExport).flatMap(sheet => [sheet, ""]),
      "== THIS TABLE'S UPDATES (newest last; live speech-to-text, may have errors) ==",
      ...(updates.length ? updates : ["(none, or a practice table)"])
    ].join("\n");
    const name = "onyx-jewel-campaign-" + new Date().toISOString().slice(0, 10) + ".txt";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
    $("export-status").textContent = "Downloaded " + name + (copied ? " and copied it" : "") +
      ". In ChatGPT, attach the file (or paste) and say: \"This is our campaign so far, pick up from here.\"";
  } catch (error) {
    $("export-status").textContent = error.message || "Export failed. Try again.";
  } finally {
    button.disabled = false;
  }
};

// ── Campaign history (hosted only) ──
const describeSize = chars => chars ? "about " + Math.max(1, Math.round(chars / 6)).toLocaleString() + " words" : "empty";
let historyLoaded = false;
function countHistory() {
  $("history-count").textContent = describeSize($("history-text").value.trim().length) + " · up to about 65,000 words";
}
$("history-editor").ontoggle = async () => {
  if (!$("history-editor").open || historyLoaded) return;
  try {
    $("history-text").value = await backend.history(room) ?? "";
    $("history-text").placeholder = "Paste session notes, recaps, or a chat export here.";
    historyLoaded = true;
    countHistory();
  } catch (error) {
    $("history-count").textContent = error.message;
  }
};
$("history-text").oninput = countHistory;
$("history-files").onchange = async event => {
  const parts = await Promise.all([...event.target.files].map(async file => "## " + file.name + "\n" + (await file.text()).trim()));
  $("history-text").value = [$("history-text").value.trim(), ...parts].filter(Boolean).join("\n\n");
  event.target.value = "";
  countHistory();
  $("history-count").textContent += " · not saved yet";
};
$("history-save").onclick = async () => {
  const button = $("history-save");
  button.disabled = true;
  try {
    const chars = await backend.saveHistory(room, $("history-text").value);
    $("history-count").textContent = "Saved, " + describeSize(chars) + ". Claude uses it from the next question.";
    $("history-size").textContent = "· " + describeSize(chars);
  } catch (error) {
    $("history-count").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

// ── The story: DM updates plus what players say their characters do ──
// ── The story: current scene, "since then", and earlier updates. The DM can
// edit or delete any of it in place; players can edit their own actions. ──
let storyEditing = null;
// The update this phone shows as its scene: the newest one meant for its
// character (a split party gets "🔒 To: …" updates); the DM sees the newest.
function myScene() {
  if (!state?.scenes?.length) return null;
  if (isHost || boardMode) return state.scenes.at(-1);
  return sceneFor(state.scenes, partyName(Number($("character").value)) ?? "") ?? null;
}
const sceneText = scene => {
  const audience = sceneAudience(scene?.text);
  return audience ? "🔒 To " + audience.names.map(name => name.replace(/^The /, "")).join(", ") + ": " + audience.body : scene?.text ?? "";
};
function renderStory(force = false) {
  drawSceneTo();
  drawRollAsks();
  drawRollAskTool();
  if (storyEditing && !force) return;
  for (const form of $("scene-current").querySelectorAll(".story-editor")) form.remove();
  $("scene-current").classList.remove("is-editing");
  $("scene").hidden = false;
  $("scene").textContent = sceneText(myScene()) || "Waiting for an update.";
  $("edit").hidden = !isHost || ended || !state.scenes.length;
  drawStory();
}
const canEditStory = entry => !ended && (entry.kind === "scene"
  ? isHost
  : Boolean(backend.editAction) && (isHost || entry.mine));
// Long posts in the story lists fold to a preview with "See more"; the
// choice is kept across the table's refreshes.
const STORY_PREVIEW = 280;
const HISTORY_STEP = 10;
let historyPage = HISTORY_STEP; // how many Earlier updates are listed
const openStory = new Set(); // "<kind>:<id>" shown in full
function storyItem(entry) {
  const item = document.createElement("li");
  const key = entry.kind + ":" + entry.id;
  item.dataset.story = key;
  if (entry.kind === "action") item.className = "player-action";
  const text = document.createElement("span");
  text.className = "story-text";
  const full = entry.kind === "action" ? entry.name + ": " + entry.text : entry.text;
  const body = document.createElement("div");
  body.className = "story-body";
  body.append(text);
  item.append(body);
  if (full.length > STORY_PREVIEW + 40) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "link see-more";
    const show = () => {
      const open = openStory.has(key);
      const cut = full.slice(0, STORY_PREVIEW);
      text.textContent = open ? full : cut.slice(0, cut.lastIndexOf(" ") > 200 ? cut.lastIndexOf(" ") : STORY_PREVIEW) + "…";
      more.textContent = open ? "See less" : "See more";
      more.setAttribute("aria-expanded", String(open));
    };
    more.onclick = () => { if (openStory.has(key)) openStory.delete(key); else openStory.add(key); show(); };
    show();
    body.append(more);
  } else {
    text.textContent = full;
  }
  if (canEditStory(entry)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edit-btn";
    button.textContent = "✎";
    button.setAttribute("aria-label", "Edit or delete this");
    button.onclick = () => openStoryEditor(item, entry);
    item.append(button);
  }
  return item;
}
function friendlyStoryError(error) {
  return /could not find the function/i.test(error.message)
    ? "Editing actions needs a one-time database update: run supabase/migrations/0005_dnd_story_edits.sql in the Supabase SQL editor."
    : error.message;
}
function openStoryEditor(container, entry) {
  if (storyEditing) {
    // Switching from another editor: close it, then find this entry again in
    // the redrawn list.
    storyEditing = null;
    renderStory(true);
    if (!container.isConnected) container = document.querySelector('[data-story="' + entry.kind + ":" + entry.id + '"]');
  }
  if (!container?.isConnected) return;
  storyEditing = entry;
  for (const child of container.children) child.hidden = true;
  container.classList.add("is-editing");
  const form = document.createElement("form");
  form.className = "story-editor";
  const area = document.createElement("textarea");
  area.value = entry.text;
  area.rows = entry.kind === "scene" ? 4 : 2;
  area.maxLength = entry.kind === "scene" ? 1500 : ACTION_MAX;
  area.setAttribute("aria-label", entry.kind === "scene" ? "Edit this update" : "Edit " + entry.name + "'s action");
  const row = document.createElement("div");
  row.className = "action-row";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "cta";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "quiet";
  cancel.textContent = "Cancel";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-soft";
  remove.textContent = "Delete";
  row.append(save, cancel, remove);
  const status = document.createElement("p");
  status.className = "fineprint";
  if (entry.kind === "action") {
    const who = document.createElement("p");
    who.className = "eyebrow";
    who.textContent = entry.name.toUpperCase();
    form.append(who);
  }
  form.append(area, row, status);
  container.append(form);
  area.focus();
  const busy = value => { for (const button of [save, cancel, remove]) button.disabled = value; };
  const finish = async () => {
    storyEditing = null;
    await sync();
    renderStory(true);
  };
  cancel.onclick = () => { storyEditing = null; renderStory(true); };
  form.onsubmit = async event => {
    event.preventDefault();
    const text = area.value.trim();
    if (!text) { status.textContent = "Write something, or tap Delete."; return; }
    busy(true);
    status.textContent = "Saving…";
    try {
      if (entry.kind === "scene") await backend.postScene(room, text, entry.id);
      else await backend.editAction(room, entry.id, text);
      await finish();
    } catch (error) {
      status.textContent = friendlyStoryError(error);
      busy(false);
    }
  };
  remove.onclick = async () => {
    if (!confirmTap(remove, entry.kind === "scene" ? "Tap again to delete for everyone" : "Tap again to delete " + entry.name + "'s action")) return;
    busy(true);
    status.textContent = "Deleting…";
    try {
      if (entry.kind === "scene") await backend.deleteScene(room, entry.id);
      else await backend.deleteAction(room, entry.id);
      await finish();
    } catch (error) {
      status.textContent = friendlyStoryError(error);
      busy(false);
    }
  };
}

function drawStory() {
  const latest = myScene();
  const actions = (state.actions ?? []).map(action => ({ ...action, kind: "action" }));
  // DM only: posts that came in while the latest update was being written.
  const over = isHost ? readJson(writtenOverKey(), null) : null;
  const previous = state.scenes[state.scenes.indexOf(latest) - 1];
  const heldOver = action => Boolean(over) && (previous?.id ?? null) === over.previous && latest
    && action.created < latest.created && (!previous || action.created >= previous.created)
    && Number(action.id) > Number(over.after);
  const since = actions.filter(action => !latest || action.created >= latest.created || heldOver(action));
  $("since-actions").replaceChildren(...[...since].reverse().map(action => {
    const item = storyItem(action);
    if (heldOver(action)) {
      item.classList.add("is-held-over");
      const tag = document.createElement("small");
      tag.className = "held-over-tag";
      tag.textContent = "posted while you were writing";
      item.querySelector(".story-text").after(tag);
    }
    return item;
  }));
  $("since-wrap").hidden = !since.length;
  const earlier = [
    ...state.scenes.filter(scene => scene !== latest).map(scene => ({ kind: "scene", id: scene.id, at: scene.created, text: scene.text })),
    ...actions.filter(action => latest && action.created < latest.created && !heldOver(action)).map(action => ({ ...action, at: action.created }))
  ].sort((a, b) => b.at - a.at);
  // Always show at least the last three things that happened: when the DM
  // has just posted, "since then" is empty or short, so the posts just
  // before it stay in view instead of hiding under Earlier updates.
  const shown = Math.max(0, 3 - since.length);
  $("recent-earlier").replaceChildren(...earlier.slice(0, shown).map(storyItem));
  $("recent-wrap").hidden = !shown || !earlier.length;
  // Earlier updates come in pages, newest first, so a long session isn't
  // one endless list.
  const older = earlier.slice(shown);
  const page = older.slice(0, historyPage);
  const rest = older.length - page.length;
  const items = page.map(storyItem);
  if (rest > 0) {
    const item = document.createElement("li");
    item.className = "history-more";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = "Show " + Math.min(rest, HISTORY_STEP) + " more (" + rest + " earlier)";
    button.onclick = () => { historyPage += HISTORY_STEP; renderStory(true); };
    item.append(button);
    items.push(item);
  }
  $("history").replaceChildren(...items);
  $("history").closest("details").hidden = earlier.length <= shown;
}

// Host view: one input per character, for players without a phone out.
// ── Roll requests: the DM asks, the player's phone answers in one tap ──
const ASKS_DISMISSED = () => "dnd-roll-asks-dismissed:" + room;
function pendingRollAsks(index) {
  const name = state?.party?.[index]?.name;
  const actions = (state?.actions ?? []).filter(action => action.name === name);
  const dismissed = new Set(readJson(ASKS_DISMISSED(), []));
  // An attack ask can take several rolls (Roan's Q, then the shadow's copy):
  // it stays until the player taps Done. A check or save is one roll.
  // Each answer closes one request: the oldest open one with that label, so
  // two Perception asks at DC 12 need two rolls.
  const asks = actions.map(action => ({ action, ask: parseRollAsk(action.text), answered: 0 })).filter(({ ask }) => ask);
  const ordered = [...actions].sort((a, b) => Number(a.id) - Number(b.id));
  for (const answer of ordered) {
    if (parseRollAsk(answer.text) || !String(answer.text).startsWith("🎲 ")) continue;
    const open = asks.find(entry => Number(entry.action.id) < Number(answer.id) && String(answer.text).startsWith("🎲 " + rollAskLabel(entry.ask))
      && (entry.ask.kind === "attack" || !entry.answered));
    if (open) open.answered += 1;
  }
  return asks.filter(({ ask, action, answered }) => !dismissed.has(action.id) && (ask.kind === "attack" || !answered)).slice(-3);
}
function drawRollAsks() {
  const box = $("roll-asks");
  const me = Number($("character").value);
  const pending = isHost || ended || !state ? [] : pendingRollAsks(me);
  box.hidden = !pending.length;
  if (!pending.length) { box.replaceChildren(); box.renderedHtml = ""; return; }
  const sheet = sheets[partyName(me)];
  const cards = pending.map(({ action, ask, answered }) => {
    const item = document.createElement("div");
    item.className = "roll-ask";
    item.dataset.ask = String(action.id); // a repeated ask is a new card, with its own buttons
    item.append(element("p", "eyebrow gold", "THE DM ASKS FOR A ROLL"),
      element("p", "roll-ask-what", rollAskLabel(ask) + (ask.note ? " — " + ask.note : "")));
    const buttons = document.createElement("div");
    buttons.className = "roll-ask-buttons";
    const go = (label, expression, mode = "normal") => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cta";
      button.textContent = "🎲 " + label + " · " + expression + (mode !== "normal" ? " (" + mode + ")" : "");
      button.onclick = () => {
        openDice(expression, rollAskLabel(ask) + (ask.kind === "attack" ? " · " + label : ""), null, mode);
        dice.ask = ask;
        if (!$("dice-share-wrap").hidden) { $("dice-share").checked = true; $("dice-for").hidden = true; }
      };
      return button;
    };
    if (ask.kind === "attack") {
      const attacks = attacksFor(me).filter(attack => !attack.save && !attack.area && Number.isFinite(Number(attack.hit)));
      for (const attack of attacks.slice(0, 4)) buttons.append(go(attack.name, "d20" + (attack.hit >= 0 ? "+" : "-") + Math.abs(attack.hit)));
      if (!attacks.length) buttons.append(go("Attack roll", "d20"));
    } else {
      const bonus = rollAskBonus(ask, sheet);
      const skill = ask.kind === "skill" ? (sheet?.skills ?? []).find(([name]) => name.toLowerCase() === (ask.skill ?? ask.roll).toLowerCase()) : null;
      buttons.append(go(ask.roll, bonus === null ? "d20" : "d20" + (bonus >= 0 ? "+" : "-") + Math.abs(bonus), skill ? rollModeFrom(skill[2]) : "normal"));
    }
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "quiet";
    skip.textContent = answered ? "Done (" + answered + " rolled)" : "Not now";
    skip.onclick = () => {
      storage.set(ASKS_DISMISSED(), JSON.stringify([...readJson(ASKS_DISMISSED(), []), action.id].slice(-50)));
      drawRollAsks();
    };
    item.append(buttons, skip);
    return item;
  });
  renderInto(box, cards);
}
// The latest request's answers, side by side: who's rolled, their totals, and
// pass or fail against the DC, so a group save reads at a glance.
const LAST_ASK = () => "dnd-last-ask:" + room;
function drawRollAskResults() {
  const box = $("roll-ask-results");
  const last = readJson(LAST_ASK(), null);
  const text = typeof last?.text === "string" ? last.text : "";
  const results = text ? rollAskResults(state?.actions ?? [], text, last) : [];
  box.hidden = !results.length;
  if (!results.length) { box.replaceChildren(); return; }
  const ask = parseRollAsk(text);
  const done = results.filter(entry => entry.answered).length;
  const passed = results.filter(entry => entry.pass === true).length;
  const head = element("p", "eyebrow", rollAskLabel(ask) + (ask.note ? " — " + ask.note : "") + " · " + done + " of " + results.length + " in"
    + (ask.target && done ? " · " + passed + " ✓ " + (done - passed) + " ✗" : ""));
  const list = document.createElement("ul");
  list.className = "roll-ask-result-list";
  list.append(...results.map(entry => {
    const item = document.createElement("li");
    item.className = entry.answered ? entry.pass === true ? "is-pass" : entry.pass === false ? "is-fail" : "" : "is-waiting";
    item.append(element("strong", "", partyName(entry.character)?.replace(/^The /, "") ?? "?"),
      element("span", "", entry.answered ? (entry.total ?? "?") + (entry.pass === true ? " ✓" : entry.pass === false ? " ✗" : "") : "waiting…"));
    return item;
  }));
  renderInto(box, [head, list]);
}
function drawRollAskTool() {
  const tool = $("roll-ask-tool");
  tool.hidden = !isHost || ended || !backend.postAction || !Array.isArray(state?.actions);
  if (!tool.hidden) drawRollAskResults();
  if (tool.hidden || tool.dataset.ready === String(state.party.length)) return;
  tool.dataset.ready = String(state.party.length);
  // Everyone: the whole party, less anyone sitting out a fight.
  const everyone = document.createElement("button");
  everyone.type = "button";
  everyone.className = "chip quiet";
  everyone.textContent = "Everyone";
  everyone.onclick = () => {
    const boxes = [...$("roll-ask-who").querySelectorAll("input")];
    const wanted = boxes.filter(box => !isSittingOut(state?.combat, Number(box.value)));
    const all = wanted.every(box => box.checked);
    for (const box of boxes) box.checked = !all && wanted.includes(box);
  };
  $("roll-ask-who").replaceChildren(everyone, ...state.party.map(({ name }, index) => {
    const label = document.createElement("label");
    label.className = "check chip";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = String(index);
    label.append(box, " " + name.replace(/^The /, ""));
    return label;
  }));
  const group = (title, names) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = title;
    optgroup.append(...names.map(name => new Option(name, name)));
    return optgroup;
  };
  const abilities = Object.values(ABILITY_FULL);
  $("roll-ask-roll").replaceChildren(group("Skills", SKILLS.map(([name]) => name)), group("Ability checks", abilities.map(full => full + " check")),
    group("Saving throws", abilities.map(full => full + " save")), group("Attack", ["Attack roll"]));
  $("roll-ask-roll").value = "Perception";
}
$("roll-ask-form").onsubmit = async event => {
  event.preventDefault();
  const who = [...$("roll-ask-who").querySelectorAll("input:checked")].map(box => Number(box.value));
  const roll = $("roll-ask-roll").value;
  const value = Number($("roll-ask-target").value);
  if (!who.length) { $("roll-ask-status").textContent = "Pick who rolls."; return; }
  const text = rollAskText(roll, value ? { kind: roll === "Attack roll" ? "AC" : "DC", value } : null, $("roll-ask-note").value);
  const button = event.submitter;
  button.disabled = true;
  try {
    // This request only: asks posted after the newest line so far, to these characters.
    const after = Math.max(0, ...(state?.actions ?? []).map(action => Number(action.id) || 0));
    for (const index of who) await backend.postAction(room, index, text);
    storage.set(LAST_ASK(), JSON.stringify({ text, after, who })); // its answers gather below the form
    $("roll-ask-status").textContent = "Asked " + who.map(index => partyName(index).replace(/^The /, "")).join(", ") + ": " + roll + (value ? " (" + (roll === "Attack roll" ? "AC " : "DC ") + value + ")" : "") + ".";
    for (const box of $("roll-ask-who").querySelectorAll("input")) box.checked = false;
    $("roll-ask-note").value = "";
    await sync();
  } catch (error) {
    $("roll-ask-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
function drawPartyActions() {
  $("party-actions").hidden = !isHost || !backend.postAction || !Array.isArray(state?.actions);
  if ($("party-actions").hidden) return;
  const typed = [...$("party-action-rows").querySelectorAll("input")].map(input => input.value);
  $("party-action-rows").replaceChildren(...state.party.map(({ name }, index) => {
    const row = document.createElement("form");
    row.className = "action-row party-action";
    const input = document.createElement("input");
    input.maxLength = ACTION_MAX;
    input.autocomplete = "off";
    input.placeholder = name + "…";
    input.setAttribute("aria-label", "What is " + name + " doing?");
    input.value = typed[index] ?? "";
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "secondary";
    button.textContent = "Add";
    row.append(input, button);
    row.onsubmit = async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      button.disabled = true;
      try {
        await backend.postAction(room, index, text);
        input.value = "";
        input.placeholder = name + " · added";
        await sync();
      } catch (error) {
        $("notice").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    return row;
  }));
}

// The action box stops at ACTION_MAX characters (the table's limit): say so before it does.
function countAction() {
  const box = $("action-text");
  const left = box.maxLength - box.value.length;
  $("action-count").hidden = left > 150;
  $("action-count").textContent = left > 0 ? left + " characters left" : "That's the limit: post this, then add the rest in a second post.";
}
$("action-text").addEventListener("input", countAction);
// "Rolled a 25 to hit" typed in the story box: offer to send it the way the
// Attack card does, so the DM gets a hit-or-miss question instead of a chat line.
function drawTypedRoll() {
  const total = parseTypedToHit($("action-text").value);
  const show = total !== null && !isHost && Boolean(state?.combat) && Boolean(typedToHit);
  $("action-roll").hidden = !show;
  if (!show) return;
  $("action-roll-text").textContent = "That's an attack roll. Send it as one and the DM will say hit or miss.";
  $("action-roll-send").textContent = "🎯 Send " + total + " to hit";
}
$("action-text").addEventListener("input", drawTypedRoll);
$("action-roll-send").onclick = () => {
  const total = parseTypedToHit($("action-text").value);
  if (total === null || !typedToHit) { drawTypedRoll(); return; }
  const problem = typedToHit(total);
  showTab("combat");
  if (problem) { $("combat-status").textContent = problem; $("attack-target").focus(); return; }
  $("action-text").value = "";
  countAction();
  drawTypedRoll();
  $("action-status").textContent = "";
};
$("action-form").onsubmit = async event => {
  event.preventDefault();
  const text = $("action-text").value.trim();
  if (!text || !state) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await backend.postAction(room, Number($("character").value), text);
    $("action-text").value = "";
    countAction();
    $("action-status").textContent = "Added to the story.";
    await sync();
  } catch (error) {
    $("action-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

// ── Conditions (kept on this device for each character; changes are posted
// to the table so the DM sees them) ──
// Risky buttons ask for a second tap instead of a native confirm() popup:
// some browsers (automated ones, some in-app views) dismiss those silently,
// so the button looked tapped and nothing happened. The first tap shows the
// question on the button itself; a second tap within 4 seconds does it.
const armedButtons = new WeakMap();
function confirmTap(button, question) {
  const armed = armedButtons.get(button);
  if (armed) {
    clearTimeout(armed.timer);
    armedButtons.delete(button);
    button.textContent = armed.label;
    button.classList.remove("is-armed");
    return true;
  }
  const label = button.textContent;
  button.textContent = question;
  button.classList.add("is-armed");
  armedButtons.set(button, { label, timer: setTimeout(() => {
    if (!armedButtons.has(button)) return;
    armedButtons.delete(button);
    button.textContent = label;
    button.classList.remove("is-armed");
  }, 4000) });
  return false;
}
const conditionKey = () => "dnd-conditions:" + room + ":" + $("character").value;
const conditionByName = Object.fromEntries(conditions.map(condition => [condition.name, condition]));
function activeConditions() {
  try {
    const saved = JSON.parse(storage.get(conditionKey()) ?? "{}");
    return Object.fromEntries(Object.entries(saved).filter(([name, level]) => conditionByName[name] && level > 0));
  } catch {
    return {};
  }
}
const conditionLabel = (name, level) => name + (name === "Exhaustion" ? " " + level : "");
async function setCondition(name, level) {
  const active = activeConditions();
  const before = active[name] ?? 0;
  level = Math.max(0, Math.min(name === "Exhaustion" ? 6 : 1, level));
  if (level === before) return;
  if (level) active[name] = level; else delete active[name];
  const key = conditionKey(); // the character this change is for, even if the picker changes meanwhile
  storage.set(key, JSON.stringify(active));
  if (name === "Concentrating" && !level) {
    // No spell to hold any more: its waiting saves go too.
    const index = Number($("character").value);
    storage.set(pendingKey(), JSON.stringify(pendingSaves().filter(save => save.index !== index)));
    drawConcentration();
  }
  drawConditions();
  const character = selectedCharacter();
  if (!character || !backend.postAction || !Array.isArray(state?.actions) || ended) return;
  // Stepping exhaustion (1 → 2 → 3, or back) posts one line once the taps
  // stop, with where it ended up.
  const index = Number($("character").value);
  if (name === "Exhaustion" && before && level) {
    // Kept per character, so stepping one and then another on a shared phone
    // posts both.
    const pending = exhaustionPosts.get(key) ?? { timer: 0, from: before };
    clearTimeout(pending.timer);
    exhaustionPosts.set(key, pending);
    pending.timer = setTimeout(() => {
      const from = pending.from;
      exhaustionPosts.delete(key);
      const now = readJson(key, {}).Exhaustion ?? 0;
      if (now && now !== from) postCondition(name, now, from, key, index);
    }, 1500);
    $("condition-status").textContent = "";
    return;
  }
  await postCondition(name, level, before, key, index);
}
const exhaustionPosts = new Map(); // condition key → { timer, from }
async function postCondition(name, level, before, key, index) {
  const { icon } = conditionByName[name];
  const text = !level ? "is no longer " + name + (name === "Exhaustion" ? "ed" : "")
    : name === "Exhaustion" ? "has Exhaustion level " + level + " " + icon
    : name === "Concentrating" ? "is concentrating on a spell " + icon
    : "is " + name + " " + icon;
  try {
    await backend.postAction(room, index, text.replace("Exhaustioned", "exhausted"));
    $("condition-status").textContent = "The table can see this.";
    sync();
  } catch (error) {
    // Undo it here so tapping again retries; otherwise the table would never hear.
    const now = readJson(key, {});
    if (before) now[name] = before; else delete now[name];
    storage.set(key, JSON.stringify(now));
    drawConditions();
    $("condition-status").textContent = "Couldn't tell the table (" + error.message + "). Tap it again to retry.";
  }
}
function drawConditions() {
  const active = activeConditions();
  const names = Object.keys(active);
  $("conditions-count").textContent = names.length ? names.length + " active" : "None";
  $("conditions-count").classList.toggle("is-alert", names.length > 0);
  $("condition-active").replaceChildren(...names.map(name => {
    const { icon, text } = conditionByName[name];
    const item = document.createElement("li");
    item.className = "condition";
    const head = document.createElement("div");
    head.className = "condition-head";
    const title = document.createElement("strong");
    title.textContent = icon + " " + conditionLabel(name, active[name]);
    head.append(title);
    if (name === "Exhaustion") {
      const stepper = document.createElement("div");
      stepper.className = "stepper small";
      const minus = document.createElement("button");
      minus.type = "button"; minus.textContent = "−"; minus.setAttribute("aria-label", "Lower exhaustion");
      minus.onclick = () => setCondition(name, active[name] - 1);
      const plus = document.createElement("button");
      plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "Raise exhaustion");
      plus.onclick = () => setCondition(name, active[name] + 1);
      stepper.append(minus, plus);
      head.append(stepper);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet";
    remove.textContent = "Remove";
    remove.onclick = () => setCondition(name, 0);
    head.append(remove);
    const body = document.createElement("p");
    body.textContent = text;
    item.append(head, body);
    return item;
  }));
  $("condition-grid").replaceChildren(...conditions.map(({ name, icon }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "condition-toggle" + (active[name] ? " is-active" : "");
    button.setAttribute("aria-pressed", String(Boolean(active[name])));
    button.textContent = icon + " " + name;
    button.onclick = () => {
      // Concentrating on someone with no concentration spell is usually a
      // stray tap (it happened in a playtest): ask once more.
      if (name === "Concentrating" && !active[name] && !canConcentrate(selectedCharacter())
        && !confirmTap(button, "🧠 No concentration spell on this sheet. Tap again to mark it anyway")) return;
      setCondition(name, active[name] ? 0 : 1);
    };
    return button;
  }));
  $("condition-badges").hidden = !names.length;
  $("condition-badges").replaceChildren(...names.map(name => {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "badge";
    badge.textContent = conditionByName[name].icon + " " + conditionLabel(name, active[name]);
    badge.onclick = () => { showTab("scene"); $("conditions").scrollIntoView({ behavior: "smooth", block: "center" }); };
    return badge;
  }));
}
// Does this character have anything that needs concentration (a spell on
// the roster or sheet that says so, not "no concentration")?
function canConcentrate(character) {
  if (!character) return true;
  return /(?<!no )concentration/i.test(JSON.stringify(character) + JSON.stringify(sheets[character.name] ?? {}));
}
function conditionRollNotes() {
  if (isHost) return [];
  const active = activeConditions();
  return Object.keys(active).filter(name => conditionByName[name].roll)
    .map(name => conditionByName[name].icon + " " + conditionLabel(name, active[name]) + ": " + conditionByName[name].roll);
}

// ── Dice ──
const dice = { pool: {}, modifier: 0, mode: "normal", label: "", log: [] };
// 3D dice (src/dice3d.js): each die tumbles and lands on its rolled number.
const MAX_SHOWN = 8;
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function dieSlot(kind, caption, size) {
  const wrap = document.createElement("div");
  wrap.className = "die";
  const die = createDie(kind, size);
  const label = document.createElement("small");
  label.textContent = caption;
  wrap.append(die.canvas, label);
  return { wrap, die };
}
// d100 is two dice (tens and units); everything else is one.
function diceFor(faces) {
  return faces.flatMap(face => face.sides === 100
    ? [{ ...face, kind: "tens", caption: "d100", label: face.value === undefined ? undefined : percentileLabels(face.value).tens },
       { ...face, kind: "units", caption: "", label: face.value === undefined ? undefined : percentileLabels(face.value).units }]
    : [{ ...face, kind: face.sides, caption: face.dropped ? "not used" : "d" + face.sides, label: face.value === undefined ? undefined : String(face.value) }]);
}
function stageDice(faces) {
  const all = diceFor(faces);
  const shown = all.slice(0, MAX_SHOWN);
  const size = shown.length === 1 ? 132 : shown.length === 2 ? 104 : shown.length <= 4 ? 74 : 52;
  const slots = shown.map(face => ({ face, ...dieSlot(face.kind, face.caption, size) }));
  const more = [];
  if (all.length > MAX_SHOWN) {
    const chip = document.createElement("span");
    chip.className = "dice-more";
    chip.textContent = "+" + (all.length - MAX_SHOWN) + " more";
    more.push(chip);
  }
  $("dice-stage").replaceChildren(...slots.map(slot => slot.wrap), ...more);
  $("dice-stage").hidden = !all.length;
  return slots;
}
function previewDice() {
  drawTablePrompt(); // the real-dice box asks for the right number
  const parsed = parseDice($("dice-expression").value.trim() || "d20");
  if (!parsed) return stageDice([]);
  const faces = parsed.dice.flatMap(die => Array.from({ length: die.count }, () => ({ sides: die.sides })));
  const single20 = faces.length === 1 && faces[0].sides === 20 && parsed.dice[0].sign === 1;
  if (single20 && dice.mode !== "normal") faces.push({ sides: 20 });
  for (const slot of stageDice(faces)) slot.die.idle();
}
async function spinDice(result) {
  const faces = result.groups.flatMap(group => group.results.map(value => ({ sides: group.sides, value })));
  // Advantage or disadvantage: the d20 that doesn't count sits last, greyed
  // out and captioned "not used", so nobody reads it as the result.
  if (result.dropped !== null) faces.push({ sides: 20, value: result.dropped, dropped: true });
  const slots = stageDice(faces);
  const reduced = reduceMotion();
  await Promise.all(slots.map(({ face, die, wrap }, index) => {
    const color = face.dropped ? "grey" : face.sides === 20 && face.value === 20 ? "gold" : face.sides === 20 && face.value === 1 ? "dark" : "red";
    if (face.dropped) wrap.classList.add("is-dropped");
    return die.roll(face.label, { color, reduced, delay: index * 70 });
  }));
}

function syncDiceExpression() {
  $("dice-expression").value = poolExpression(dice.pool, dice.modifier);
  $("mod-value").textContent = (dice.modifier >= 0 ? "+" : "−") + Math.abs(dice.modifier);
  previewDice();
}
// A skill check ("roll Deception"): the right dice, named, and shared with
// the table so the DM sees "🎲 Deception: 14".
function rollSkill(name, value) {
  openDice(rollableFrom(value) ?? "d20", name, null, rollModeFrom(value));
  if (!$("dice-share-wrap").hidden) {
    $("dice-share").checked = true;
    // Its purpose is filled in too, so a tweaked roll (+1 from a bonus)
    // still says what it's for after the skill label drops away.
    setRollPurpose(name);
    $("dice-for").hidden = false;
  }
}
// One-tap rolls from the character's roll tiles and proficient saves, so
// nobody has to type "d20+9".
function drawDicePresets() {
  // A roll the app is waiting on (death save, initiative, an attack) keeps its
  // own dice: no presets to swap in an unrelated roll.
  drawSkillPicker();
  if (dice.onResult) { $("dice-presets").hidden = true; return; }
  const character = isHost ? null : selectedCharacter();
  const sheet = sheets[character?.name];
  const presets = [];
  for (const [label, value] of sheet?.rolls ?? []) {
    const expression = rollableFrom(value);
    if (expression && !/^AC$/i.test(label)) presets.push([label, expression, rollModeFrom(value)]);
  }
  for (const entry of abilityMods(sheet)) {
    if (entry.proficient && !presets.some(([label]) => label.toUpperCase() === entry.ability + " SAVE")) {
      presets.push([entry.ability + " save", "d20" + (entry.save >= 0 ? "+" : "-") + Math.abs(entry.save)]);
    }
  }
  $("dice-presets").hidden = !presets.length;
  $("dice-presets").replaceChildren(...presets.slice(0, 10).map(([label, expression, mode = "normal"]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (label === dice.label ? " is-active" : "");
    const name = document.createElement("span");
    name.textContent = label;
    const shown = document.createElement("small");
    shown.textContent = expression;
    chip.append(name, shown);
    chip.onclick = () => {
      dice.pool = {};
      dice.modifier = 0;
      dice.label = label;
      dice.labelFromPurpose = null;
      setDiceMode(mode);
      $("mod-value").textContent = "+0";
      $("dice-expression").value = expression;
      $("dice-label").textContent = label + " · " + expression + (mode === "advantage" ? " (advantage)" : "");
      $("dice-result").hidden = true;
      for (const other of $("dice-presets").children) other.classList.toggle("is-active", other === chip);
      previewDice();
    };
    return chip;
  }));
}
// Every skill on the sheet, one pick away in the dice tray.
function drawSkillPicker() {
  const picker = $("dice-skill");
  const skills = isHost || dice.onResult ? [] : sheets[selectedCharacter()?.name]?.skills ?? [];
  picker.hidden = !skills.length;
  if (!skills.length) return;
  picker.replaceChildren(new Option("Skill check…", ""), ...skills.filter(([, , value]) => rollableFrom(value))
    .map(([name, ability, value]) => new Option(name + " (" + ability + ") " + value, name)));
  picker.value = "";
  picker.onchange = () => {
    const skill = skills.find(([name]) => name === picker.value);
    if (skill) rollSkill(skill[0], skill[2]);
  };
}
// Every roll starts at Normal unless the caller says otherwise: advantage from
// one roll (Reckless, a sheet's "adv.") must never carry into the next.
function openDice(expression = "", label = "", onResult = null, mode = "normal") {
  dice.locked = false;
  $("dice-roll").disabled = false;
  setDiceMode(mode);
  dice.rollId = (dice.rollId ?? 0) + 1; // a roll still tumbling from before won't land here
  dice.onResult = onResult;
  dice.pool = {};
  dice.modifier = 0;
  dice.label = label;
  dice.labelFromPurpose = null;
  dice.ask = null;
  $("mod-value").textContent = "+0";
  $("dice-expression").value = expression;
  $("dice-label").textContent = label ? label + " · " + expression : "";
  $("dice-result").hidden = true;
  drawRealDice();
  $("dice-status").textContent = "";
  const canShare = Boolean(backend.postAction) && Array.isArray(state?.actions) && !isHost && !ended && !onResult;
  $("dice-share-wrap").hidden = !canShare;
  setRollPurpose("");
  $("dice-for").hidden = !$("dice-share").checked;
  const notes = conditionRollNotes();
  $("dice-conditions").hidden = !notes.length;
  $("dice-conditions").textContent = notes.join(" ");
  $("dice-tray").hidden = false;
  drawDicePresets();
  // Nothing chosen yet: start from a plain d20 so Roll always works.
  if (!expression) $("dice-expression").value = "d20";
  previewDice();
  document.body.classList.add("no-scroll");
}
function closeDice() {
  if (dice.locked) { dice.locked = false; $("dice-roll").disabled = false; }
  $("dice-tray").hidden = true;
  document.body.classList.remove("no-scroll");
}
$("dice-fab").onclick = () => openDice();
$("dice-close").onclick = closeDice;
$("dice-tray").onclick = event => { if (event.target === $("dice-tray")) closeDice(); };
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("dice-tray").hidden) closeDice(); });
for (const button of $("dice-buttons").children) {
  button.onclick = () => {
    const sides = button.dataset.sides;
    if (!Object.keys(dice.pool).length && $("dice-expression").value && !dice.label) dice.pool = {};
    dice.label = "";
    $("dice-label").textContent = "";
    dice.pool[sides] = (dice.pool[sides] ?? 0) + 1;
    syncDiceExpression();
  };
}
// −/+ adjust the roll that's showing: "d20+11" becomes "d20+12", not "d20+1".
function stepModifier(change) {
  if (!Object.keys(dice.pool).length) {
    const parsed = parseDice($("dice-expression").value.trim() || "d20");
    dice.pool = {};
    dice.modifier = 0;
    if (parsed && parsed.dice.length && parsed.dice.every(die => die.sign === 1)) {
      for (const die of parsed.dice) dice.pool[die.sides] = (dice.pool[die.sides] ?? 0) + die.count;
      dice.modifier = parsed.modifier;
    } else {
      dice.pool = { 20: 1 };
    }
  }
  dice.modifier += change;
  dice.label = "";
  $("dice-label").textContent = "";
  syncDiceExpression();
}
$("mod-minus").onclick = () => stepModifier(-1);
$("mod-plus").onclick = () => stepModifier(1);
$("dice-expression").oninput = () => {
  dice.pool = {}; dice.modifier = 0; $("mod-value").textContent = "+0";
  // An edited roll is no longer the quick-roll it started from ("Damage"):
  // drop its label so the log doesn't call "d6: 3" Damage. A roll the app
  // is waiting on (an attack, a death save) keeps its label.
  if (!dice.onResult && dice.label) {
    dice.label = "";
    $("dice-label").textContent = "";
    for (const chip of $("dice-presets").children) chip.classList.remove("is-active");
  }
  previewDice();
};
for (const button of $("dice-mode").children) {
  button.onclick = () => {
    dice.mode = button.dataset.mode;
    for (const other of $("dice-mode").children) other.classList.toggle("is-active", other === button);
    previewDice();
  };
}
$("dice-clear").onclick = () => openDice();
// A shared roll from the plain tray says what it's for ("🎲 Stealth: 14"), so
// the DM never has to guess. Sheet rolls carry their own label.
function setRollPurpose(text) {
  $("dice-for-text").value = text;
  // A label a purpose chip put there ("Stealth") goes when the purpose
  // changes, so the roll posts as what the player picked now.
  if (dice.labelFromPurpose && dice.labelFromPurpose !== text) {
    dice.label = "";
    dice.labelFromPurpose = null;
    $("dice-label").textContent = "";
  }
  for (const chip of $("dice-for").querySelectorAll(":scope > .chip")) chip.classList.toggle("is-active", chip.textContent === text);
  if (!/^(Saving throw|Check|Attack|Damage)$/.test(text)) $("dice-ability").hidden = true;
}
// Put a roll in the tray with the character's own bonus, as a preset does.
function setDiceRoll(label, expression, mode = "normal") {
  dice.pool = {};
  dice.modifier = 0;
  dice.label = label;
  dice.labelFromPurpose = label;
  setDiceMode(mode);
  $("mod-value").textContent = "+0";
  $("dice-expression").value = expression;
  $("dice-label").textContent = label + " · " + expression + (mode === "advantage" ? " (advantage)" : "");
  $("dice-result").hidden = true;
  for (const other of $("dice-presets").children) other.classList.remove("is-active");
  previewDice();
}
const withBonus = bonus => "d20" + (bonus >= 0 ? "+" : "-") + Math.abs(bonus);
const ABILITY_NAMES = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };
// A purpose chip (or a typed skill) that names a roll on the sheet sets the
// dice too: Stealth is d20 + Stealth, not a bare d20. Saving throw and Check
// ask which ability first, so the modifier is never left off.
function pickRollPurpose(text) {
  setRollPurpose(text);
  const sheet = isHost ? null : sheets[selectedCharacter()?.name];
  const box = $("dice-ability");
  if (/^(Saving throw|Check)$/.test(text) && abilityMods(sheet).length) {
    const save = text === "Saving throw";
    box.replaceChildren(element("span", "fineprint", save ? "Which save?" : "Which ability?"), ...abilityMods(sheet).map(entry => {
      const bonus = save ? entry.save : entry.mod;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (save && entry.proficient ? " is-proficient" : "");
      chip.textContent = entry.ability + " " + (bonus >= 0 ? "+" : "−") + Math.abs(bonus) + (save && entry.proficient ? " ●" : "");
      chip.onclick = () => {
        const label = ABILITY_NAMES[entry.ability] + (save ? " save" : " check");
        setDiceRoll(label, withBonus(bonus));
        setRollPurpose(label);
        box.hidden = true;
      };
      return chip;
    }));
    box.hidden = false;
    box.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return;
  }
  // Attack and Damage list the character's own attacks, with their numbers.
  const attacks = /^(Attack|Damage)$/.test(text) && !isHost ? attacksFor(Number($("character").value)).filter(attack => !attack.heal && (text === "Damage" ? attack.damage : !attack.save && !attack.area && Number.isFinite(Number(attack.hit)))) : [];
  if (attacks.length) {
    const damage = text === "Damage";
    box.replaceChildren(element("span", "fineprint", damage ? "Which damage?" : "Which attack?"), ...attacks.map(attack => {
      const expression = damage ? attack.damage : withBonus(Number(attack.hit));
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = attack.name + " " + expression;
      chip.onclick = () => {
        const label = attack.name + (damage ? " damage" : " to hit");
        setDiceRoll(label, expression);
        setRollPurpose(label);
        box.hidden = true;
      };
      return chip;
    }));
    box.hidden = false;
    box.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return;
  }
  const skill = (sheet?.skills ?? []).find(([name]) => name.toLowerCase() === text.toLowerCase());
  const expression = skill && rollableFrom(skill[2]);
  if (expression) setDiceRoll(skill[0], expression, rollModeFrom(skill[2]));
}
for (const chip of $("dice-for").querySelectorAll(":scope > .chip")) chip.onclick = () => chip.classList.contains("is-active") ? setRollPurpose("") : pickRollPurpose(chip.textContent);
$("dice-for-text").oninput = () => {
  const typed = $("dice-for-text").value.trim();
  if (dice.labelFromPurpose && dice.labelFromPurpose !== typed) {
    dice.label = "";
    dice.labelFromPurpose = null;
    $("dice-label").textContent = "";
  }
  for (const chip of $("dice-for").querySelectorAll(":scope > .chip")) chip.classList.toggle("is-active", chip.textContent === typed);
  const sheet = isHost ? null : sheets[selectedCharacter()?.name];
  if ((sheet?.skills ?? []).some(([name]) => name.toLowerCase() === typed.toLowerCase())) pickRollPurpose(typed);
};
$("dice-share").onchange = () => { $("dice-for").hidden = !$("dice-share").checked; };
$("dice-roll").onclick = async () => {
  if (dice.locked) return;
  const purpose = $("dice-for-text").value.trim();
  if (!$("dice-share-wrap").hidden && $("dice-share").checked && !dice.label && !purpose) {
    $("dice-status").textContent = "What's this roll for? Pick one above (or type it), or untick Share.";
    $("dice-for").scrollIntoView?.({ block: "nearest" });
    return;
  }
  const expression = $("dice-expression").value.trim() || "d20";
  const result = roll(expression, { mode: dice.mode });
  if (!result) {
    $("dice-status").textContent = "Try something like d20+5, 2d6+3, or 1d12+7.";
    return;
  }
  await landRoll(result, purpose);
};
// Real dice at the table: the same roll, from the number the player enters,
// so crits, death saves, attacks and sharing all work as with the app's dice.
$("dice-table").onsubmit = async event => {
  event.preventDefault();
  if (dice.locked) return; // the card already has its roll (see Roll's lock)
  const purpose = $("dice-for-text").value.trim();
  if (!$("dice-share-wrap").hidden && $("dice-share").checked && !dice.label && !purpose) {
    $("dice-status").textContent = "What's this roll for? Pick one above (or type it), or untick Share.";
    return;
  }
  const expression = $("dice-expression").value.trim() || "d20";
  const result = tableRoll(expression, $("dice-table-value").value, dice.mode);
  if (!result) {
    $("dice-status").textContent = parseDice(expression)?.dice.length
      ? "Those dice can't show " + $("dice-table-value").value + ". Check what you rolled and try again."
      : "Pick the dice first (like d20+5 or 2d6+3).";
    return;
  }
  $("dice-table-value").value = "";
  await landRoll(result, purpose);
};
// Real dice are opt-in per phone: a group that rolls its own turns the box on
// once and it stays on; everyone else never sees it.
const REAL_DICE_KEY = "dnd-real-dice";
const realDice = () => storage.get(REAL_DICE_KEY) === "1";
function drawRealDice() {
  $("dice-table").hidden = !realDice();
  $("dice-real-on").hidden = realDice();
}
$("dice-real-on").onclick = () => { storage.set(REAL_DICE_KEY, "1"); drawRealDice(); $("dice-table-value").focus(); };
$("dice-real-off").onclick = () => { storage.set(REAL_DICE_KEY, "0"); drawRealDice(); };
function drawTablePrompt() {
  const expression = $("dice-expression").value.trim() || "d20";
  $("dice-table-label").textContent = "Rolled real dice? " + (tablePrompt(expression, dice.mode) || "Pick the dice first.");
}
async function landRoll(result, purpose) {
  $("dice-status").textContent = "";
  $("dice-result").hidden = true;
  $("dice-roll").disabled = true;
  // What this roll is for, taken now: the tray can be cleared or reopened
  // for another roll while the dice are still tumbling.
  const rollId = dice.rollId = (dice.rollId ?? 0) + 1;
  const { label, onResult, ask } = dice;
  const share = !$("dice-share-wrap").hidden && $("dice-share").checked;
  try {
    if (!result.table) await spinDice(result); // real dice already landed
  } finally {
    $("dice-roll").disabled = false;
  }
  if (rollId !== dice.rollId) return;
  $("dice-total").textContent = String(result.total);
  $("dice-tag").textContent = result.critical ? "NATURAL 20" : result.fumble ? "NATURAL 1" : result.mode !== "normal" ? result.mode.toUpperCase() : "";
  $("dice-result").className = "dice-result" + (result.critical ? " is-crit" : result.fumble ? " is-fumble" : "");
  $("dice-breakdown").textContent = result.expression + " → " + result.breakdown;
  $("dice-result").hidden = false;
  $("dice-result").animate?.([{ transform: "scale(.92)", opacity: .4 }, { transform: "scale(1)", opacity: 1 }], { duration: 220, easing: "ease-out" });
  if (!(result.groups.length === 1 && result.groups[0].sides === 20 && result.groups[0].count === 1)) {
    lastDamageRoll = { total: result.total, label: label || result.expression };
  }
  const name = label || (purpose ? purpose + " (" + result.expression + ")" : result.expression);
  dice.log.unshift(name + ": " + result.total + " (" + result.breakdown + ")");
  dice.log = dice.log.slice(0, 8);
  list("dice-log", dice.log);
  if (onResult) {
    // The card (attack, death save, initiative…) has its roll: Roll is
    // locked until the tray is opened again, so a second tap can't show a
    // different number than the one that counted.
    $("dice-roll").disabled = true;
    dice.locked = true;
    await onResult(result.total, result);
    return;
  }
  if (share) {
    const text = ("🎲 " + name + ": " + result.total + " (" + result.breakdown + (result.mode !== "normal" ? ", " + result.mode : "") + ")" + rollAskVerdict(ask, result.total)).slice(0, ACTION_MAX);
    try {
      await backend.postAction(room, Number($("character").value), text);
      $("dice-status").textContent = "Shared with the table.";
      sync();
    } catch (error) {
      $("dice-status").textContent = error.message;
    }
  }
}

// ── Combat mode: the DM starts it from the encounter tracker; every phone
// sees the initiative order, whose turn it is, and enemies as Healthy,
// Bloodied, or Down (never their HP). ──
const STATUS_TEXT = { ok: "Healthy", bloodied: "Bloodied", down: "Down" };
let combatTimer;
function myIndex() { return isHost ? null : Number($("character").value); }
function liveOrder() {
  if (!state?.combat) return [];
  // The DM's phone uses its own (freshest) enemies.
  const combat = isHost && encounterLoaded ? { ...state.combat, enemies: publicEnemies(enemies) } : state.combat;
  return combatOrder(combat, state.party);
}
const initiativeEntry = () => (sheets[selectedCharacter()?.name]?.rolls ?? []).find(([label]) => /initiative/i.test(label));
function initiativeExpression() {
  const entry = initiativeEntry();
  return (entry && rollableFrom(entry[1])) || "d20";
}
// Feral Instinct ("+2 adv."): initiative rolls with advantage.
const initiativeMode = () => rollModeFrom(initiativeEntry()?.[1] ?? "");
function combatChanged(previous) {
  const before = previous?.combat;
  const now = state.combat;
  // A new fight (or one that ended), or a round lower than a saved one: the
  // death-save round lock belongs to the old fight.
  if (!before !== !now || (before && now && now.round < before.round)) forgetDeathRounds();
  // A fight starting or ending (or its round going back) on this page, or no
  // fight at all on opening the table: last fight's turn records don't apply.
  if (previous ? !before !== !now || (before && now && now.round < before.round) : !now) forgetTurns();
  drawCombat();
  if (!before && now) {
    // Don't pull a player away from an action they're still typing.
    if (!isHost && !$("action-text").value.trim()) showTab("combat");
    $("tab-combat").classList.toggle("has-news", currentTab !== "combat");
    if (!isHost && $("action-text").value.trim()) $("notice").textContent = "Combat started: post your action, then open the Combat tab.";
  }
  if (before && !now) {
    if (!isHost && !resShared()) endRages(); // shared resources: the DM's End combat did it
    if (currentTab === "combat") showTab("scene");
    $("notice").textContent = "Combat ended.";
    setTimeout(() => { if ($("notice").textContent === "Combat ended.") $("notice").textContent = ""; }, 6000);
  }
  const mine = "pc:" + myIndex();
  if (now && !isHost && now.turn === mine && before?.turn !== mine) {
    // A new turn starts at Attack: last turn's finished attack (sent, missed)
    // mustn't make the guide jump straight to End turn.
    // An attack still in flight (rolled, waiting for the DM's call, a hit
    // not yet rolled for damage) carries over: it belongs to this turn.
    if (attackFinished()) { resetAttack(); drawAttack(); }
    navigator.vibrate?.([120, 60, 120]);
    if (currentTab !== "combat") $("tab-combat").classList.add("has-news");
  }
}
async function publishCombat(changes = {}) {
  clearTimeout(combatTimer);
  if (!("turn" in changes) && !changes.reset) {
    // Only the enemies changed. The server updates just the enemies of a fight
    // that's still on, so this can't put back a turn a player just passed or
    // reopen a fight the DM just ended.
    if (!state?.combat) return;
    const shown = publicEnemies(enemies);
    try {
      await backend.combatEnemies(room, shown);
    } catch (error) {
      if (!/could not find the function/i.test(error.message)) throw error;
      // Before migration 0012: re-read the turn, then write it back with the enemies.
      const fresh = await backend.room(room);
      if (!fresh.combat) return;
      await backend.combatSet(room, { round: fresh.combat.round, turn: fresh.combat.turn, enemies: shown });
    }
    if (state.combat) state.combat = { ...state.combat, enemies: shown };
    drawCombat();
    return;
  }
  const current = state?.combat ?? { round: 1, turn: null };
  const payload = {
    round: changes.round ?? current.round,
    turn: "turn" in changes ? changes.turn : current.turn,
    enemies: publicEnemies(enemies),
    reset: Boolean(changes.reset)
  };
  await backend.combatSet(room, payload);
  state.combat = { ...current, ...payload, party: changes.reset ? {} : current.party ?? {} };
  delete state.combat.reset;
  drawCombat();
}
function schedulePublish() {
  clearTimeout(combatTimer);
  combatTimer = setTimeout(() => publishCombat().catch(error => { $("enc-combat-status").textContent = error.message; }), 350);
}

// ── Turn guide: the one next thing to do, at the top of the Combat tab, so a
// first-time player falls into the loop: initiative → attack → send → end turn.
const GUIDE_STEPS = ["Turn order", "Attack", "Send to DM", "End turn"];
let guideAction = null;
function drawTurnGuide() {
  const guide = $("turn-guide");
  const hint = $("guide-hint");
  const go = $("guide-go");
  const combat = state?.combat;
  $("combat-end-turn").classList.remove("is-next");
  if (!combat || isHost || ended || boardMode) { guide.hidden = hint.hidden = go.hidden = true; return; }
  const me = myIndex();
  const myTurn = combat.turn === "pc:" + me;
  const rolled = Number.isFinite(combat.party?.[me]);
  const down = (hpRecord(me)?.hp ?? 1) <= 0;
  const canSend = Boolean(backend.postAction) && Array.isArray(state?.actions);
  let step = 0;
  let text = "";
  let label = "";
  guideAction = null;
  const toAttack = () => { showTab("combat"); scrollToCard($("attack-card")); };
  if (isSittingOut(combat, me)) {
    text = "You're sitting out this fight: you're somewhere else in the story. Post what you're doing in the Scene tab.";
  } else if (!rolled) {
    text = "Roll initiative (a d20) to find out when your turn comes.";
    label = "🎲 Roll initiative";
    guideAction = () => $("init-roll").click();
  } else if (!myTurn) {
    step = 1;
    text = combat.turn ? "Not your turn yet. Plan your move: the Moves tab has ideas." : "Waiting for the DM to start round 1.";
    if (!combat.turn) $("combat-turn").textContent = "Initiative " + combat.party[me];
  } else if (down) {
    step = 1;
    text = "You're down at 0 HP: roll a death save, then end your turn.";
    label = "💀 Roll death save";
    guideAction = () => { showTab("sheet"); document.querySelector("#hp-sheet .death-saves")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  } else if (attackFlow.step === "damage" && canSend && !attackFlow.sent.length) {
    step = 2;
    text = "Send the damage to the DM: it lands on the enemy you picked.";
    label = "📨 Send " + attackFlow.damage + " to the DM";
    guideAction = () => {
      const send = [...$("attack-steps").querySelectorAll("button")].find(button => /^Send /.test(button.textContent) && !button.disabled);
      if (send) send.click(); else toAttack();
    };
  } else if ((attackFlow.step === "damage" && (attackFlow.sent.length || !canSend)) || attackFlow.step === "miss") {
    step = 3;
    const made = attacksThisTurn(me);
    const per = attacksFor(me)[attackFlow.index]?.perAction ?? 0;
    const cap = per ? attackCap(me, per) : 0;
    text = per && made < cap
      ? "You get " + (cap - made) + " more attack" + (cap - made === 1 ? "" : "s") + ": tap Next attack on the card. Or end your turn."
      : attacksSpent(me) ? "That's your attacks for this turn. End your turn so the next player goes."
      : actionSpent(me) ? "Your action is used. You still have a bonus action (" + bonusAttacksLeft(me).join(" or ") + "), or end your turn."
      : "Done? End your turn so the next player goes.";
    $("combat-end-turn").classList.add("is-next");
  } else if (attackFlow.step === "ready" && actionSpent(me)) {
    // Back on a fresh Attack card with the action already used.
    step = 3;
    const bonus = bonusAttacksLeft(me);
    text = "You've used your action this turn. " + (bonus.length ? "You still have a bonus action (" + bonus.join(" or ") + "), or e" : "E") + "nd your turn so the next player goes.";
    $("combat-end-turn").classList.add("is-next");
  } else {
    step = 1;
    const middle = attackFlow.step === "waiting" ? "Your roll went to the DM. Waiting for the call: hit or miss."
      : attackFlow.step === "rolled" ? "Roll damage and send it. The DM checks whether it hits."
      : attackFlow.step === "hit" ? "It hit: roll damage."
      : "Pick a weapon or spell and who you're attacking, then tap Roll to hit. Doing something else? Write it on the Scene tab, then end your turn.";
    // Name the options on the card, so Reckless or a maneuver isn't missed.
    const sheet = sheets[partyName(me)];
    const current = attacksFor(me)[attackFlow.index];
    const offered = attackFlow.step === "ready" && current && !current.save
      ? (sheet?.attackOptions ?? []).filter(option => !(option.melee && current.ranged) && !option.rage) : [];
    const on = offered.filter(option => attackFlow.options.has(option.name)).map(option => baseName(option.name));
    const off = offered.filter(option => !attackFlow.options.has(option.name)).map(option => option.name);
    text = middle + (off.length ? " Options on the card: " + off.join(", ") + "." : "") + (on.length ? " On: " + on.join(", ") + "." : "");
    label = "⚔️ Go to the Attack card";
    guideAction = toAttack;
  }
  guide.replaceChildren(...GUIDE_STEPS.map((name, index) => {
    const item = document.createElement("li");
    item.className = index < step ? "is-done" : index === step && (myTurn || !rolled) ? "is-now" : "";
    item.textContent = name;
    return item;
  }));
  guide.hidden = false;
  hint.textContent = text;
  hint.hidden = !text;
  go.textContent = label;
  go.hidden = !guideAction;
}
$("guide-go").onclick = () => guideAction?.();

// The DM's side of the loop on the same tab: whose turn it is and, on an
// enemy's turn, that enemy's attacks right here (no hop to the DM tab).
let dmTurnKey = "";
let dmTurnStart = 0;
const DM_TURN_KEY = () => "dnd-dm-turn-start:" + room;
function drawDmTurn(current, order) {
  const box = $("dm-turn");
  if (!isHost || !state?.combat || ended) { box.hidden = true; dmTurnKey = ""; return; }
  box.hidden = false;
  const enemy = current?.kind === "enemy" && encounterLoaded ? enemies.find(entry => "en:" + entry.id === current.key) : null;
  const key = !current ? "start:" + order.filter(entry => entry.kind === "pc" && entry.initiative === null).length
    : enemy ? "en:" + enemy.id + ":" + enemy.hp + ":" + (enemy.conditions ?? []).join(",") + ":" + state.combat.round
    : current.key + ":" + state.combat.round;
  const newest = Math.max(0, ...(state.actions ?? []).map(action => Number(action.id) || 0));
  if (key !== dmTurnKey) {
    // Story lines after this are this turn's. The mark is kept on the device,
    // so a reload mid-turn still counts what was already done this turn.
    const saved = String(storage.get(DM_TURN_KEY()) ?? "").split("|");
    dmTurnStart = saved[0] === key && Number(saved[1]) <= newest ? Number(saved[1]) : newest;
    storage.set(DM_TURN_KEY(), key + "|" + dmTurnStart);
  }
  const playerTurn = current && current.kind === "pc";
  if (key === dmTurnKey && !playerTurn) return; // keep rolled attacks on screen between polls
  dmTurnKey = key;
  const title = document.createElement("h3");
  title.className = "display xs";
  const note = document.createElement("p");
  note.className = "fineprint";
  if (!current) {
    const waiting = order.filter(entry => entry.kind === "pc" && entry.initiative === null).map(entry => entry.name.replace(/^The /, ""));
    title.textContent = "Start the fight";
    note.textContent = (waiting.length ? "Still rolling initiative: " + waiting.join(", ") + ". You can type theirs in the order below. " : "Everyone has rolled. ")
      + "Tap Next turn to start round 1.";
    box.replaceChildren(title, note);
  } else if (enemy) {
    title.textContent = "🗡️ " + enemy.name + "'s turn";
    note.textContent = "Pick who it attacks and tap an attack: the app checks AC and offers the damage. Then narrate it and tap Next turn.";
    const card = enemyCard(enemy);
    // Removing an enemy stays on the DM tab, not one stray tap away mid-turn.
    for (const button of card.querySelectorAll("button")) if (button.textContent === "Remove") button.hidden = true;
    box.replaceChildren(title, note, card);
  } else if (current.kind === "enemy") {
    title.textContent = current.name + "'s turn";
    note.textContent = "Its stat card is on the DM tab.";
    box.replaceChildren(title, note);
  } else {
    title.textContent = current.name.replace(/^The /, "") + "'s turn";
    // What they've done this turn, from their story lines: attacks rolled
    // and turn features used, so the DM doesn't lose count.
    const lines = (state.actions ?? []).filter(action => Number(action.id) > dmTurnStart && action.name === current.name).map(action => String(action.text));
    const attacks = lines.filter(text => /^🎯 attacks |^🎯 missed |^🎯 hit .*critical/u.test(text)).length;
    const features = lines.filter(text => /^(⚡|✨|😤 starts)/u.test(text)).map(text => text.replace(/^\S+ (uses |starts )?/u, "").replace(/[:(].*$/, "").trim());
    const tally = document.createElement("p");
    tally.className = "turn-tally";
    tally.textContent = (attacks ? attacks + " attack" + (attacks === 1 ? "" : "s") + " so far" : "No attacks yet") + (features.length ? " · " + features.join(", ") : "");
    note.textContent = "Their to-hit rolls come to you to call hit or miss, then their damage to apply. When they tap End my turn the next turn starts by itself; or tap Next turn.";
    box.replaceChildren(title, tally, note);
  }
}

function drawCombat() {
  drawHp();
  drawHitReport();
  drawHitInbox();
  const combat = state?.combat;
  const available = Boolean(backend.combatSet) && !ended;
  document.body.classList.toggle("in-combat", Boolean(combat)); // shows the Attack-card links in Moves
  $("tab-combat").hidden = !combat;
  if (!combat && currentTab === "combat") showTab("scene");
  if (isHost) {
    $("enc-combat").hidden = !available || (!combat && !enemies.length);
    if (!armedButtons.has($("enc-combat"))) { // a pending "Tap again" keeps its question
      $("enc-combat").textContent = combat ? "End combat" : "Start combat";
      $("enc-combat").className = combat ? "danger-soft" : "cta";
    }
    if (combat) $("enc-combat-status").textContent = "Combat is live. Players see names, initiative, and Healthy / Bloodied / Down — never HP or AC.";
    // The last enemy fell: offer to end the fight instead of leaving a turn open.
    const won = Boolean(combat) && available && encounterLoaded && enemies.length > 0 && standing(enemies) === 0;
    $("combat-won").hidden = !won;
    if (won) $("enc-combat-status").textContent = "Every enemy is down. Tap End combat when the fight's over.";
  }
  if (!combat) { drawTurnGuide(); drawDmTurn(null, []); return; }

  const order = liveOrder();
  const me = myIndex();
  const myKey = me === null ? null : "pc:" + me;
  const current = order.find(entry => entry.key === combat.turn);
  const nextKey = upNext(order, combat.turn);
  const next = order.find(entry => entry.key === nextKey);
  $("combat-round").textContent = String(combat.round);
  $("combat-head").classList.toggle("is-my-turn", Boolean(current && current.key === myKey));
  $("combat-turn").textContent = !current ? (isHost ? "Ready when you are" : "Roll initiative")
    : current.key === myKey ? "Your turn!" : current.name + (current.kind === "enemy" ? " acts" : "'s turn");
  $("combat-next").textContent = !current ? (isHost ? "Tap Next turn to start round 1. Players can still add their initiative." : "The DM starts the first turn once everyone has rolled.")
    : next ? (next.key === myKey ? "You're up next — get ready." : "Up next: " + next.name) : "";
  const meOut = !isHost && me !== null && isSittingOut(combat, me);
  if (meOut && !current) $("combat-turn").textContent = "You're sitting out";
  const foes = order.filter(entry => entry.kind === "enemy");
  const up = foes.filter(entry => entry.status !== "down").length;
  $("combat-foes").textContent = foes.length ? up + " of " + foes.length + " enemies standing" : "No enemies yet";
  $("combat-dm").hidden = !isHost;
  // The DM can stop a fight at any point (a surrender, a story turn), not
  // only once every enemy is down.
  $("combat-stop").hidden = !isHost || !available;
  const myTurn = Boolean(current && current.key === myKey);
  $("combat-ask").hidden = !myTurn || !state?.ai || ended;
  $("combat-end-turn").hidden = !myTurn || !backend.postAction || !Array.isArray(state?.actions);
  if (!myTurn) { $("combat-end-turn").disabled = false; $("combat-end-turn").textContent = "End my turn ▶"; }

  const mine = me === null ? undefined : combat.party?.[me];
  $("combat-init").hidden = isHost || Number.isFinite(mine) || meOut; // rolled: it's in the order below
  $("init-title").textContent = Number.isFinite(mine) ? "Your initiative: " + mine : "Your initiative";
  $("init-roll").textContent = "Roll " + initiativeExpression() + (initiativeMode() === "advantage" ? " (advantage)" : "");
  $("combat-hint").hidden = isHost;
  drawTurnGuide();
  drawDmTurn(current, order);

  const local = isHost && encounterLoaded ? Object.fromEntries(enemies.map(enemy => ["en:" + enemy.id, enemy])) : {};
  $("combat-order").replaceChildren(...order.map(entry => {
    const item = document.createElement("li");
    item.className = "combatant is-" + entry.kind + (entry.status === "down" ? " is-down" : "")
      + (entry.key === combat.turn ? " is-turn" : "") + (entry.key === myKey ? " is-me" : "");
    const score = document.createElement("b");
    score.className = "init";
    score.textContent = entry.initiative ?? "–";
    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = entry.name + (entry.key === myKey ? " (you)" : "");
    const meta = document.createElement("div");
    meta.className = "chips";
    const tag = document.createElement("span");
    if (entry.kind === "enemy") {
      tag.className = "state is-" + entry.status;
      tag.textContent = STATUS_TEXT[entry.status] ?? "Healthy";
      meta.append(tag);
      const own = local[entry.key];
      if (own) {
        const hp = document.createElement("span");
        hp.textContent = "HP " + own.hp + "/" + own.maxHp + " · AC " + own.ac;
        meta.append(hp);
      }
      for (const condition of entry.conditions) {
        const chip = document.createElement("span");
        chip.className = "cond";
        chip.textContent = (conditionByName[condition]?.icon ?? "") + " " + condition;
        meta.append(chip);
      }
    } else {
      const record = state.hp?.[entry.name];
      const health = partyHpStatus(record);
      tag.className = "state is-party" + (record ? " is-" + health : "");
      tag.textContent = record ? (health === "down" ? "Down" : "HP " + record.hp + "/" + record.max + (record.temp ? " +" + record.temp : "")) : "Party";
      meta.append(tag);
      const armor = combatStats(sheets[entry.name], record).find(stat => stat.label === "AC");
      if (armor) {
        const chip = document.createElement("span");
        chip.textContent = "AC " + armor.value + (armor.unconfirmed ? "?" : "");
        meta.append(chip);
      }
      if (entry.initiative === null) {
        const waiting = document.createElement("span");
        waiting.textContent = "hasn't rolled";
        meta.append(waiting);
      }
    }
    body.append(name, meta);
    item.append(score, body);
    if (entry.key === combat.turn) {
      const now = document.createElement("em");
      now.textContent = "NOW";
      item.append(now);
    }
    if (isHost && entry.kind === "pc") {
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.className = "init-input";
      input.placeholder = "Init";
      input.value = entry.initiative ?? "";
      input.setAttribute("aria-label", "Initiative for " + entry.name);
      input.onchange = () => setInitiative(entry.character, input.value, $("combat-status"));
      const out = document.createElement("button");
      out.type = "button";
      out.className = "quiet sit-out";
      out.textContent = "Sit out";
      out.title = "Not in this fight (elsewhere in the story): no turn and no initiative prompt";
      out.setAttribute("aria-label", "Sit " + entry.name + " out of this fight");
      out.onclick = () => setSittingOut(entry.character, true, out);
      item.append(input, out);
    }
    return item;
  }), ...sittingOut(combat, state.party).map(index => {
    // Not in this fight: listed after the order, with no turn.
    const item = document.createElement("li");
    item.className = "combatant is-pc is-out" + (index === me ? " is-me" : "");
    const score = document.createElement("b");
    score.className = "init";
    score.textContent = "–";
    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = partyName(index) + (index === me && !isHost ? " (you)" : "");
    const meta = document.createElement("div");
    meta.className = "chips";
    const tag = document.createElement("span");
    tag.textContent = "sitting out this fight";
    meta.append(tag);
    body.append(name, meta);
    item.append(score, body);
    if (isHost) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ghost sit-out";
      back.textContent = "Join fight";
      back.setAttribute("aria-label", "Bring " + partyName(index) + " into this fight");
      back.onclick = () => setSittingOut(index, false, back);
      item.append(back);
    }
    return item;
  }));
}

// The DM sits a character out of the fight (or brings them back). If it was
// their turn, the turn moves on first, so the fight isn't left on nobody.
async function setSittingOut(character, out, button) {
  if (!backend.combatSitOut || !state?.combat) return;
  button.disabled = true;
  try {
    const step = out && state.combat.turn === "pc:" + character
      ? nextTurn(liveOrder(), state.combat.turn, state.combat.round, 1) : null;
    await backend.combatSitOut(room, character, out);
    const party = { ...state.combat.party };
    if (out) party[character] = "out"; else delete party[character];
    state.combat = { ...state.combat, party };
    if (step) await publishCombat(step);
    $("combat-status").textContent = partyName(character) + (out ? " sits out this fight." : " joins the fight: they can roll initiative now.");
    drawCombat();
    sync();
  } catch (error) {
    button.disabled = false;
    $("combat-status").textContent = /could not find the function/i.test(error.message)
      ? "Sitting out needs the latest database update (migration 0018)." : error.message;
  }
}

// ── Who's at the table: each player's phone checks in every 20 seconds with
// the character it's playing (migration 0015, or the local server), and the
// DM's Party HP card lists who's here before anyone posts. ──
const here = { at: 0, character: null, off: false };
function sayHere() {
  if (isHost || boardMode || ended || here.off || !backend.here || !state?.party) return;
  const me = Number($("character").value);
  if (!state.party[me] || (here.character === me && Date.now() - here.at < 20000)) return;
  Object.assign(here, { at: Date.now(), character: me });
  backend.here(room, me).catch(error => { if (/could not find the function/i.test(error.message)) here.off = true; });
}
// The table keeps one presence row per account, so a phone that plays two
// characters only reports the one picked last. The DM's phone remembers each
// character it has seen for a few minutes, so the list doesn't flicker as
// that phone switches between them.
const hereSeen = new Map(); // character index → when it was last seen (ms)
const HERE_MEMORY = 5 * 60 * 1000;
function drawHere() {
  const line = $("here-line");
  line.hidden = !isHost || !Array.isArray(state?.here);
  if (line.hidden) return;
  const now = Date.now();
  for (const entry of state.here) hereSeen.set(entry.character, Math.max(hereSeen.get(entry.character) ?? 0, now - (Number(entry.seconds) || 0) * 1000));
  const present = new Set([...hereSeen].filter(([, at]) => now - at < HERE_MEMORY).map(([character]) => character));
  const names = index => partyName(index).replace(/^The /, "");
  const inRoom = state.party.map((_, index) => index).filter(index => present.has(index));
  const away = state.party.map((_, index) => index).filter(index => !present.has(index));
  const strong = document.createElement("strong");
  strong.textContent = inRoom.length ? "At the table: " + inRoom.map(names).join(", ") : "No players' phones here yet.";
  line.replaceChildren(strong, away.length && inRoom.length ? " · not here yet: " + away.map(names).join(", ") : "");
}

// ── Party hit points (shared; anyone at the table can change them) ──
const HP_LABEL = { ok: "", bloodied: "Bloodied", down: "Down — death saves", unknown: "" };
const hpAvailable = () => Boolean(backend.setHp) && Boolean(state) && !state.hpUnavailable && !ended;
const partyName = index => state?.party[index]?.name;
const hpRecord = index => state?.hp?.[partyName(index)];
function sheetMaxHp(index) {
  const line = (sheets[partyName(index)]?.combat ?? []).find(([label]) => label === "HP");
  return line ? maxHpFromSheet(line[1]) : null;
}
const enemyTargets = new Map(); // enemy id → party index the DM picked
// { low, high, unconfirmed, text } or null: an unconfirmed sheet AC is a
// range shown as "18–20?" until the DM sets the real number.
const partyAc = index => acRange(sheets[partyName(index)], hpRecord(index));
function hpText(record) {
  return record ? record.hp + " / " + record.max + (record.temp ? " (+" + record.temp + " temp)" : "") : "Not set";
}
// Concentrating and hurt, from any source (the DM's Apply, an enemy card, your
// own Damage): show the Constitution save DC here and tell the table, so the
// DM sees it too.
// Every character this phone plays (a shared phone plays several): a hit on
// any of them while they're concentrating leaves a save waiting for them,
// shown with a Roll button whenever that character is picked, until it's
// rolled. (Checking only the picked character lost the save on a shared
// phone in a playtest.)
const concentratingHere = index => Boolean(readJson("dnd-conditions:" + room + ":" + index, {}).Concentrating);
const pendingKey = () => "dnd-conc-pending:" + room;
const pendingSaves = () => readJson(pendingKey(), []);
function concentrationCheck(index, damage, key = "") {
  if (isHost || damage <= 0 || !concentratingHere(index)) return "";
  if ((hpRecord(index)?.hp ?? 1) <= 0) return ""; // knocked out: concentration simply ends
  // Each hit once: a story line is processed once by its id.
  if (key && concentrationSeen.keys.has(key)) return "";
  if (key) concentrationSeen.keys.add(key);
  if (key && pendingSaves().some(save => save.key === key)) return "";
  const dc = concentrationDc(damage);
  // Its own id, so passing one save clears only that one (damage typed on
  // this phone has no story line to name it).
  const id = key || "local:" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2, 8);
  storage.set(pendingKey(), JSON.stringify([...pendingSaves(), { index, damage, dc, key, id }].slice(-20)));
  const text = "🧠 " + partyName(index).replace(/^The /, "") + ": Concentration save, DC " + dc + " Constitution, or the spell ends.";
  $("notice").textContent = text;
  navigator.vibrate?.(200);
  tellTable(index, "🧠 took " + damage + " damage while concentrating: DC " + dc + " Constitution save");
  drawConcentration();
  return text;
}
// The waiting saves for the picked character, with one Roll button.
function drawConcentration() {
  const me = Number($("character").value);
  const mine = isHost ? [] : pendingSaves().filter(save => save.index === me);
  for (const box of document.querySelectorAll(".conc-save")) {
    box.hidden = !mine.length;
    if (!mine.length) { box.replaceChildren(); continue; }
    const save = mine[0];
    const title = document.createElement("p");
    title.className = "conc-title";
    title.textContent = "🧠 " + partyName(me).replace(/^The /, "") + " took " + save.damage + " damage while concentrating";
    const what = document.createElement("p");
    what.className = "fineprint";
    what.textContent = "Constitution save, DC " + save.dc + ": make it or the spell ends." + (mine.length > 1 ? " (" + mine.length + " hits: one save each.)" : "");
    const con = abilityMods(sheets[partyName(me)]).find(entry => entry.ability === "CON")?.save ?? 0;
    const roll = document.createElement("button");
    roll.type = "button";
    roll.className = "cta";
    roll.textContent = "Roll Con save (" + (con >= 0 ? "+" : "") + con + ")";
    roll.onclick = () => openDice("d20" + (con >= 0 ? "+" : "") + con, "Concentration save", total => {
      dice.onResult = null;
      const held = total >= save.dc;
      // Held: just this save is done. Failed: the spell ends, so all of
      // this character's waiting saves go (other characters' stay).
      const left = pendingSaves().filter(entry => held ? (entry.id ?? entry.key) !== (save.id ?? save.key) : entry.index !== me);
      storage.set(pendingKey(), JSON.stringify(left));
      $("dice-status").textContent = held ? "✓ " + total + " vs DC " + save.dc + ": you keep concentrating." : "✗ " + total + " vs DC " + save.dc + ": the spell ends.";
      tellTable(me, held ? "🧠 keeps concentrating (Con save " + total + " vs DC " + save.dc + ")" : "🧠 loses concentration (Con save " + total + " vs DC " + save.dc + ")");
      if (!held) setCondition("Concentrating", 0);
      drawConcentration();
      setTimeout(closeDice, 1500);
    });
    box.replaceChildren(title, what, roll);
  }
}
const concentrationSeen = { keys: new Set(), lastAction: null };
// Knocked to 0 HP: concentration ends (5e), wherever the damage came from.
function concentrationEndsAtZero() {
  if (isHost || !state?.party?.length) return;
  const me = Number($("character").value);
  const record = hpRecord(me);
  if (!record || record.hp > 0 || !activeConditions().Concentrating) return;
  $("notice").textContent = "🧠 Down at 0 HP: your concentration ends.";
  storage.set(pendingKey(), JSON.stringify(pendingSaves().filter(save => save.index !== me)));
  setCondition("Concentrating", 0);
  drawConcentration();
}
// Damage from another phone. Where the story is shared (hosted), the phone
// that entered it posts "🩸 takes 12 damage" for that character, so each hit
// gets its own save (two hits between polls are two saves, and healing in
// between can't hide one). Without a shared story (local server), fall back
// to the drop in HP between two polls.
function checkRemoteDamage(previous, fresh) {
  const me = Number($("character").value);
  const name = partyName(me);
  if (Array.isArray(fresh.actions)) {
    const newest = Math.max(0, ...fresh.actions.map(action => Number(action.id) || 0));
    if (concentrationSeen.lastAction === null) { concentrationSeen.lastAction = newest; return; } // not the history
    for (const action of fresh.actions) {
      const hurt = Number(action.id) > concentrationSeen.lastAction && String(action.text).match(/^🩸 takes (\d+) damage/u);
      const index = hurt ? (state.party ?? []).findIndex(character => character.name === action.name) : -1;
      if (hurt && index >= 0) concentrationCheck(index, Number(hurt[1]), "action:" + action.id);
    }
    concentrationSeen.lastAction = Math.max(concentrationSeen.lastAction, newest);
    return;
  }
  const before = previous.hp?.[name];
  const after = fresh.hp?.[name];
  if (before && after) concentrationCheck(me, (before.hp + (before.temp ?? 0)) - (after.hp + (after.temp ?? 0)));
}
// sameHit: more damage from a hit already applied (an attack's poison rider):
// not a fresh hit, so no extra death-save failure or concentration save.
async function adjustHp(index, change, status, { sameHit = false } = {}) {
  const record = hpRecord(index);
  if (!record) { status.textContent = "Set max HP first."; return; }
  state.hp = { ...state.hp, [partyName(index)]: changePartyHp(record, change) };
  // Hurt while already down: a death save failure, whoever entered the damage
  // (the DM's Apply too). Stable and hurt again: death saves start over.
  if (change < 0 && record.hp <= 0 && !sameHit) {
    const saves = readDeath(index);
    if (saves.failures < 3) {
      const stable = saves.successes >= 3;
      writeDeath(index, { successes: stable ? 0 : saves.successes, failures: saves.failures + 1,
        last: "Took " + -change + " damage while down: one failure" + (stable ? " (no longer stable)" : "") });
      if (!(!isHost && index === Number($("character").value))) tellTable(index, "💀 took " + -change + " damage while down: a death save failure (" + (saves.failures + 1) + " ✗)");
    }
  }
  if (change > 0 && record.hp <= 0) clearDeath(index); // any healing brings them back
  drawCombat();
  const own = !isHost && index === Number($("character").value);
  const reminder = change < 0 && own && !sameHit ? concentrationCheck(index, -change) : "";
  // Someone else's HP: a story line, so their phone can ask for a concentration
  // save for this hit (and the table hears about it).
  // (Already down: the death-save line above says it; concentration is over.)
  if (change < 0 && !own && record.hp > 0) tellTable(index, sameHit ? "🩸 takes " + -change + " more damage from the same hit" : "🩸 takes " + -change + " damage");
  try {
    await backend.adjustHp(room, index, change);
    if (reminder) status.textContent = reminder;
  } catch (error) {
    status.textContent = error.message;
  }
  await sync();
  concentrationEndsAtZero();
  if (reminder) {
    for (const id of ["hp-sheet", "hp-combat"]) {
      const note = $(id).querySelector(".hp-status");
      if (note) note.textContent = reminder;
    }
  }
}
async function saveHp(index, values, status) {
  const max = Math.round(Number(values.max));
  if (!(max >= 1 && max <= 999)) { status.textContent = "Max HP must be 1 to 999."; return; }
  const ac = values.ac === undefined || values.ac === "" || values.ac === null ? undefined : Math.round(Number(values.ac));
  if (ac !== undefined && !(ac >= 1 && ac <= 40)) { status.textContent = "AC must be 1 to 40."; return; }
  const current = values.hp === undefined || values.hp === null || values.hp === "" ? max : Number(values.hp);
  if (!Number.isFinite(current)) { status.textContent = "Current HP must be a number."; return; }
  const record = { max, hp: Math.max(0, Math.min(max, Math.round(current))), temp: Math.max(0, Math.round(Number(values.temp) || 0)) };
  const keptAc = ac ?? hpRecord(index)?.ac;
  if (keptAc) record.ac = keptAc;
  state.hp = { ...state.hp, [partyName(index)]: record };
  if (record.hp > 0) clearDeath(index); // back above 0 (Set HP, Full heal, Everyone to full)
  drawCombat();
  try {
    await backend.setHp(room, index, record);
  } catch (error) {
    status.textContent = error.message;
  }
  sync();
}
function hpWidget(index, { compact = false, open = false } = {}) {
  const record = hpRecord(index);
  const health = partyHpStatus(record);
  const box = document.createElement("div");
  box.className = "hp-widget is-" + health + (compact ? " is-compact" : "");
  const head = document.createElement("div");
  head.className = "hp-head";
  const title = document.createElement(compact ? "strong" : "p");
  title.className = compact ? "hp-name" : "eyebrow red";
  title.textContent = compact ? partyName(index) : "HIT POINTS · " + partyName(index).toUpperCase();
  const numbers = document.createElement("p");
  numbers.className = "hp-numbers";
  numbers.textContent = hpText(record);
  head.append(title, numbers);
  box.append(head);
  if (!compact) {
    const mods = abilityMods(sheets[partyName(index)]);
    if (mods.length) {
      const grid = document.createElement("div");
      grid.className = "ability-roll-grid";
      grid.setAttribute("aria-label", "Ability checks and saving throws");
      const signed = value => (value >= 0 ? "+" : "−") + Math.abs(value);
      const expr = value => "d20" + (value >= 0 ? "+" : "-") + Math.abs(value);
      for (const entry of mods) {
        const cell = document.createElement("div");
        cell.className = "ability-roll";
        const name = document.createElement("span");
        name.textContent = entry.ability;
        const check = document.createElement("button");
        check.type = "button";
        check.className = "ability-check";
        check.textContent = signed(entry.mod);
        check.setAttribute("aria-label", "Roll a " + entry.ability + " check (" + signed(entry.mod) + ")");
        check.onclick = () => openDice(expr(entry.mod), entry.ability + " check");
        const save = document.createElement("button");
        save.type = "button";
        save.className = "ability-save" + (entry.proficient ? " is-proficient" : "");
        save.textContent = "save " + signed(entry.save);
        save.setAttribute("aria-label", "Roll a " + entry.ability + " saving throw (" + signed(entry.save) + ")");
        save.onclick = () => openDice(expr(entry.save), entry.ability + " save");
        cell.append(name, check, save);
        grid.append(cell);
      }
      box.append(grid);
    }
  }
  const stats = combatStats(sheets[partyName(index)], record);
  if (stats.length) {
    const strip = document.createElement(compact ? "p" : "div");
    strip.className = compact ? "stat-line" : "stat-grid combat-stats";
    if (compact) strip.textContent = stats.map(stat => stat.label.replace("Passive Perc.", "PP") + " " + stat.value + (stat.unconfirmed ? "?" : "")).join(" · ")
      + (sheets[partyName(index)]?.resources?.length ? "\n" + resourceSummary(index) : "");
    else {
      strip.replaceChildren(...stats.map(stat => {
        const tile = document.createElement("div");
        tile.className = "stat" + (stat.unconfirmed ? " is-unconfirmed" : "");
        const number = document.createElement("strong");
        number.textContent = stat.value;
        const label = document.createElement("span");
        label.textContent = stat.label;
        tile.append(number, label);
        return tile;
      }));
    }
    box.append(strip);
  }
  if (record) {
    const bar = document.createElement("div");
    bar.className = "hp-bar";
    const fill = document.createElement("i");
    fill.style.width = Math.round(record.hp / record.max * 100) + "%";
    bar.append(fill);
    box.append(bar);
    if (HP_LABEL[health]) {
      const note = document.createElement("p");
      note.className = "hp-state";
      const saves = health === "down" ? readDeath(index) : null;
      note.textContent = HP_LABEL[health] + (saves && (saves.successes || saves.failures)
        ? " · " + (saves.failures >= 3 ? "☠️ dead" : saves.successes >= 3 ? "stable" : saves.successes + " ✓ " + saves.failures + " ✗") : "");
      box.append(note);
    }
    if (health === "down" && !compact && !isHost && index === Number($("character").value)) box.append(deathSaveBox(index));
  }
  const status = document.createElement("p");
  status.className = "fineprint hp-status";
  if (record) {
    const row = document.createElement("form");
    row.className = "hp-adjust";
    const amount = document.createElement("input");
    amount.type = "number";
    amount.min = "1";
    amount.inputMode = "numeric";
    amount.placeholder = "Amount";
    amount.setAttribute("aria-label", "HP amount for " + partyName(index));
    const damage = document.createElement("button");
    damage.type = "submit";
    damage.className = "danger-soft";
    damage.textContent = "Damage";
    const heal = document.createElement("button");
    heal.type = "button";
    heal.className = "ghost";
    heal.textContent = "Heal";
    const go = sign => {
      const value = Math.abs(Math.round(Number(amount.value)));
      if (!value) { amount.focus(); return; }
      amount.value = "";
      adjustHp(index, sign * value, status);
    };
    row.onsubmit = event => { event.preventDefault(); go(-1); };
    heal.onclick = () => go(1);
    row.append(amount, damage, heal);
    if (!compact && !isHost && readRes(index).raging) {
      const halfDamage = document.createElement("button");
      halfDamage.type = "button";
      halfDamage.className = "danger-soft rage-half";
      halfDamage.textContent = "½ (rage)";
      halfDamage.title = "Raging: half damage from bludgeoning, piercing, or slashing";
      halfDamage.onclick = () => {
        const value = Math.abs(Math.round(Number(amount.value)));
        if (!value) { amount.focus(); return; }
        amount.value = "";
        adjustHp(index, -Math.floor(value / 2), status);
      };
      row.classList.add("has-rage");
      row.append(halfDamage);
    }
    box.append(row, status);
  } else {
    const max = sheetMaxHp(index);
    const hint = document.createElement("p");
    hint.className = "fineprint";
    hint.textContent = max ? "The sheet says max " + max + ". Start full, or set the current HP below." : "Enter max and current HP below.";
    box.append(hint);
    if (max) {
      const full = document.createElement("button");
      full.type = "button";
      full.className = "cta";
      full.textContent = "Start at full (" + max + ")";
      full.onclick = () => saveHp(index, { hp: max, max, temp: 0 }, status);
      box.append(full);
    }
  }
  const more = document.createElement("details");
  more.className = "fold";
  more.open = open || (!record && !sheetMaxHp(index));
  const summary = document.createElement("summary");
  summary.textContent = record ? "Set HP, max, temp, or AC" : "Set HP and AC";
  const form = document.createElement("form");
  form.className = "hp-set";
  const field = (label, value) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.max = "999";
    input.value = value ?? "";
    wrap.append(input);
    return [wrap, input];
  };
  const fallbackMax = record?.max ?? sheetMaxHp(index) ?? "";
  const [hpLabel, hpInput] = field("Current", record?.hp ?? fallbackMax);
  const [maxLabel, maxInput] = field("Max", fallbackMax);
  const [tempLabel, tempInput] = field("Temp", record?.temp ?? 0);
  // An unconfirmed sheet AC ("20 or 16?") stays blank, so saving HP never
  // confirms it by accident; the DM types the real number to confirm it.
  const sheetAc = combatStats(sheets[partyName(index)]).find(stat => stat.label === "AC");
  const [acLabel, acInput] = field("AC", record?.ac ?? (sheetAc && !sheetAc.unconfirmed ? sheetAc.value : ""));
  if (!record?.ac && sheetAc?.unconfirmed) acInput.placeholder = sheetAc.value + "?";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "ghost";
  save.textContent = "Save";
  const rest = document.createElement("button");
  rest.type = "button";
  rest.className = "quiet";
  rest.textContent = "Full heal (long rest)";
  rest.hidden = !record;
  rest.onclick = () => saveHp(index, { hp: record.max, max: record.max, temp: 0, ac: record.ac }, status);
  form.onsubmit = event => {
    event.preventDefault();
    saveHp(index, { hp: hpInput.value, max: maxInput.value, temp: tempInput.value, ac: acInput.value }, status);
  };
  const fields = document.createElement("div");
  fields.className = "hp-fields";
  fields.append(hpLabel, maxLabel, tempLabel, acLabel);
  form.append(fields, save, rest);
  more.append(summary, form);
  box.append(more);
  if (!status.isConnected && !record) box.append(status);
  return box;
}
// ── Death saves, kept on the player's phone; each roll is posted so the DM
// sees it. Cleared when the character is back above 0 HP. ──
// The counts live in the character's shared resources record (as two "used"
// entries), so the DM and any phone see the same death saves; "last" (the
// latest roll, in words) stays on the phone that rolled it.
const deathKey = index => "dnd-death:" + room + ":" + index;
const DEATH_OK = "Death successes";
const DEATH_FAIL = "Death failures";
function readDeath(index) {
  const used = readRes(index).used ?? {};
  const local = readJson(deathKey(index), {});
  return { successes: Number(used[DEATH_OK]) || 0, failures: Number(used[DEATH_FAIL]) || 0, last: local.last ?? "", round: local.round ?? null };
}
// The round of the last death save rolled in a fight, so a second roll on
// the same turn doesn't count. Outside a fight there's no limit.
const deathRolledThisRound = index => Boolean(state?.combat?.round) && readDeath(index).round === state.combat.round;
// A fight started or ended: a save from the last fight doesn't lock this one
// (the counts stay; only the round is forgotten).
function forgetDeathRounds() {
  (state?.party ?? []).forEach((_, index) => {
    const local = readJson(deathKey(index), null);
    if (local?.round != null) storage.set(deathKey(index), JSON.stringify({ ...local, round: null }));
  });
}
function writeDeath(index, { successes, failures, last, round }) {
  const res = readRes(index);
  const used = { ...(res.used ?? {}) };
  if (successes) used[DEATH_OK] = successes; else delete used[DEATH_OK];
  if (failures) used[DEATH_FAIL] = failures; else delete used[DEATH_FAIL];
  saveRes(index, { ...res, used });
  if (last !== undefined) storage.set(deathKey(index), JSON.stringify({ last, round: round === undefined ? readJson(deathKey(index), {}).round ?? null : round }));
}
function clearDeath(index) {
  const used = readRes(index).used ?? {};
  if (used[DEATH_OK] || used[DEATH_FAIL]) writeDeath(index, { successes: 0, failures: 0, last: "" });
  else if (storage.get(deathKey(index))) storage.remove(deathKey(index));
}
function deathSaveBox(index) {
  const saves = readDeath(index);
  const box = document.createElement("div");
  box.className = "death-saves";
  const row = (label, key, mark) => {
    const line = document.createElement("div");
    line.className = "death-row is-" + key;
    const name = document.createElement("span");
    name.textContent = label;
    line.append(name);
    for (let n = 1; n <= 3; n++) {
      const pip = document.createElement("button");
      pip.type = "button";
      pip.className = "pip" + (saves[key] >= n ? " is-on" : "");
      pip.textContent = saves[key] >= n ? mark : "";
      pip.setAttribute("aria-label", label + " " + n);
      pip.onclick = () => {
        writeDeath(index, { ...readDeath(index), [key]: saves[key] >= n ? n - 1 : n, last: "" });
        drawHp();
      };
      line.append(pip);
    }
    return line;
  };
  const outcome = saves.failures >= 3 ? "dead" : saves.successes >= 3 ? "stable" : null;
  const title = document.createElement("p");
  title.className = "death-title";
  title.textContent = outcome === "dead" ? "☠️ Dead — talk to the DM" : outcome === "stable" ? "Stable — unconscious at 0 HP" : "Death saves";
  const rollButton = document.createElement("button");
  rollButton.type = "button";
  rollButton.className = "cta";
  const rolled = !outcome && deathRolledThisRound(index);
  rollButton.textContent = rolled ? "Rolled this round: next save on your next turn" : "Roll death save";
  rollButton.disabled = rolled;
  rollButton.hidden = Boolean(outcome);
  rollButton.onclick = () => openDice("d20", "Death save", async natural => {
    // The tray stays open: once there's an outcome (or they're back up),
    // further rolls don't count.
    const before = readDeath(index);
    if (before.successes >= 3 || before.failures >= 3 || (hpRecord(index)?.hp ?? 0) > 0) {
      dice.onResult = null;
      $("dice-status").textContent = "No death save needed now.";
      return;
    }
    if (deathRolledThisRound(index)) {
      dice.onResult = null;
      $("dice-status").textContent = "Already rolled this round: one death save per turn.";
      return;
    }
    const result = deathSave(before, natural);
    const { outcome: what, ...counts } = result;
    const summary = what === "revived" ? "natural 20 — back up with 1 HP!"
      : what === "dead" ? "fails — dead" : what === "stable" ? "succeeds — stable"
      : (natural >= 10 ? "success" : natural === 1 ? "natural 1, two failures" : "failure") + " (" + counts.successes + " ✓ / " + counts.failures + " ✗)";
    const round = state?.combat?.round ?? null;
    writeDeath(index, what === "revived" ? { successes: 0, failures: 0, last: "Rolled 20: back up with 1 HP!", round } : { ...counts, last: "Rolled " + natural + ": " + summary, round });
    // One death save per turn: say it's recorded, then close the tray.
    $("dice-status").textContent = "✓ Recorded. Death save " + natural + ": " + summary;
    dice.onResult = null;
    setTimeout(closeDice, 1800);
    if (what === "revived") await adjustHp(index, 1, $("dice-status"));
    if (backend.postAction && Array.isArray(state?.actions)) {
      backend.postAction(room, index, "💀 death save " + natural + ": " + summary).then(sync).catch(() => {});
    }
    drawHp();
  });
  const hint = document.createElement("p");
  hint.className = "fineprint";
  hint.textContent = "Roll once at the start of each of your turns. Damage while down is a failure (counted for you when it's entered here; a critical hit is two, tap a box). Any healing brings you back.";
  const last = document.createElement("p");
  last.className = "death-last";
  last.textContent = saves.last ? "Recorded · " + saves.last : "";
  last.hidden = !saves.last;
  box.append(title, row("Successes", "successes", "✓"), row("Failures", "failures", "✗"), last, rollButton, hint);
  return box;
}

// ── Resources: spell slots and per-rest features (Rage, Channel Divinity,
// superiority dice…), kept on this phone for each character. Campaign tables
// share one record (so it carries between sessions); a practice table has its
// own. Rage and rests are posted to the story so the DM sees them. ──
const ORDINAL = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th" };
const resKey = index => "dnd-res:" + (isPractice() ? room : "campaign") + ":" + partyName(index);
// Shared through the room (migration 0007 / the local server) when
// available, with this phone's copy as the fallback.
const resShared = () => Boolean(backend.setResources) && state?.resources !== undefined && state?.resources !== null;
function readRes(index) {
  const shared = resShared() ? state.resources[partyName(index)] : undefined;
  return shared ?? readJson(resKey(index), null) ?? { used: {}, raging: false };
}
function saveRes(index, value) {
  storage.set(resKey(index), JSON.stringify(value));
  if (!resShared()) return;
  state.resources = { ...state.resources, [partyName(index)]: value };
  backend.setResources(room, index, value).catch(error => { $("notice").textContent = "Couldn't save resources: " + error.message; });
}
// A rage lasts a minute: it ends with the fight. The DM's End combat clears it
// for everyone when resources are shared; otherwise each phone clears its own.
function endRages() {
  (state?.party ?? []).forEach((character, index) => {
    if (readRes(index).raging) saveRes(index, { ...readRes(index), raging: false });
  });
  drawHp();
}
// A rage that ended after a Frenzy swing owes a level of exhaustion. The
// flag and the exhaustion both live on the barbarian's own phone (like
// conditions), so it settles there however the rage ended: End rage, the
// DM's End combat, or a rest.
const FRENZY_KEY = index => "dnd-frenzy:" + room + ":" + index;
function settleFrenzy(index) {
  if (isHost || !storage.get(FRENZY_KEY(index)) || readRes(index).raging) return;
  storage.remove(FRENZY_KEY(index));
  setCondition("Exhaustion", (activeConditions().Exhaustion ?? 0) + 1);
  $("condition-status").textContent = "Frenzy's price: one level of exhaustion (a long rest removes one).";
}
function writeRes(index, value) {
  saveRes(index, value);
  showOptions();
}
// What this character can't use right now (out of slots or uses), so the
// suggestions and Ask Claude leave it out.
function spentFor(index) {
  const character = state?.party?.[index];
  const sheet = sheets[character?.name];
  return character && sheet ? spentAbilities(character, sheet, readRes(index)) : [];
}
// What Claude should know about the table right now: the fight (round, whose
// turn, the order, enemies only as Healthy/Bloodied/Down), this character's
// HP, AC, conditions, and what's left, and the party's HP.
function tableContext(index) {
  if (!state) return "";
  const name = partyName(index);
  const short = text => String(text).replace(/^The /, "");
  const lines = [];
  const combat = state.combat;
  if (combat) {
    const order = liveOrder();
    const current = order.find(entry => entry.key === combat.turn);
    lines.push("In combat, round " + combat.round + ". " + (!current ? "Initiative is still being rolled."
      : current.key === "pc:" + index ? "It is " + name + "'s turn right now." : "It is " + current.name + "'s turn (not " + short(name) + "'s)."));
    lines.push("Initiative order: " + order.map(entry => short(entry.name) + (entry.initiative !== null ? " " + entry.initiative : "")
      + (entry.kind === "enemy" ? " [enemy, " + (STATUS_TEXT[entry.status] ?? "Healthy") + (entry.conditions.length ? ", " + entry.conditions.join(", ") : "") + "]" : "")).join("; ") + ".");
  } else {
    lines.push("Not in combat right now.");
  }
  const record = hpRecord(index);
  const ac = partyAc(index);
  const res = readRes(index);
  const me = [
    record ? "HP " + record.hp + "/" + record.max + (record.temp ? " (+" + record.temp + " temp)" : "") + (record.hp <= 0 ? ", down and making death saves" : "") : "HP not tracked",
    ac ? "AC " + ac.text : "",
    res.raging ? "raging" : ""
  ].filter(Boolean);
  if (Number($("character").value) === index && !isHost) {
    const conditionsNow = Object.entries(activeConditions()).map(([condition, level]) => condition + (condition === "Exhaustion" ? " " + level : ""));
    if (conditionsNow.length) me.push("conditions: " + conditionsNow.join(", "));
  }
  lines.push(short(name) + ": " + me.join("; ") + ".");
  const sheet = sheets[name];
  const left = (sheet?.resources ?? []).map(resource => resource.slots
    ? "spell slots left by level (1st up): " + Object.keys(resource.slots).map(level => resourceLeft(sheet, res, slotKey(level)) + "/" + resource.slots[level]).join(", ")
    : resource.name + " " + resourceLeft(sheet, res, resource.name) + "/" + resource.max);
  if (left.length) lines.push("Left until a rest: " + left.join("; ") + ".");
  const others = state.party.map((member, other) => ({ member, other })).filter(({ other }) => other !== index)
    .map(({ member }) => {
      const hp = state.hp?.[member.name];
      return short(member.name) + (hp ? " " + (hp.hp <= 0 ? "DOWN" : hp.hp + "/" + hp.max) : "");
    });
  lines.push("Party HP: " + others.join(", ") + ".");
  return lines.join("\n").slice(0, 2000);
}

function resourceSummary(index) {
  const sheet = sheets[partyName(index)];
  const res = readRes(index);
  return (sheet?.resources ?? []).map(resource => resource.slots
    ? "Slots " + Object.keys(resource.slots).map(level => resourceLeft(sheet, res, slotKey(level))).join("·")
    : resource.name + " " + resourceLeft(sheet, res, resource.name) + "/" + resource.max + (resource.rage && res.raging ? " 😤" : "")).join(" · ");
}
function tellTable(index, text) {
  if (backend.postAction && Array.isArray(state?.actions) && !ended) backend.postAction(room, index, text).then(sync).catch(() => {});
}
function pips(total, left, onSet, label) {
  const row = document.createElement("div");
  row.className = "pips";
  for (let n = 0; n < total; n++) {
    const pip = document.createElement("button");
    pip.type = "button";
    pip.className = "pip" + (n < left ? " is-on" : "");
    pip.setAttribute("aria-label", label + ": " + (n < left ? "available — tap to use" : "used — tap to get back"));
    pip.onclick = () => onSet(n < left ? left - 1 : left + 1);
    row.append(pip);
  }
  return row;
}
function resourcesWidget(index) {
  const sheet = sheets[partyName(index)] ?? { resources: [] };
  const res = readRes(index);
  const box = document.createElement("div");
  box.className = "res-widget";
  const head = document.createElement("div");
  head.className = "res-head";
  const title = document.createElement("p");
  title.className = "eyebrow red";
  title.textContent = (sheet.resources?.length ? "RESOURCES · " : "RESTS · ") + partyName(index).toUpperCase();
  head.append(title);
  box.append(head);
  // Read the record at tap time: a widget kept across redraws must not write
  // back an older copy (death saves live in the same record).
  const set = (key, left) => {
    const max = resourceLeft(sheet, { used: {} }, key);
    const now = readRes(index);
    writeRes(index, { ...now, used: { ...now.used, [key]: Math.max(0, Math.min(max, max - left)) } });
  };
  for (const resource of sheet.resources ?? []) {
    const block = document.createElement("div");
    block.className = "res-block";
    const name = document.createElement("strong");
    name.textContent = resource.name;
    const per = document.createElement("span");
    per.className = "res-per";
    per.textContent = resource.per === "short" ? "back on a short or long rest" : resource.per === "never" ? "not refilled by rests; tap a dot when you get more" : "back on a long rest";
    const top = document.createElement("div");
    top.className = "res-top";
    top.append(name, per);
    block.append(top);
    if (resource.slots) {
      for (const [level, max] of Object.entries(resource.slots)) {
        const key = slotKey(level);
        const left = resourceLeft(sheet, res, key);
        const row = document.createElement("div");
        row.className = "slot-row";
        const label = document.createElement("span");
        label.textContent = ORDINAL[level];
        const count = document.createElement("span");
        count.className = "slot-count";
        count.textContent = left + "/" + max;
        row.append(label, pips(max, left, value => set(key, value), ORDINAL[level] + "-level slot"), count);
        block.append(row);
      }
      const how = document.createElement("details");
      how.className = "fold how-slots";
      const summary = document.createElement("summary");
      summary.textContent = "How spell slots work";
      const list = document.createElement("ul");
      for (const text of [
        "Cantrips (like Sacred Flame) are free: cast them as often as you like.",
        "Every other spell uses one slot of its level or higher. Fireball is 3rd level, so it needs a 3rd-, 4th-, or 5th-level slot.",
        "A higher slot makes some spells stronger (Fireball and Guiding Bolt: +1d6 for each level above their own).",
        "Casting from the Attack card spends the slot for you. Tap a dot to mark one used, or tap again to get it back.",
        "All slots come back after a long rest."
      ]) {
        const item = document.createElement("li");
        item.textContent = text;
        list.append(item);
      }
      how.append(summary, list);
      block.append(how);
    } else {
      const left = resourceLeft(sheet, res, resource.name);
      const row = document.createElement("div");
      row.className = "slot-row";
      const count = document.createElement("span");
      count.className = "slot-count";
      count.textContent = left + "/" + resource.max;
      row.append(pips(resource.max, left, value => set(resource.name, value), resource.name), count);
      block.append(row);
      if (resource.rage) {
        const rage = document.createElement("div");
        rage.className = "rage-box" + (res.raging ? " is-raging" : "");
        if (res.raging) {
          const text = document.createElement("p");
          text.textContent = "😤 RAGING: advantage on Strength checks and saves, +3 melee damage, half damage from bludgeoning, piercing, and slashing. Lasts 1 minute; ends early if you're knocked out or go a turn without attacking or taking damage.";
          const end = document.createElement("button");
          end.type = "button";
          end.className = "ghost";
          end.textContent = "End rage";
          end.onclick = () => {
            writeRes(index, { ...readRes(index), raging: false });
            tellTable(index, "😤 ends the rage");
          };
          rage.append(text, end);
        } else {
          const start = document.createElement("button");
          start.type = "button";
          start.className = "cta";
          start.disabled = left < 1;
          start.textContent = left < 1 ? "No rages left — long rest" : "Start rage (bonus action)";
          start.onclick = () => {
            const next = { ...spendResource(sheet, readRes(index), resource.name), raging: true };
            writeRes(index, next);
            markTurnUse(index, "Rage", "bonus");
            tellTable(index, "😤 starts raging (" + resourceLeft(sheet, next, resource.name) + " of " + resource.max + " rages left)");
          };
          rage.append(start);
        }
        block.append(rage);
      }
    }
    if (resource.note) {
      const note = document.createElement("p");
      note.className = "fineprint";
      note.textContent = resource.note;
      block.append(note);
    }
    box.append(block);
  }
  box.append(healingBlock(index, sheet, res));
  const rests = document.createElement("div");
  rests.className = "action-row rest-row";
  const shortRest = document.createElement("button");
  shortRest.type = "button";
  shortRest.className = "ghost";
  shortRest.textContent = "Short rest";
  shortRest.onclick = () => {
    // A short rest is an hour: mid-fight it's almost always a mistap.
    if (state?.combat && !confirmTap(shortRest, "In a fight! Tap again to rest anyway")) return;
    writeRes(index, restResources(sheet, readRes(index), "short"));
    tellTable(index, "🏕️ takes a short rest");
    if (hitDice(sheet) && hpRecord(index) && hpRecord(index).hp < hpRecord(index).max) {
      $("notice").textContent = "Short rest: spend Hit Dice under Healing to get HP back.";
    }
  };
  const longRest = document.createElement("button");
  longRest.type = "button";
  longRest.className = "ghost";
  longRest.textContent = "Long rest";
  longRest.onclick = () => {
    if (!confirmTap(longRest, "Tap again: refill everything and full HP")) return;
    writeRes(index, restResources(sheet, readRes(index), "long"));
    const record = hpRecord(index);
    if (record) saveHp(index, { hp: record.max, max: record.max, temp: 0, ac: record.ac }, document.createElement("p"));
    tellTable(index, "🛌 takes a long rest");
  };
  rests.append(shortRest, longRest);
  box.append(rests);
  return box;
}
// Healing in one place: the sheet's healing spells and features (Healing
// Word, Second Wind), a Potion of Healing for anyone, and Hit Dice on a short
// rest. Each rolls the dice, spends what it uses, and heals the target.
const POTION = { name: "Potion of Healing", heal: "2d4+2", note: "An action to drink or give to someone next to you. The DM tracks how many you have." };
// A heal reads as a button, not a heading: tinted, outlined, with "Roll ▸".
function healButton(button, label, ready) {
  button.className = "heal-btn";
  const text = document.createElement("span");
  text.textContent = label;
  const go = document.createElement("span");
  go.className = "heal-go";
  go.textContent = "Roll ▸";
  button.replaceChildren(text, ...(ready ? [go] : []));
}
function healingBlock(index, sheet, res) {
  const block = document.createElement("div");
  block.className = "res-block heal-block";
  const title = document.createElement("strong");
  title.textContent = "Healing";
  block.append(title);
  const status = document.createElement("p");
  status.className = "fineprint heal-status";
  // key: what it spends (a slot, Second Wind, a Hit Die), checked again now:
  // the card may have been drawn before it ran out.
  const heal = (target, total, what, key) => {
    dice.onResult = null; // one heal per roll, even if Roll is tapped again before the tray closes
    if (!hpRecord(target)) { status.textContent = "Set " + partyName(target) + "'s max HP first, then heal."; return; }
    if (key && resourceLeft(sheet, readRes(index), key) < 1) { status.textContent = "None left: " + what + " needs a rest first."; drawHp(); return; }
    if (key) saveRes(index, spendResource(sheet, readRes(index), key));
    adjustHp(target, total, status);
    status.textContent = "💚 " + partyName(target).replace(/^The /, "") + " regains " + total + " HP (" + what + ").";
    tellTable(index, "💚 " + (target === index ? "regains " : "heals " + partyName(target) + " for ") + total + " HP (" + what + ")");
    drawHp();
  };
  // A sheet that tracks its potions spends one per drink.
  const potion = (sheet.resources ?? []).some(resource => resource.name === "Healing potions") ? { ...POTION, spends: "Healing potions" } : POTION;
  for (const entry of [...(sheet.heals ?? []), potion]) {
    const row = document.createElement("div");
    row.className = "heal-row";
    const levels = entry.slot ? castableLevels({ slot: entry.slot }, sheet, res) : [];
    const level = levels[0];
    const extra = entry.upcast && level > entry.slot ? level - entry.slot : 0;
    const dice = extra ? entry.heal.replace(/^(\d+)d(\d+)/, (_, count, sides) => (Number(count) + extra) + "d" + sides) : entry.heal;
    const blocked = entry.slot && !levels.length ? "No spell slots left" : entry.spends && resourceLeft(sheet, res, entry.spends) < 1 ? "None left until a rest" : "";
    const target = document.createElement("select");
    target.setAttribute("aria-label", "Who " + entry.name + " heals");
    target.append(...(state?.party ?? []).map((character, other) => new Option(other === index ? "Yourself" : character.name, String(other))).filter((_, other) => !entry.self || other === index));
    // Mass Cure Wounds: one roll and one slot for everyone in the area.
    if (entry.multi) target.prepend(new Option("Everyone (up to " + entry.multi + ")", "all"));
    target.value = entry.multi ? "all" : String(index);
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = Boolean(blocked);
    healButton(button, blocked ? entry.name + ": " + blocked : "💚 " + entry.name + " · " + dice + (level ? " (" + ORDINAL[level] + "-level slot)" : ""), !blocked);
    button.onclick = () => {
      const who = target.value === "all"
        ? (state?.party ?? []).map((_, other) => other).filter(other => !isSittingOut(state?.combat, other)).slice(0, entry.multi)
        : [Number(target.value)];
      openDice(dice, entry.name, total => {
        // Healing Word and Second Wind take the bonus action; a potion, the action.
        markTurnUse(index, entry.name, /bonus action/i.test(entry.note ?? "") ? "bonus" : /\baction\b/i.test(entry.note ?? "") ? "action" : "", Boolean(entry.slot));
        // The cost is paid once, however many it heals.
        const key = entry.slot ? slotKey(level) : entry.spends ?? null;
        if (who.length > 1 && key) {
          if (resourceLeft(sheet, readRes(index), key) < 1) { status.textContent = "None left: " + entry.name + " needs a rest first."; drawHp(); return; }
          saveRes(index, spendResource(sheet, readRes(index), key));
        }
        for (const other of who) heal(other, total, entry.name, who.length > 1 ? null : key);
        setTimeout(closeDice, 1200);
      });
    };
    const note = document.createElement("p");
    note.className = "fineprint";
    note.textContent = entry.note ?? "";
    row.append(button, ...(entry.self ? [] : [target]), note);
    block.append(row);
  }
  const dice = hitDice(sheet);
  if (dice) {
    const left = resourceLeft(sheet, res, HIT_DICE);
    const row = document.createElement("div");
    row.className = "heal-row";
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = left < 1;
    healButton(button, left < 1 ? "No Hit Dice left (half come back on a long rest)" : "💚 Spend a Hit Die · " + dice.roll + " (" + left + "/" + dice.max + " left)", left >= 1);
    button.onclick = () => openDice(dice.roll, "Hit Die", total => {
      heal(index, Math.max(0, total), "a Hit Die", HIT_DICE);
      setTimeout(closeDice, 1200);
    });
    const note = document.createElement("p");
    note.className = "fineprint";
    note.textContent = "On a short rest, spend as many Hit Dice as you like, one at a time. A long rest gives back half of them.";
    row.append(button, note);
    block.append(row);
  }
  block.append(status);
  return block;
}
function fillResources(container, index) {
  const open = container.querySelector(".how-slots")?.open ?? false;
  // Keep who each heal is aimed at across redraws.
  const targets = [...container.querySelectorAll(".heal-row select")].map(select => select.value);
  const widget = resourcesWidget(index);
  widget.querySelectorAll(".heal-row select").forEach((select, at) => { if (targets[at] !== undefined && [...select.options].some(option => option.value === targets[at])) select.value = targets[at]; });
  if (!renderInto(container, [widget])) return;
  const how = container.querySelector(".how-slots");
  if (how) how.open = open;
}

// Redraws a widget unless someone is typing in it (the poll would wipe it).
function fillHp(container, index, options = {}) {
  if (container.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) {
    // Catch up once they're done typing, so the card doesn't keep old numbers.
    container.pendingFill = [index, options];
    if (!container.dataset.waits) {
      container.dataset.waits = "1";
      container.addEventListener("focusout", () => setTimeout(() => {
        const pending = container.pendingFill;
        if (!pending || container.contains(document.activeElement)) return;
        container.pendingFill = null;
        fillHp(container, ...pending);
      }));
    }
    return;
  }
  container.pendingFill = null;
  // Keep the "Set HP" fold open across polls, but close it once HP is set.
  const known = String(Boolean(hpRecord(index)));
  const open = container.dataset.known === known && (container.querySelector("details")?.open ?? false);
  container.dataset.known = known;
  renderInto(container, [hpWidget(index, { ...options, open })]);
}
function drawHp() {
  const available = hpAvailable();
  const me = Number($("character").value);
  if (state?.party?.[me]) settleFrenzy(me);
  const ready = available && state?.party?.[me];
  $("hp-badge").hidden = !ready || isHost;
  if (!ready) for (const id of ["res-sheet", "res-combat", "res-combat-fold", "rage-badge"]) $(id).hidden = true;
  $("hp-sheet").hidden = !ready;
  $("hp-combat").hidden = !ready || !state?.combat || isHost;
  $("party-hp").hidden = !isHost || !state || ended || !backend.setHp;
  if (isHost && state?.hpUnavailable && backend.setHp) {
    const note = document.createElement("p");
    note.className = "fineprint";
    note.textContent = "Party HP needs a one-time database update: run supabase/migrations/0006_dnd_party_hp.sql in the Supabase SQL editor.";
    $("party-hp-list").replaceChildren(note);
  }
  if (!available) return;
  if (ready) {
    const record = hpRecord(me);
    if (record?.hp > 0) clearDeath(me);
    if (resShared() && !state.resources[partyName(me)]) {
      const local = readJson(resKey(me), null);
      if (local && (Object.keys(local.used ?? {}).length || local.raging)) saveRes(me, local);
    }
    const health = partyHpStatus(record);
    $("hp-badge").className = "badge hp-badge is-" + health;
    $("hp-badge").textContent = "❤️ " + (record ? (health === "down" ? "DOWN" : record.hp + "/" + record.max + (record.temp ? " +" + record.temp : "")) : "Set HP");
    fillHp($("hp-sheet"), me);
    if (!$("hp-combat").hidden) fillHp($("hp-combat"), me);
    const hasResources = !isHost; // rests for everyone, plus any limited features on the sheet
    $("res-sheet").hidden = !hasResources;
    $("res-combat").hidden = !hasResources || $("hp-combat").hidden;
    $("res-combat-fold").hidden = $("res-combat").hidden; // folded in a fight: the Attack card comes first
    if (hasResources) {
      fillResources($("res-sheet"), me);
      if (!$("res-combat").hidden) fillResources($("res-combat"), me);
    }
    $("rage-badge").hidden = isHost || !readRes(me).raging;
  }
  if (isHost) {
    const list = $("party-hp-list");
    if (list.children.length !== state.party.length || !list.firstElementChild?.dataset.index) {
      list.replaceChildren(...state.party.map((_, index) => {
        const slot = document.createElement("div");
        slot.dataset.index = String(index);
        return slot;
      }));
    }
    [...list.children].forEach((slot, index) => fillHp(slot, index, { compact: true }));
  }
}
// Before the first fight: everyone with a known max HP starts full, in one tap.
$("party-full").onclick = async () => {
  const ready = (state?.party ?? []).map((_, index) => [index, hpRecord(index)?.max ?? sheetMaxHp(index)]).filter(([, max]) => max);
  const missing = (state?.party ?? []).filter((_, index) => !(hpRecord(index)?.max ?? sheetMaxHp(index))).map(character => character.name);
  if (!ready.length) { $("party-full-status").textContent = "Nobody has a max HP yet: set one on each card."; return; }
  if (!confirmTap($("party-full"), "Tap again: " + ready.length + " characters to full HP")) return;
  $("party-full").disabled = true;
  const status = $("party-full-status");
  status.textContent = "";
  for (const [index, max] of ready) await saveHp(index, { hp: max, max, temp: 0, ac: hpRecord(index)?.ac }, status);
  $("party-full").disabled = false;
  if (!status.textContent) status.textContent = "Everyone is at full HP." + (missing.length ? " Still needs a max HP: " + missing.join(", ") + "." : "");
};
$("hp-badge").onclick = () => {
  showTab("sheet");
  scrollToCard($("hp-sheet"));
};

// ── Hit reports: a player tells the DM "🎯 hit Bandit 2 for 14 damage"
// (a story line); the DM's phone offers to apply it to that enemy. ──
let lastDamageRoll = null;
const HANDLED_KEY = () => "dnd-hits-handled:" + room;
const handledHits = () => new Set(readJson(HANDLED_KEY(), []));
// Handled on this phone, and marked on the story line itself ("· ✓ DM
// applied"), so another DM screen at the table (a second device on the same
// account) never applies it twice.
function markHit(action, how = "applied") {
  storage.set(HANDLED_KEY(), JSON.stringify([...handledHits(), action.id].slice(-300)));
  if (!backend.editAction || !Array.isArray(state?.actions)) return;
  const text = hitHandledText(action.text, how);
  state.actions = state.actions.map(entry => entry.id === action.id ? { ...entry, text } : entry);
  backend.editAction(room, action.id, text).catch(() => {}); // this phone remembers it either way
}
function drawHitReport() {
  const combat = state?.combat;
  const form = $("hit-report");
  form.hidden = !combat || isHost || ended || !backend.postAction || !Array.isArray(state?.actions);
  drawAttack();
  if (form.hidden) return;
  const targets = (combat.enemies ?? []).filter(enemy => enemy.status !== "down");
  const select = $("hit-target");
  if (document.activeElement !== select) {
    const chosen = select.value;
    select.replaceChildren(new Option(targets.length ? "Which enemy?" : "No enemies standing", ""),
      ...targets.map(enemy => new Option(enemy.name + " · " + (STATUS_TEXT[enemy.status] ?? ""), enemy.name)));
    select.value = targets.some(enemy => enemy.name === chosen) ? chosen : "";
  }
  $("hit-last").hidden = !lastDamageRoll;
  if (lastDamageRoll) $("hit-last").textContent = "Use last roll: " + lastDamageRoll.total + " (" + lastDamageRoll.label + ")";
}
$("hit-last").onclick = () => { if (lastDamageRoll) $("hit-amount").value = lastDamageRoll.total; };
$("hit-report").onsubmit = async event => {
  event.preventDefault();
  const enemy = $("hit-target").value;
  const amount = Math.round(Number($("hit-amount").value));
  if (!enemy) { $("hit-status").textContent = "Pick the enemy you hit."; return; }
  if (!(amount >= 1 && amount <= 999)) { $("hit-status").textContent = "Enter the damage (1–999)."; return; }
  const button = $("hit-report").querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await backend.postAction(room, Number($("character").value), hitReportText(enemy, amount));
    $("hit-status").textContent = "Sent: " + amount + " damage to " + enemy + ". The DM applies it.";
    $("hit-amount").value = "";
    sync();
  } catch (error) {
    $("hit-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

// ── The attack flow: pick one of your attacks, roll to hit (the DM calls
// hit or miss; a natural 20 is a crit, a natural 1 misses), roll the right
// damage, send it to the DM. Save spells skip the to-hit roll. ──
// Attacks a player adds themselves (Roan has no full sheet yet), kept on this
// phone per character like resources: per campaign, or per practice table.
const signedNumber = value => (value >= 0 ? "+" : "−") + Math.abs(value);
const customKey = index => "dnd-custom-attacks:" + (isPractice() ? room : "campaign") + ":" + partyName(index);
const customAttacks = index => readJson(customKey(index), []).filter(entry =>
  entry && typeof entry.name === "string" && Number.isInteger(entry.hit) && parseDice(String(entry.damage ?? "")))
  .map(entry => ({ ...entry, custom: true }));
const attacksFor = index => [...(sheets[partyName(index)]?.attacks ?? []), ...customAttacks(index)];
$("attack-custom-form").onsubmit = event => {
  event.preventDefault();
  const me = Number($("character").value);
  const name = $("custom-name").value.trim();
  const hit = Math.round(Number($("custom-hit").value));
  const damage = $("custom-damage").value.replace(/\s+/g, "").toLowerCase();
  const type = $("custom-type").value.trim();
  const status = $("custom-status");
  if (!name) { status.textContent = "Give the attack a name."; return; }
  if ($("custom-hit").value === "" || !(hit >= -5 && hit <= 20)) { status.textContent = "To hit is the bonus you add to the d20, like 7."; return; }
  if (!parseDice(damage) || !/d/.test(damage)) { status.textContent = "Damage is dice plus a bonus, like 1d8+4."; return; }
  if (attacksFor(me).some(entry => entry.name.toLowerCase() === name.toLowerCase())) { status.textContent = "There's already an attack called " + name + "."; return; }
  const saved = readJson(customKey(me), []);
  storage.set(customKey(me), JSON.stringify([...saved, { name, hit, damage, type }].slice(-12)));
  for (const id of ["custom-name", "custom-hit", "custom-damage", "custom-type"]) $(id).value = "";
  status.textContent = "Added " + name + ". Pick it above to attack.";
  attackFlow.index = attacksFor(me).length - 1;
  resetAttack();
  drawAttack();
};
const attackFlow = { character: null, index: 0, options: new Set(), step: "ready", toHit: null, crit: false, damage: null, sent: [], level: null, spent: false, spentManeuver: false, notes: [] };
// A miss goes in the story too, so the DM can tell it from a skipped turn.
// It's posted once it's final: straight away when no second d20 can change
// it, otherwise when the player moves on (next attack, another attack or
// character, End my turn).
function flushMiss() {
  if (attackFlow.step !== "miss" || attackFlow.missTold || !attackFlow.missText || attackFlow.character === null) return;
  if (!backend.postAction || !Array.isArray(state?.actions)) return;
  attackFlow.missTold = true;
  backend.postAction(room, attackFlow.character, attackFlow.missText).then(sync).catch(() => {});
}
// Done with: missed, or the damage went to the DM (or there's no one to send it to).
function attackFinished() {
  if (attackFlow.step === "miss") return true;
  if (attackFlow.step !== "damage") return false;
  return attackFlow.sent.length > 0 || !backend.postAction || !Array.isArray(state?.actions);
}
// Each character's unfinished attack, kept while this phone plays someone else.
const parkedAttacks = new Map();
// After a reload (or anything that cleared the card), pick an unanswered or
// answered-but-unrolled to-hit back up from the story: the character's latest
// attack line is "🎯 attacks X" with no hit or miss sent after it.
const RESUMED_KEY = () => "dnd-resumed-asks:" + room;
function resumeAsk(me) {
  if (attackFlow.step !== "ready" || !state?.combat || !Array.isArray(state?.actions)) return;
  const name = partyName(me);
  const mine = state.actions.filter(action => action.name === name && /^🎯 /u.test(String(action.text)));
  const line = mine.at(-1);
  const ask = line && parseAttackAsk(line.text);
  if (!ask || ask.verdict === "miss" || Date.now() - Number(line.created) > 30 * 60 * 1000) return;
  // Retired only once the player moves on (resetAttack), so a second reload
  // still finds an attack that isn't finished.
  if (readJson(RESUMED_KEY(), []).includes(line.id)) return;
  const [, attackName, castLevel] = ask.detail.match(/^with (.+?)(?: \((\d)(?:st|nd|rd|th)-level\))?, \d+ to hit/) ?? [];
  const index = attacksFor(me).findIndex(entry => entry.name === attackName);
  if (index < 0 || ask.toHit === null) return;
  attackFlow.index = index;
  // The slot was paid for at that level: the damage is rolled at it too.
  attackFlow.level = castLevel ? Number(castLevel) : attacksFor(me)[index].slot ?? null;
  attackFlow.spent = true; // the slot or use was spent when it was rolled
  attackFlow.toHit = { total: ask.toHit, natural: null, critical: false, fumble: false, mode: "normal", typed: true };
  attackFlow.ask = { text: String(line.text).replace(/ · (✓ DM: hit|✗ DM: miss)$/u, ""), after: Number(line.id) - 1, character: me };
  attackFlow.step = ask.verdict === "hit" ? "hit" : "waiting";
  attackFlow.resumeTarget = ask.enemy;
  attackFlow.rolledAt = ask.enemy;
}
function resetAttack(keepChoice = true) {
  // One-attack options (Dread Ambusher shot, a maneuver) end with the attack.
  if (attackFlow.step !== "ready" && attackFlow.character !== null) {
    for (const option of sheets[partyName(attackFlow.character)]?.attackOptions ?? []) {
      if (option.lasts === "attack") attackFlow.options.delete(option.name);
    }
    saveAttackOptions(attackFlow.character);
  }
  flushMiss(); // a miss left on the card is final once the player moves on
  // An attack the player moved on from is never picked back up from the story.
  if (attackFlow.ask && Array.isArray(state?.actions)) {
    const { text, after } = attackFlow.ask;
    const line = state.actions.find(action => Number(action.id) > after && String(action.text).startsWith(text));
    if (line) storage.set(RESUMED_KEY(), JSON.stringify([...readJson(RESUMED_KEY(), []), line.id].slice(-100)));
  }
  Object.assign(attackFlow, { step: "ready", toHit: null, crit: false, damage: null, sent: [], spent: false, spentManeuver: false, notes: [], choice: {}, second: false, missTold: false, missText: "", area: new Set(), areaSeeded: false, ask: null, rolledAt: null });
  if (!keepChoice) Object.assign(attackFlow, { index: 0, level: null, options: new Set() });
}
// The options each character has on (Great Weapon Master, Reckless, Hunter's
// Mark), kept on this phone so switching characters or reloading keeps them.
// turn: the round it was this character's turn, so "turn" options end with it.
// cast: options already cast (Hunter's Mark), so ticking them again is free.
const attackOptionsKey = index => "dnd-attack-options:" + room + ":" + index;
function saveAttackOptions(index) {
  const saved = readJson(attackOptionsKey(index), {});
  storage.set(attackOptionsKey(index), JSON.stringify({ ...saved, names: [...attackFlow.options] }));
}
function attackOptionsState(index, sheet, combat) {
  const saved = readJson(attackOptionsKey(index), {});
  const byName = Object.fromEntries((sheet.attackOptions ?? []).map(option => [option.name, option]));
  const myTurn = combat?.turn === "pc:" + index;
  // This character's turn ended (or a new round started) since "turn" options were set.
  const turnOver = saved.turn != null && (!myTurn || saved.turn !== combat?.round);
  const concentrating = Boolean(activeConditions().Concentrating);
  const cast = (saved.cast ?? []).filter(name => byName[name] && (!byName[name].concentration || concentrating));
  const names = (saved.names ?? []).filter(name => {
    const option = byName[name];
    if (!option || option.lasts === "attack" && !attackFlow.options.has(name)) return false;
    if (option.lasts === "turn" && turnOver) return false;
    return !option.cast || cast.includes(name);
  });
  const next = { names, cast, turn: myTurn ? combat.round : turnOver ? null : saved.turn ?? null };
  if (JSON.stringify(next) !== JSON.stringify(saved)) storage.set(attackOptionsKey(index), JSON.stringify(next));
  return next;
}
function setDiceMode(mode) {
  dice.mode = mode;
  for (const button of $("dice-mode").children) button.classList.toggle("is-active", button.dataset.mode === mode);
}
const stepButton = (text, className, onclick) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.onclick = onclick;
  return button;
};
const stepText = (text, className = "") => {
  const line = document.createElement("p");
  line.className = "attack-line " + className;
  line.textContent = text;
  return line;
};
// One obvious next button per step; the rest ("It missed", a second d20,
// removing your own attack) fold under "Other choices", which stays open
// across redraws until the step changes.
let moreOpen = false, moreStep = "";
function moreFold(items) {
  const buttons = items.filter(Boolean);
  if (!buttons.length) return [];
  if (moreStep !== attackFlow.step) { moreStep = attackFlow.step; moreOpen = false; }
  const fold = document.createElement("details");
  fold.className = "fold more-steps";
  fold.open = moreOpen;
  fold.ontoggle = () => { moreOpen = fold.open; };
  const summary = document.createElement("summary");
  summary.textContent = "Other choices";
  fold.append(summary, ...buttons);
  return [fold];
}
const rolledText = result => result?.natural == null ? "" : " (rolled " + result.natural + ")";
// Set while the Attack card is ready to roll to hit: sends a total the player
// typed in the story box ("25 to hit") as if rolled on the card.
let typedToHit = null;
// Spells that stay up once cast (Spiritual Weapon): which ones this phone has
// cast in the current fight, and at what level, so later attacks spend no slot.
const lastingUp = new Map();
const lastingCast = new Map(); // "<index>:<name>" → the turn it was cast
// Weapon attacks made this turn, per character, so the card can say "1 more
// attack in this Attack action" (Extra Attack is easy to forget).
// What each character has used this turn is kept on this phone too, so a
// reload mid-turn (a locked phone, switching apps while the DM calls the hit)
// doesn't forget the action is spent: the turn guide still says End my turn.
// Only the current turn's entries count (each carries its turn tag). Turn
// tags restart at round 1 in every fight, so the records are wiped when a
// fight starts or ends (forgetTurns), and an entry older than half an hour is
// dropped on load: a reload mid-turn is minutes, not a fight later.
const TURN_MEMORY_AGE = 30 * 60 * 1000;
const turnMemories = [];
function turnMemory(name) {
  const key = "dnd-turn-" + name + ":" + room;
  let saved = {};
  try { saved = JSON.parse(storage.get(key) ?? "{}") ?? {}; } catch {}
  const fresh = Object.entries(saved).filter(([, value]) => Date.now() - Number(value?.at ?? 0) < TURN_MEMORY_AGE);
  const map = new Map(fresh.map(([index, value]) => [Number(index), value]));
  const set = map.set.bind(map);
  const clear = map.clear.bind(map);
  const save = () => { try { storage.set(key, JSON.stringify(Object.fromEntries(map))); } catch {} };
  map.set = (index, value) => { set(index, { ...value, at: Date.now() }); save(); return map; };
  map.clear = () => { clear(); save(); };
  turnMemories.push(map);
  return map;
}
function forgetTurns() { for (const map of turnMemories) map.clear(); }
const attacksMade = turnMemory("attacks");
const turnTag = () => state?.combat ? state.combat.round + ":" + state.combat.turn : "";
// Resource features used this turn (Living Shadow…), shown as used.
const usedFeatures = turnMemory("features"); // character index → { turn, names }
const featuresThisTurn = index => { const entry = usedFeatures.get(index); return entry && entry.turn === turnTag() ? entry.names : []; };
// Action Surge this turn: each one adds a whole Attack action.
const surges = turnMemory("surges"); // character index → { turn, count }
const surgesThisTurn = index => { const entry = surges.get(index); return entry && entry.turn === turnTag() ? entry.count : 0; };
const attackCap = (index, per) => per * (1 + surgesThisTurn(index));
function attacksThisTurn(index) {
  const entry = attacksMade.get(index);
  return entry && entry.turn === turnTag() ? entry.count : 0;
}
// Only while turns are running: before round 1 (or with no fight) there's no
// turn boundary to clear it, so it would warn forever.
const turnsRunning = () => Boolean(state?.combat?.turn);
// One action and one bonus action a turn (each Action Surge adds an action).
// An Attack action covers its Extra Attack swings; after those, the next
// swing is another Attack action. free: part of another attack (the shadow's
// copied throw) and costs nothing.
let turnEndShown = ""; // "<character>@<turn>" already taken up to the turn card
const turnUses = turnMemory("uses"); // index → { tag, spells, attackActions, bonus, last, lastBonus }
const isBonusAction = attack => /bonus action/i.test(attack.note ?? "");
function usesThisTurn(index) {
  const entry = turnUses.get(index);
  return entry && entry.tag === turnTag() ? entry : { tag: turnTag(), spells: 0, attackActions: 0, bonus: 0, last: "", lastBonus: "", actionSpell: "", bonusSpell: "" };
}
const actionsUsed = uses => uses.spells + uses.attackActions;
function markUsedOnce(index, attack) {
  if (!turnsRunning() || attack.free) return;
  const uses = { ...usesThisTurn(index) };
  if (attack.perAction) {
    // Called after countAttack: this swing is in attacksThisTurn already.
    const actions = Math.ceil(attacksThisTurn(index) / attack.perAction);
    if (actions > uses.attackActions) Object.assign(uses, { attackActions: actions, last: "the Attack action" });
  } else if (isBonusAction(attack)) {
    Object.assign(uses, { bonus: uses.bonus + 1, lastBonus: attack.name, bonusSpell: uses.bonusSpell || (castsSpell(index, attack) ? attack.name : "") });
  } else {
    Object.assign(uses, { spells: uses.spells + 1, last: attack.name, actionSpell: uses.actionSpell || (castsSpell(index, attack) ? attack.name : "") });
  }
  turnUses.set(index, uses);
}
// A leveled spell cast this turn (a Spiritual Weapon already up from an
// earlier turn only attacks; casting it is what counts).
function castsSpell(index, attack) {
  if (!attack.slot) return false;
  if (!attack.lasting) return true;
  const key = index + ":" + attack.name;
  return !lastingUp.has(key) || lastingCast.get(key) === turnTag();
}
// What a feature costs on your turn, from its rule's header ("Bonus action",
// "Action"): Rage, Living Shadow, Healing Word, Hunter's Mark, Turn Undead…
function featureCost(name) {
  const meta = lookupRule(name)?.meta ?? "";
  return /\bbonus action\b/i.test(meta) ? "bonus" : /(^|·)\s*Action\b/.test(meta) ? "action" : "";
}
// Count a non-attack use of the action or bonus action on your own turn, so
// the Attack card and the turn guide know it's gone.
function markTurnUse(index, name, kind, leveled = false) {
  if (!kind || !turnsRunning() || state?.combat?.turn !== "pc:" + index) return;
  const uses = { ...usesThisTurn(index) };
  if (kind === "bonus") Object.assign(uses, { bonus: uses.bonus + 1, lastBonus: name, bonusSpell: uses.bonusSpell || (leveled ? name : "") });
  else Object.assign(uses, { spells: uses.spells + 1, last: name, actionSpell: uses.actionSpell || (leveled ? name : "") });
  turnUses.set(index, uses);
}
// Nothing left to attack with this turn: the action (and any Action Surge) is
// spent, the Attack action has no swings left, and no bonus-action attack is
// waiting. Moving on then means ending the turn.
function actionSpent(index) {
  if (!turnsRunning() || state?.combat?.turn !== "pc:" + index) return false;
  const uses = usesThisTurn(index);
  const per = attacksFor(index).find(attack => attack.perAction)?.perAction ?? 0;
  const made = attacksThisTurn(index);
  if (per && made % per !== 0) return false; // swings left in this Attack action
  if (per && made && made < attackCap(index, per)) return false; // Action Surge swings
  return actionsUsed(uses) >= 1 + surgesThisTurn(index);
}
// Bonus-action attacks still open this turn (Spiritual Weapon, Shadow Slash),
// leaving out any the card would block: no slot left for a spell that isn't
// already up, or none of the resource it spends.
function bonusAttacksLeft(index) {
  if (usesThisTurn(index).bonus >= 1) return [];
  const sheet = sheets[partyName(index)];
  const res = readRes(index);
  return attacksFor(index).filter(attack => isBonusAction(attack)
    && (!attack.slot || (attack.lasting && lastingUp.has(index + ":" + attack.name)) || castableLevels(attack, sheet, res).length)
    && (!attack.spends || resourceLeft(sheet, res, attack.spends) >= 1)
    && (!attack.whileRaging || res.raging)
    && !(usesThisTurn(index).actionSpell && castsSpell(index, attack))).map(attack => attack.name);
}
const attacksSpent = index => actionSpent(index) && !bonusAttacksLeft(index).length;
// Why this attack would be one action (or bonus action) too many, or "".
function turnBlock(index, attack) {
  if (!turnsRunning() || attack.free) return "";
  const uses = usesThisTurn(index);
  if (isBonusAction(attack)) {
    if (uses.bonus >= 1) return "You've already used your bonus action this turn (" + uses.lastBonus + "). Pick something else, or end your turn.";
    // A bonus-action spell and a leveled action spell can't share a turn.
    return uses.actionSpell && castsSpell(index, attack) ? "You cast " + uses.actionSpell + " with your action, so a bonus-action spell this turn can only be a cantrip." : "";
  }
  if (uses.bonusSpell && castsSpell(index, attack) && actionsUsed(uses) < 1 + surgesThisTurn(index)) {
    return "You cast " + uses.bonusSpell + " as a bonus action, so your action spell this turn can only be a cantrip.";
  }
  // Swings left in an Attack action already started: the swing count on the card handles those.
  if (attack.perAction && attacksThisTurn(index) % attack.perAction !== 0) return "";
  if (actionsUsed(uses) < 1 + surgesThisTurn(index)) return "";
  // Only offer a bonus action when one is on the sheet and still unused.
  const bonusLeft = uses.bonus < 1 && attacksFor(index).some(isBonusAction);
  const hint = sheets[partyName(index)]?.turnHint;
  return "You've already used your action this turn (" + uses.last + "). Only one action a turn: "
    + (bonusLeft ? "pick a bonus action, or end your turn." : "end your turn.") + (hint ? " " + hint : "");
}
function countAttack(index) {
  attacksMade.set(index, { turn: turnTag(), count: attacksThisTurn(index) + 1 });
}
function attackCountText(index, attack) {
  const made = attacksThisTurn(index);
  const per = attack.perAction;
  const cap = attackCap(index, per);
  if (!made) return "Your Attack action is " + per + " attacks (Extra Attack)." + (cap > per ? " Action Surge: " + cap + " this turn." : "");
  if (made < cap) return "Attack " + (made + 1) + " of " + cap + (cap > per ? " this turn (Action Surge)." : " in this Attack action.");
  return "That's " + made + " attacks this turn. Action Surge (or a first-turn Dread Ambusher shot) gives more.";
}
// ── This turn: the features a character uses on their turn (Rage, Action
// Surge, Second Wind), one tap each on the Attack card, showing what's
// active and what's left, so using one is never a hunt through the Sheet. ──
function drawTurnFeatures(me, sheet, res) {
  const box = $("turn-features");
  const items = [];
  const chip = (text, className = "is-on") => { const item = document.createElement("span"); item.className = "turn-feature " + className; item.textContent = text; return item; };
  const button = (text, onclick, disabled = false) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "turn-feature";
    item.textContent = text;
    item.disabled = disabled;
    item.onclick = onclick;
    return item;
  };
  for (const resource of sheet.resources ?? []) {
    const left = resource.max ? resourceLeft(sheet, res, resource.name) : 0;
    if (resource.rage) {
      if (res.raging) items.push(chip("😤 Raging (+damage, half from weapons)"));
      else items.push(button(left ? "😤 Start rage · bonus action (" + left + " left)" : "😤 No rages left", () => {
        const next = { ...spendResource(sheet, readRes(me), resource.name), raging: true };
        writeRes(me, next);
        markTurnUse(me, "Rage", "bonus");
        tellTable(me, "😤 starts raging (" + resourceLeft(sheet, next, resource.name) + " of " + resource.max + " rages left)");
        drawAttack();
      }, !left));
    } else if (resource.surge) {
      const used = surgesThisTurn(me);
      if (used) items.push(chip("⚡ Action Surge: " + attackCap(me, attacksFor(me).find(attack => attack.perAction)?.perAction ?? 1) + " attacks this turn"));
      if (!used || left) items.push(button(left ? "⚡ Action Surge · another action (" + left + " left)" : "⚡ Action Surge: none left (short rest)", () => {
        saveRes(me, spendResource(sheet, readRes(me), resource.name));
        surges.set(me, { turn: turnTag(), count: surgesThisTurn(me) + 1 });
        tellTable(me, "⚡ uses Action Surge: one more action this turn");
        drawHp();
        drawAttack();
      }, !left));
    }
  }
  // Features a resource pays for that aren't attacks (Roan's Living Shadow and
  // Death Mark, Turn Undead, Precision Attack): one tap spends it, tells the
  // table and shows it's used this turn.
  const attackNames = new Set(attacksFor(me).map(attack => baseName(attack.name)));
  const optionNames = new Set((sheet.attackOptions ?? []).flatMap(option => [baseName(option.name), ...(option.choices ?? []).map(([name]) => baseName(name))]));
  for (const resource of sheet.resources ?? []) {
    for (const covered of resource.covers ?? []) {
      const [name, cost] = Array.isArray(covered) ? covered : [covered, 1];
      if (/^Combat Superiority$/i.test(name) || attackNames.has(baseName(name)) || optionNames.has(baseName(name))) continue;
      const own = (sheet.resources ?? []).find(entry => entry.name === name && entry.max); // Death Mark has its own use too
      const left = resourceLeft(sheet, res, resource.name);
      const ownLeft = own ? resourceLeft(sheet, res, own.name) : Infinity;
      // Usable again while there's something left (Precision Attack on each
      // swing); the count says it's already in play this turn.
      const used = featuresThisTurn(me).filter(entry => entry === name).length;
      const can = left >= cost && ownLeft >= 1;
      const item = button((used ? "✓ " : "✨ ") + name + (used ? " ×" + used + " this turn" : "") + " · uses " + cost + " (" + resource.name + ": " + left + " left)", () => {
        let next = readRes(me);
        for (let n = 0; n < cost; n++) next = spendResource(sheet, next, resource.name);
        if (own) next = spendResource(sheet, next, own.name);
        saveRes(me, next);
        usedFeatures.set(me, { turn: turnTag(), names: [...featuresThisTurn(me), name] });
        markTurnUse(me, name, featureCost(name));
        tellTable(me, "✨ uses " + name + " (" + resourceLeft(sheet, next, resource.name) + " " + resource.name + " left)");
        drawHp();
        drawAttack();
      }, !can);
      item.dataset.feature = name;
      items.push(item);
    }
  }
  // A spell that stays up (Hunter's Mark): show it's on, so it isn't cast twice.
  for (const name of readJson(attackOptionsKey(me), {}).cast ?? []) {
    const option = (sheet.attackOptions ?? []).find(entry => entry.name === name);
    if (option && (!option.concentration || activeConditions().Concentrating)) items.push(chip("🎯 " + name + " · up" + (option.concentration ? " (concentrating)" : "")));
  }
  // Heals a character uses on themselves (Second Wind).
  for (const entry of sheet.heals ?? []) {
    if (!entry.self || !entry.spends) continue;
    const left = resourceLeft(sheet, res, entry.spends);
    items.push(button(left ? "💚 " + entry.name + " · " + entry.heal + " (" + left + " left)" : "💚 " + entry.name + ": none left", () => openDice(entry.heal, entry.name, total => {
      dice.onResult = null;
      // No HP to heal yet: don't spend the use (as the Sheet's healing does).
      if (!hpRecord(me)) { $("dice-status").textContent = "Set " + partyName(me) + "'s max HP first (Sheet tab), then heal."; return; }
      if (resourceLeft(sheet, readRes(me), entry.spends) < 1) return;
      saveRes(me, spendResource(sheet, readRes(me), entry.spends));
      adjustHp(me, total, $("dice-status"));
      tellTable(me, "💚 regains " + total + " HP (" + entry.name + ")");
      $("dice-status").textContent = "💚 +" + total + " HP (" + entry.name + ").";
      drawHp();
      setTimeout(closeDice, 1200);
    }), !left));
  }
  box.hidden = !items.length || isHost;
  if (!items.length) { box.replaceChildren(); return; }
  const label = document.createElement("span");
  label.className = "turn-features-label";
  label.textContent = "This turn";
  box.replaceChildren(label, ...items);
}
// The DM's call on a waiting to-hit roll, read back from the story line.
function readVerdict() {
  const ask = attackFlow.ask;
  if (attackFlow.step !== "waiting" || !ask || !Array.isArray(state?.actions)) return;
  const name = partyName(ask.character);
  const line = state.actions.filter(action => Number(action.id) > ask.after && action.name === name && String(action.text).startsWith(ask.text))
    .map(action => parseAttackAsk(action.text)).find(parsed => parsed?.verdict);
  if (!line) return;
  attackFlow.step = line.verdict;
  if (line.verdict === "miss") attackFlow.missTold = true; // the DM's call already says so
  navigator.vibrate?.(line.verdict === "hit" ? [60, 40, 60] : 120);
}
function drawAttack() {
  typedToHit = null;
  readVerdict();
  const combat = state?.combat;
  if (!combat) lastingUp.clear();
  const card = $("attack-card");
  card.hidden = !combat || isHost || ended;
  if (card.hidden) return;
  const me = Number($("character").value);
  const sheet = sheets[partyName(me)] ?? {};
  $("attack-custom").open ||= !attacksFor(me).length;
  if (attackFlow.character !== me) {
    const leaving = attackFlow.character;
    if (leaving !== null && attackFlow.step !== "ready" && !attackFinished()) {
      parkedAttacks.set(leaving, { ...attackFlow, sent: [...attackFlow.sent], area: new Set(attackFlow.area ?? []), resumeTarget: $("attack-target").value || null });
      attackFlow.ask = null; // parked, not abandoned: the reset below mustn't retire it
    } else {
      flushMiss();
    }
    attackFlow.character = null;
    resetAttack(false);
    attackFlow.character = me;
    const parked = parkedAttacks.get(me);
    if (parked) { parkedAttacks.delete(me); Object.assign(attackFlow, parked, { character: me }); }
  }
  resumeAsk(me);
  const optionState = attackOptionsState(me, sheet, combat);
  attackFlow.options = new Set(optionState.names);
  const attacks = attacksFor(me);
  const baseAttack = attacks[attackFlow.index];
  const res = readRes(me);
  const lastingKey = me + ":" + baseAttack?.name;
  // A lasting concentration spell (Spirit Guardians) is up only while the
  // caster is still Concentrating: when that ends, the next use costs a slot.
  if (baseAttack?.concentration && lastingUp.has(lastingKey) && !activeConditions().Concentrating) lastingUp.delete(lastingKey);
  const up = Boolean(baseAttack?.lasting) && lastingUp.has(lastingKey);
  const levels = castableLevels(baseAttack, sheet, res);
  if (up) attackFlow.level = lastingUp.get(lastingKey);
  else if (baseAttack?.slot && !attackFlow.spent && !levels.includes(attackFlow.level)) attackFlow.level = levels[0] ?? null;
  // A maneuver whose dice ran out doesn't carry into the next attack.
  if (attackFlow.step === "ready") {
    for (const option of sheet.attackOptions ?? []) {
      if (option.spends && resourceLeft(sheet, res, option.spends) < 1) attackFlow.options.delete(option.name);
    }
  }
  const attack = baseAttack?.slot && attackFlow.level ? upcastAttack(baseAttack, attackFlow.level) : baseAttack;
  const isOn = option => attackFlow.options.has(option.name) || Boolean(option.rage && res.raging) || Boolean(option.hidden && activeConditions().Invisible);
  $("attack-title").textContent = "Attack · " + partyName(me).replace(/^The /, "");
  drawTurnFeatures(me, sheet, res);

  $("attack-list").replaceChildren(...attacks.map((entry, index) => {
    const label = entry.save ? entry.name + " · DC " + entry.dc + " " + entry.save : entry.name + " +" + entry.hit + " · " + entry.damage;
    const chip = stepButton(label, "chip" + (index === attackFlow.index ? " is-active" : ""), () => {
      attackFlow.index = index;
      attackFlow.level = null;
      resetAttack();
      drawAttack();
    });
    chip.setAttribute("aria-pressed", String(index === attackFlow.index));
    return chip;
  }));
  // Melee-only options (Raging, Reckless) don't apply to a thrown or ranged attack.
  const options = attack && !attack.save ? (sheet.attackOptions ?? []).filter(option => !(option.melee && attack.ranged)) : [];
  if (attack?.custom) {
    $("attack-note").replaceChildren(...["To hit: " + signedNumber(attack.hit), "Damage: " + attack.damage + (attack.type ? " " + attack.type : ""), "Your own attack (kept on this phone)."].map((text, index) => {
      const line = document.createElement(index < 2 ? "strong" : "span");
      line.textContent = text;
      return line;
    }));
  } else if (attack) {
    const math = attackBreakdown(attack, sheet, options.filter(isOn));
    const lines = [
      math.hit ? "To hit: " + math.hit : "Save: " + math.dc,
      baseAttack.slot ? ORDINAL[baseAttack.slot] + "-level spell: " + (baseAttack.lasting ? "one slot when cast; attacks after that are free" : "uses a spell slot") : baseAttack.spends ? "Uses " + baseAttack.spends + " (" + resourceLeft(sheet, res, baseAttack.spends) + " left)" : "",
      "Damage: " + math.damage + (attack.type ? " " + attack.type : ""),
      attack.note ?? ""
    ].filter(Boolean);
    $("attack-note").replaceChildren(...lines.map((text, index) => {
      const line = document.createElement(index < 1 || text.startsWith("Damage") ? "strong" : "span");
      line.textContent = text;
      return line;
    }));
  } else {
    $("attack-note").textContent = "No attacks on this sheet yet: add your own below (name, to hit, damage), or use Other damage.";
  }
  $("attack-options").replaceChildren(...options.map(option => {
    const label = document.createElement("label");
    label.className = "attack-option";
    label.dataset.option = option.name; // a Moves suggestion can find it
    label.title = option.note ?? "";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isOn(option);
    const castUp = Boolean(option.cast) && optionState.cast.includes(option.name);
    const castLevels = option.cast && !castUp ? castableLevels({ slot: option.cast }, sheet, res) : [];
    const spentOut = !box.checked && (option.spends ? resourceLeft(sheet, res, option.spends) < 1 : Boolean(option.cast) && !castUp && !castLevels.length);
    // Once the d20 is rolled, options that change it (to-hit, advantage) are
    // locked; damage-only ones (a maneuver on a hit) stay open until damage.
    const locked = attackFlow.step === "damage" || attackFlow.step === "miss"
      || (attackFlow.step !== "ready" && Boolean(option.hit || option.mode));
    box.disabled = spentOut || locked;
    box.onchange = () => {
      if (box.checked) attackFlow.options.add(option.name); else attackFlow.options.delete(option.name);
      const saved = readJson(attackOptionsKey(me), {});
      const casting = box.checked && option.cast && !castUp;
      if (casting) saved.cast = [...new Set([...(saved.cast ?? []), option.name])];
      // Store the choice before anything below redraws the card from storage.
      storage.set(attackOptionsKey(me), JSON.stringify({ ...saved, names: [...attackFlow.options] }));
      if (casting) {
        // Cast it: spend the lowest slot that's left, once; concentration starts.
        const level = castLevels[0];
        const next = spendResource(sheet, readRes(me), slotKey(level));
        attackFlow.notes = [...(attackFlow.notes ?? []), "Cast " + option.name + " with a " + ORDINAL[level] + "-level slot (" + resourceLeft(sheet, next, slotKey(level)) + " left)" + (option.concentration ? "; you're concentrating on it" : "")];
        if (option.concentration) setCondition("Concentrating", 1);
        if (/bonus action/i.test(option.note ?? "")) markTurnUse(me, option.name, "bonus", true);
        saveRes(me, next);
        drawHp();
        showOptions();
      }
      drawAttack();
    };
    if (option.choices && box.checked) {
      // Which maneuver: the DM is told its name and the save it calls for.
      const pick = document.createElement("select");
      pick.setAttribute("aria-label", "Which " + option.name.replace(/ \(.*\)$/, "").toLowerCase());
      pick.append(...option.choices.map(([name]) => new Option(name, name)));
      pick.value = attackFlow.choice?.[option.name] ?? option.choices[0][0];
      pick.disabled = attackFlow.step === "damage" || attackFlow.step === "miss";
      pick.onchange = () => { attackFlow.choice = { ...attackFlow.choice, [option.name]: pick.value }; };
      pick.onclick = event => event.stopPropagation();
      pick.dataset.option = option.name;
      queueMicrotask(() => label.after(pick));
    }
    const text = document.createElement("span");
    if (option.unconfirmed) label.classList.add("is-unconfirmed");
    text.textContent = option.name + (option.unconfirmed ? " (DM OK?)" : "") + (option.rage && res.raging ? " 😤" : "")
      + (option.cast ? (castUp ? " · up" : spentOut ? " (no slots left)" : " · uses a " + ORDINAL[castLevels[0]] + "-level slot")
        : spentOut ? " (none left)" : option.spends ? " · " + resourceLeft(sheet, res, option.spends) + " left" : "");
    label.append(box, text);
    return label;
  }));

  const select = $("attack-target");
  if (document.activeElement !== select) {
    const chosen = attackFlow.resumeTarget ?? select.value;
    attackFlow.resumeTarget = null;
    const targets = (combat.enemies ?? []).filter(enemy => enemy.status !== "down");
    select.replaceChildren(new Option(targets.length ? "Which enemy?" : "No enemies standing", ""),
      ...targets.map(enemy => new Option(enemy.name + " · " + (STATUS_TEXT[enemy.status] ?? ""), enemy.name)));
    select.value = targets.some(enemy => enemy.name === chosen) ? chosen : "";
  }
  // Once the to-hit is with the DM, the attack stays on that enemy: the call
  // was against its AC. If it falls before the damage lands, the lock lifts.
  if (attackFlow.rolledAt && attackFlow.step !== "ready") {
    if ([...select.options].some(option => option.value === attackFlow.rolledAt)) select.value = attackFlow.rolledAt;
    else attackFlow.rolledAt = null;
  }
  select.disabled = Boolean(attackFlow.rolledAt) && attackFlow.step !== "ready";
  select.title = select.disabled ? "Rolled against " + attackFlow.rolledAt + ": the damage goes there too" : "";

  const steps = $("attack-steps");
  // A saving-throw spell (Fireball, Flame Strike) can catch several enemies:
  // tick each one in the area instead of picking a single target, and the
  // same damage roll goes to all of them (the DM rolls each one's save).
  const area = Boolean(attack?.save && attack.area); // area spells only: Sacred Flame still has one target
  select.closest("label").hidden = area;
  if (!attack) { steps.replaceChildren(); return; }
  const chosenOptions = options.filter(isOn);
  const built = buildAttack(attack, chosenOptions, { crit: attackFlow.crit, extraCritDice: attack.ranged ? 0 : sheet.critExtraDice ?? 0 }); // Brutal Critical is melee only
  const parts = [];
  if (!attackFlow.area) attackFlow.area = new Set();
  const standingNames = [...select.options].map(option => option.value).filter(Boolean);
  for (const name of [...attackFlow.area]) if (!standingNames.includes(name) && !attackFlow.sent.includes(name)) attackFlow.area.delete(name);
  // Start from the dropdown's enemy once per attack; after that an empty
  // list means the player unticked everyone.
  if (area && !attackFlow.areaSeeded) {
    attackFlow.areaSeeded = true;
    if (select.value && !attackFlow.area.size) attackFlow.area.add(select.value);
  }
  if (area) {
    const box = document.createElement("fieldset");
    box.className = "area-targets";
    const legend = document.createElement("legend");
    legend.textContent = "Who's in the area? Tick every target";
    box.append(legend);
    if (!standingNames.length) box.append(stepText("No enemies standing.", "fineprint"));
    for (const name of standingNames) {
      const label = document.createElement("label");
      const tick = document.createElement("input");
      tick.type = "checkbox";
      tick.checked = attackFlow.area.has(name);
      tick.disabled = attackFlow.sent.includes(name);
      tick.onchange = () => { if (tick.checked) attackFlow.area.add(name); else attackFlow.area.delete(name); drawAttack(); };
      label.append(tick, " " + [...select.options].find(option => option.value === name).textContent + (attackFlow.sent.includes(name) ? " · sent" : ""));
      box.append(label);
    }
    parts.push(box);
  }
  // Spend the slot (or Channel Divinity) when the spell is cast, and a
  // superiority die when its maneuver is used on a hit.
  const spend = stage => {
    let next = readRes(me);
    const notes = [];
    if (!attackFlow.spent) {
      if (baseAttack.slot && attackFlow.level && !up) {
        next = spendResource(sheet, next, slotKey(attackFlow.level));
        notes.push("Used a " + ORDINAL[attackFlow.level] + "-level slot (" + resourceLeft(sheet, next, slotKey(attackFlow.level)) + " left)");
        if (baseAttack.lasting) { lastingUp.set(lastingKey, attackFlow.level); lastingCast.set(lastingKey, turnTag()); }
        if (baseAttack.concentration) setCondition("Concentrating", 1);
      }
      if (baseAttack.spends) {
        next = spendResource(sheet, next, baseAttack.spends);
        notes.push("Used " + baseAttack.spends + " (" + resourceLeft(sheet, next, baseAttack.spends) + " left)");
      }
      attackFlow.spent = true;
    }
    if (stage === "damage" && !attackFlow.spentManeuver) {
      for (const option of chosenOptions.filter(option => option.spends)) {
        next = spendResource(sheet, next, option.spends);
        notes.push("Used a " + option.spends.replace(/ dice$/, " die") + " (" + resourceLeft(sheet, next, option.spends) + " left)");
      }
      attackFlow.spentManeuver = true;
    }
    if (notes.length) {
      attackFlow.notes = [...(attackFlow.notes ?? []), ...notes];
      saveRes(me, next);
      drawHp();
      showOptions(); // Moves stops suggesting what just ran out
    }
  };
  let blocked = "";
  if (baseAttack.slot && !attackFlow.spent && !levels.length && !up) {
    blocked = "No spell slots left for " + baseAttack.name + " (it needs a " + ORDINAL[baseAttack.slot] + "-level slot or higher). Take a long rest, or fix the dots under Resources.";
  } else if (baseAttack.whileRaging && !res.raging) {
    blocked = baseAttack.name + " is only while you're raging. Start a rage first (This turn, above).";
  } else if (baseAttack.spends && !attackFlow.spent && resourceLeft(sheet, res, baseAttack.spends) < 1) {
    blocked = "No " + baseAttack.spends + " left — it comes back on a rest.";
  }
  const onceText = turnBlock(me, baseAttack);
  const once = Boolean(onceText);
  const rollDamage = () => { spend("damage"); openDice(built.damage, attack.name + " damage", total => {
    dice.onResult = null; // one roll per tap: a second tap doesn't replace the damage
    attackFlow.damage = total;
    attackFlow.step = "damage";
    drawAttack();
    setTimeout(closeDice, 1200);
  }); };
  const made = attacksThisTurn(me);
  // Past the Attack action's swings, another attack needs something else
  // (Action Surge, a bonus-action attack): a second tap says so.
  const cap = baseAttack.perAction ? attackCap(me, baseAttack.perAction) : 0;
  const actionDone = Boolean(baseAttack.perAction) && made >= cap;
  // Nothing left to attack with this turn (the action is spent and no
  // bonus-action attack is waiting): moving on means ending the turn, so the
  // button takes the player back up to the turn card instead of offering a
  // free swing.
  const turnDone = attacksSpent(me);
  // Action used, a bonus-action attack still open: say so instead of "Next attack".
  const bonusOnly = !turnDone && actionSpent(me) ? bonusAttacksLeft(me) : [];
  // The card stays on this attack's result, so the turn guide up top keeps
  // pointing at End my turn.
  const next = turnDone ? stepButton("Done attacking: end your turn ▲", "quiet", () => {
    showTab("combat");
    scrollToCard($("combat-head"), TURN_CARD_GLIDE);
  }) : bonusOnly.length ? stepButton("Bonus action left: " + bonusOnly.join(" or "), "quiet", () => {
    resetAttack(); drawAttack();
    const pick = attacksFor(me).findIndex(attack => attack.name === bonusOnly[0]);
    if (pick >= 0 && pick !== attackFlow.index) $("attack-list").children[pick]?.click();
  }) : stepButton(baseAttack.perAction && made && made < cap
    ? "Next attack (" + (cap - made) + " more this turn" + (cap > baseAttack.perAction ? ", Action Surge" : "") + ")"
    : actionDone ? "Attack action done" + (made > baseAttack.perAction ? " (+" + (made - baseAttack.perAction) + " extra)" : "") : "Next attack", "quiet", event => {
      if (actionDone && !confirmTap(event.currentTarget, "Tap again: an extra attack (Action Surge or a bonus action)")) return;
      resetAttack(); drawAttack();
    });
  // Rolled with advantage or disadvantage but only one d20 went in: roll the
  // other one here so the higher (or lower) roll, crit included, is the one
  // that counts and gets sent.
  const secondRoll = () => {
    if (!attackFlow.toHit || attackFlow.toHit.typed || attackFlow.second || attackFlow.toHit.mode !== "normal" || built.save || attackFlow.ask) return [];
    const take = mode => stepButton(mode === "advantage" ? "Advantage? Roll the second d20" : "Disadvantage? Roll the second d20", "quiet", () => {
      openDice(built.toHit, attack.name + " to hit (" + mode + ")", (total, result) => {
        dice.onResult = null; // one roll per tap
        const first = attackFlow.toHit;
        const kept = keepD20(first, result, mode);
        attackFlow.second = true;
        attackFlow.toHit = kept;
        attackFlow.crit = kept.critical;
        attackFlow.step = kept.critical ? "hit" : kept.fumble ? "miss" : "rolled";
        attackFlow.notes = [...(attackFlow.notes ?? []), "Rolled " + first.natural + " and " + result.natural + " with " + mode + ": " + kept.natural + " counts."];
        drawAttack();
        setTimeout(closeDice, 1200);
      });
    });
    return [take("advantage"), take("disadvantage")];
  };
  const tellMiss = () => {
    const target = $("attack-target").value;
    const rolled = attackFlow.toHit ? " (" + (attackFlow.toHit.fumble ? "natural 1" : attackFlow.toHit.total + " to hit") + ")" : "";
    attackFlow.missText = "🎯 missed " + (target || "the target") + " with " + attack.name + rolled;
    if (!secondRoll().length) flushMiss(); // nothing left to change it
  };

  const extras = [];
  for (const note of attackFlow.notes ?? []) parts.push(stepText("✨ " + note, "fineprint"));
  if (attackFlow.step === "ready" && baseAttack.custom) {
    extras.push(stepButton("Remove " + baseAttack.name, "quiet", event => {
      if (!confirmTap(event.currentTarget, "Tap again to remove " + baseAttack.name)) return;
      storage.set(customKey(me), JSON.stringify(customAttacks(me).filter(entry => entry.name !== baseAttack.name)));
      attackFlow.index = 0;
      resetAttack();
      drawAttack();
    }));
  }
  if (attackFlow.step === "ready" && up) {
    parts.push(stepText(baseAttack.name + " is up (cast with a " + ORDINAL[attackFlow.level] + "-level slot): this attack uses no slot.", "fineprint"));
    extras.push(stepButton("Cast it again", "quiet", () => { lastingUp.delete(lastingKey); drawAttack(); }));
  } else if (attackFlow.step === "ready" && baseAttack.lasting && !attackFlow.spent) {
    extras.push(stepButton("It's already up — attack without a slot", "quiet", () => {
      lastingUp.set(lastingKey, attackFlow.level ?? baseAttack.slot);
      drawAttack();
    }));
  }
  if (attackFlow.step === "ready" && baseAttack.slot && levels.length && !up) {
    const pick = document.createElement("label");
    pick.className = "attack-target";
    pick.textContent = "Cast with";
    const levelSelect = document.createElement("select");
    levelSelect.append(...levels.map(level => new Option(
      ORDINAL[level] + "-level slot · " + resourceLeft(sheet, res, slotKey(level)) + " left"
        + (baseAttack.upcast && level > baseAttack.slot ? " · +" + (level - baseAttack.slot) + baseAttack.upcast.replace(/^1/, "") + " damage" : ""), String(level))));
    levelSelect.value = String(attackFlow.level);
    levelSelect.onchange = () => { attackFlow.level = Number(levelSelect.value); drawAttack(); };
    pick.append(levelSelect);
    parts.push(pick);
  }
  if (attackFlow.step === "ready" && blocked) {
    parts.push(stepText(blocked, "is-miss"));
  } else if (attackFlow.step === "ready") {
    if (built.save) {
      if (once) parts.push(stepText(onceText, "is-miss"));
      parts.push(stepText("Each target tries a " + built.save + " to resist. The DM rolls those for them."),
        stepButton("Roll damage · " + built.damage, once ? "quiet" : "cta", event => {
          if (once && !confirmTap(event.currentTarget, "Tap again: use it anyway")) return;
          markUsedOnce(me, baseAttack);
          rollDamage();
        }));
    } else {
      if (baseAttack.perAction) parts.push(stepText(attackCountText(me, baseAttack), "fineprint attack-count"));
      const startToHit = () => {
        spend("hit");
        if (baseAttack.perAction) countAttack(me);
        markUsedOnce(me, baseAttack);
        // A Frenzy swing makes this rage a frenzy: exhaustion when it ends.
        if (baseAttack.whileRaging) storage.set(FRENZY_KEY(me), "1");
      };
      const landToHit = result => {
          attackFlow.toHit = result;
          attackFlow.crit = result.critical;
          attackFlow.step = result.critical ? "hit" : result.fumble ? "miss" : "rolled";
          // As at the table: the roll goes to the DM, who calls hit or miss.
          // A natural 20 or 1 needs no call.
          const target = $("attack-target").value;
          if (attackFlow.step === "rolled" && target && backend.postAction && Array.isArray(state?.actions)) {
            const cast = baseAttack.slot && attackFlow.level ? " (" + ORDINAL[attackFlow.level] + "-level)" : "";
            const text = attackAskText(target, "with " + attack.name + cast + ", " + result.total + " to hit");
            const after = Math.max(0, ...(state.actions ?? []).map(action => Number(action.id) || 0));
            attackFlow.ask = { text, after, character: me };
            attackFlow.rolledAt = target; // the DM calls it against this enemy's AC: the damage goes there too
            attackFlow.step = "waiting";
            backend.postAction(room, me, text).then(sync).catch(() => { attackFlow.ask = null; attackFlow.step = "rolled"; drawAttack(); });
          }
          drawAttack();
      };
      if (once) parts.push(stepText(onceText, "is-miss"));
      parts.push(stepButton("Roll to hit · " + built.toHit + (built.mode === "advantage" ? " (advantage)" : ""), once ? "quiet" : "cta", event => {
        if (once && !confirmTap(event.currentTarget, "Tap again: use it anyway")) return;
        startToHit();
        openDice(built.toHit, attack.name + " to hit", (total, result) => {
          // One roll per tap: a second tap on Roll before the tray closes is
          // a plain roll, never a silent swap of the one the card showed.
          dice.onResult = null;
          landToHit(result);
          setTimeout(closeDice, 1200);
        }, built.mode);
      }));
      typedToHit = total => {
        if (!$("attack-target").value) return "Pick which enemy you're attacking on the Combat tab, then send it.";
        startToHit();
        landToHit({ total, natural: null, critical: false, fumble: false, mode: "normal", typed: true });
        return "";
      };
    }
  } else if (attackFlow.step === "waiting") {
    parts.push(stepText(attackFlow.toHit.total + " to hit" + rolledText(attackFlow.toHit) + ". Waiting for the DM to say hit or miss…", "is-big waiting-call"));
    extras.push(stepButton("Roll damage anyway", "quiet", rollDamage),
      stepButton("It missed", "quiet", () => {
        // Answer the waiting call itself, rather than a second "missed" line:
        // the DM's question closes and the swing counts once.
        const ask = attackFlow.ask;
        const line = ask && (state.actions ?? []).filter(action => Number(action.id) > ask.after && action.name === partyName(ask.character) && action.text === ask.text).at(-1);
        attackFlow.missTold = true;
        attackFlow.step = "miss";
        if (line && backend.editAction) backend.editAction(room, line.id, attackVerdictText(line.text, "miss")).then(sync).catch(() => {});
        drawAttack();
      }));
  } else if (attackFlow.step === "rolled") {
    // Players never see enemy AC, so there's no "does it hit?" to answer:
    // roll damage and send it; the DM's Hits to apply checks the roll against
    // the AC and flags a miss. "It missed" is there for when you know.
    parts.push(stepText(attackFlow.toHit.total + " to hit" + rolledText(attackFlow.toHit) + ". Roll damage and send it: the DM checks whether it hits.", "is-big"),
      stepButton("Roll damage · " + built.damage, "cta", rollDamage));
    extras.push(stepButton("It missed", "quiet", () => { attackFlow.step = "miss"; drawAttack(); }), ...secondRoll());
  } else if (attackFlow.step === "hit") {
    parts.push(stepText(attackFlow.crit ? "CRITICAL HIT! You rolled a 20: your damage dice are doubled."
      : attackFlow.ask ? "✓ HIT! The DM says your " + attackFlow.toHit.total + " gets through. Roll damage." : "Hit with " + attackFlow.toHit.total + "!", attackFlow.crit ? "is-crit" : "is-hit"),
      stepButton("Roll damage · " + built.damage, "cta", rollDamage));
    extras.push(...secondRoll());
  } else if (attackFlow.step === "miss") {
    tellMiss();
    parts.push(stepText(attackFlow.toHit?.fumble ? "You rolled a 1: that always misses."
      : attackFlow.ask ? "✗ MISS. The DM says your " + attackFlow.toHit.total + " doesn't get through." : "Miss.", "is-miss"),
      stepText(!backend.postAction || !Array.isArray(state?.actions) ? "" : attackFlow.missTold ? "The table sees the miss." : "The miss goes to the table when you move on.", "fineprint"), next);
    next.className = "cta";
    extras.push(...secondRoll());
  } else if (attackFlow.step === "damage") {
    const choiceNotes = chosenOptions.filter(option => option.choices).map(option => {
      const name = attackFlow.choice?.[option.name] ?? option.choices[0][0];
      const effect = option.choices.find(([choice]) => choice === name)?.[1];
      return " + " + name + (effect ? " (" + effect + ")" : "");
    }).join("");
    const detail = "with " + attack.name + choiceNotes + (baseAttack.slot && attackFlow.level ? " (" + ORDINAL[attackFlow.level] + "-level)" : "") + (built.save ? ", " + built.save
      : ", " + attackFlow.toHit.total + " to hit" + (attackFlow.crit ? ", critical" : ""));
    parts.push(stepText(attackFlow.damage + " " + (attack.type ?? "") + " damage" + (attackFlow.crit ? " (critical)" : ""), "is-big"));
    const target = select.value;
    if (area && backend.postAction && Array.isArray(state?.actions)) {
      // One roll, one hit report per enemy in the area.
      const waiting = [...attackFlow.area].filter(name => !attackFlow.sent.includes(name));
      const send = stepButton(waiting.length ? "Send " + attackFlow.damage + " to the DM · " + waiting.join(", ")
        : attackFlow.sent.length ? "Sent to " + attackFlow.sent.join(", ") : "Tick the targets above to send", "cta", async () => {
        send.disabled = true;
        // This roll and its sent list, taken now: Next attack or another
        // attack mid-batch starts a fresh flow, and must not get these.
        const damage = attackFlow.damage;
        const sentList = attackFlow.sent;
        try {
          for (const name of waiting) {
            await backend.postAction(room, me, hitReportText(name, damage, detail));
            sentList.push(name);
          }
          sync();
          drawAttack();
        } catch (error) {
          send.disabled = false;
          send.textContent = error.message + " — tap to retry";
          drawAttack();
        }
      });
      send.disabled = !waiting.length;
      parts.push(send);
      if (attackFlow.sent.length) parts.push(stepText("Sent to the DM for " + attackFlow.sent.join(", ") + ". Each makes the save; the DM rolls it. Missed someone? Tick them and send again.", "fineprint"));
    } else if (backend.postAction && Array.isArray(state?.actions)) {
      // One attack, one target: once sent, the same roll can't go to another
      // enemy (only an area spell's roll goes to several).
      const already = built.save ? attackFlow.sent.includes(target) : attackFlow.sent.length > 0;
      const send = stepButton(already ? "Sent to " + attackFlow.sent.join(", ") : target ? "Send " + attackFlow.damage + " to the DM · " + target : "Pick the target above to send", "cta", async () => {
        const name = $("attack-target").value;
        if (!name) { $("attack-target").focus(); return; }
        if (attackFlow.sent.includes(name) || (!built.save && attackFlow.sent.length)) return; // once
        send.disabled = true;
        try {
          await backend.postAction(room, me, hitReportText(name, attackFlow.damage, detail));
          attackFlow.sent.push(name);
          sync();
          drawAttack();
        } catch (error) {
          send.disabled = false;
          send.textContent = error.message + " — tap to retry";
        }
      });
      send.disabled = !target || already;
      parts.push(send);
      if (attackFlow.sent.length) parts.push(stepText("Sent to the DM for " + attackFlow.sent.join(", ") + (built.save ? ". Pick another target to send the same roll." : "."), "fineprint"));
    } else {
      parts.push(stepText("Tell the DM: " + attackFlow.damage + " damage.", "fineprint"));
    }
    // Once the damage is with the DM, moving on is the next thing to do.
    const delivered = attackFlow.sent.length > 0 || !backend.postAction || !Array.isArray(state?.actions);
    if (delivered) { next.className = "cta"; parts.push(next); } else extras.push(next);
  }
  // A rare extra swing the DM allows (a feat or item not on the sheet): kept
  // out of the way, two taps.
  if (turnDone && (attackFlow.step === "miss" || attackFlow.step === "damage")) {
    extras.push(stepButton("Another attack (only if the DM allows it)", "quiet", event => {
      if (!confirmTap(event.currentTarget, "Tap again: an extra attack your DM allows")) return;
      resetAttack(); drawAttack();
    }));
  }
  steps.replaceChildren(...parts, ...moreFold(extras));
  drawTurnGuide();
  // The last attack of the action is settled (missed, or its damage is with
  // the DM): take the player up to the turn card once, where End my turn (or
  // the bonus action left) is waiting.
  const settled = attackFlow.step === "miss" || (attackFlow.step === "damage" && (attackFlow.sent.length || !backend.postAction || !Array.isArray(state?.actions)));
  const tag = me + "@" + turnTag();
  if (settled && actionSpent(me) && turnEndShown !== tag && !$("attack-card").hidden && document.querySelector('[data-panel="combat"]')?.hidden === false) {
    turnEndShown = tag;
    setTimeout(() => scrollToCard($("combat-head"), TURN_CARD_GLIDE), 900); // after the "sent" line shows
  }
  drawTypedRoll();
}
$("attack-target").onchange = () => drawAttack();

const hitRetargets = new Map(); // hit action id → enemy id the DM pointed it at
function drawHitInbox() {
  const box = $("hit-inbox");
  const combat = state?.combat;
  if (!isHost || !combat || !encounterLoaded) { box.hidden = true; return; }
  const since = Number(storage.get("dnd-combat-start:" + room) ?? 0); // last action id before the fight
  const handled = handledHits();
  const pending = (state.actions ?? [])
    .map(action => ({ action, report: parseHitReport(action.text) }))
    .filter(({ action, report }) => report && !report.handled && !handled.has(action.id) && Number(action.id) > since);
  // To-hit rolls waiting for the DM's call: Hit or Miss, one tap, with the
  // armor check done. The player's card goes on to damage (or stops).
  const asks = (state.actions ?? [])
    .map(action => ({ action, ask: parseAttackAsk(action.text) }))
    .filter(({ action, ask }) => ask && !ask.verdict && !handled.has(action.id) && Number(action.id) > since);
  box.hidden = !pending.length && !asks.length;
  $("hit-inbox-title").textContent = asks.length ? "Call it: hit or miss?" + (pending.length ? " · Hits to apply" : "") : "Hits to apply";
  const askItems = asks.map(({ action, ask }) => {
    const item = document.createElement("li");
    item.className = "hit-ask";
    const target = enemies.find(enemy => enemy.name === ask.enemy);
    const versus = target && ask.toHit !== null ? (ask.toHit >= target.ac ? " · " + ask.toHit + " vs AC " + target.ac + " ✓ hits" : " · " + ask.toHit + " vs AC " + target.ac + " ✗ misses") : "";
    const text = document.createElement("span");
    text.textContent = action.name.replace(/^The /, "") + " attacks " + ask.enemy + " " + ask.detail + versus;
    const call = async verdict => {
      const next = attackVerdictText(action.text, verdict);
      // Shown at once; kept only once the story line is saved, so a failed
      // call stays in the list to tap again (and the player isn't left waiting).
      state.actions = state.actions.map(entry => entry.id === action.id ? { ...entry, text: next } : entry);
      drawCombat();
      try {
        if (backend.editAction) await backend.editAction(room, action.id, next);
        storage.set(HANDLED_KEY(), JSON.stringify([...handledHits(), action.id].slice(-300)));
        if (verdict === "miss") addNarration(action.name.replace(/^The /, "") + " misses " + ask.enemy + ".");
      } catch (error) {
        state.actions = state.actions.map(entry => entry.id === action.id ? { ...entry, text: action.text } : entry);
        $("combat-status").textContent = "Couldn't send the call (" + error.message + "). Tap it again.";
        drawCombat();
      }
    };
    const buttons = document.createElement("div");
    buttons.className = "hit-buttons";
    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = target && ask.toHit !== null && ask.toHit < target.ac ? "ghost" : "cta";
    hit.textContent = "Hit";
    hit.onclick = () => call("hit");
    const miss = document.createElement("button");
    miss.type = "button";
    miss.className = target && ask.toHit !== null && ask.toHit < target.ac ? "cta" : "ghost";
    miss.textContent = "Miss";
    miss.onclick = () => call("miss");
    buttons.append(hit, miss);
    item.append(text, buttons);
    return item;
  });
  $("hit-list").replaceChildren(...askItems, ...pending.map(({ action, report }) => {
    const item = document.createElement("li");
    // Sent at an enemy that's already down or isn't in this encounter (a
    // stale view, a typo): the DM can point it at one that's still standing.
    const named = enemies.find(enemy => enemy.name === report.enemy);
    // A picked enemy that has since gone down (another hit finished it) no
    // longer counts: the DM picks again.
    const picked = enemies.find(enemy => enemy.id === hitRetargets.get(action.id) && enemy.hp > 0);
    if (!picked) hitRetargets.delete(action.id);
    const target = picked ?? named;
    let retarget = null;
    if (!named || named.hp <= 0) {
      retarget = document.createElement("select");
      retarget.className = "hit-retarget";
      retarget.setAttribute("aria-label", "Apply this hit to");
      retarget.append(new Option(named ? "Apply to… (" + named.name + " is down)" : "Apply to…", ""),
        ...enemies.filter(enemy => enemy.hp > 0).map(enemy => new Option(enemy.name, enemy.id)));
      retarget.value = picked?.id ?? "";
      retarget.onchange = () => {
        if (retarget.value) hitRetargets.set(action.id, retarget.value); else hitRetargets.delete(action.id);
        drawHitInbox();
      };
    }
    const text = document.createElement("span");
    const versus = target && report.toHit !== null
      ? (report.crit ? " · critical" : report.toHit >= target.ac ? " · " + report.toHit + " vs AC " + target.ac + " ✓" : " · ⚠ " + report.toHit + " vs AC " + target.ac + " — a miss?")
      : "";
    text.textContent = action.name.replace(/^The /, "") + " hit " + report.enemy + " for " + report.amount
      + (report.detail ? " " + report.detail.replace(/, \d+ to hit|, critical/g, "") : "") + versus
      + (picked ? " → " + picked.name + " (HP " + picked.hp + "/" + picked.maxHp + ")"
        : target ? " (HP " + target.hp + "/" + target.maxHp + ")" : " — not in your encounter");
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "danger-soft";
    apply.textContent = "Apply";
    // Pointed at a downed or unknown enemy with no standing one picked: the
    // hit would be lost, so it waits for a pick (or Dismiss).
    const needsPick = Boolean(retarget) && !picked;
    apply.disabled = !target || needsPick;
    const who = action.name.replace(/^The /, "");
    const how = report.detail.match(/^with ([^,]+)/)?.[1] ?? "";
    const hitEnemy = (amount, note = "") => {
      markHit(action, "applied");
      const before = enemies.find(enemy => enemy.id === target.id);
      enemies = enemies.map(enemy => enemy.id === target.id ? applyHp(enemy, -amount) : enemy); // just that one
      const after = enemies.find(enemy => enemy.id === target.id);
      addNarration(target.name + (amount ? " takes " + amount + " damage" : " takes no damage") + ", dealt by " + who + (how ? " with " + how : "") + note
        + (after?.hp === 0 && before?.hp > 0 ? " and goes down." : after && after.hp <= after.maxHp / 2 && before && before.hp > before.maxHp / 2 ? " and is bloodied." : "."));
      saveEncounter();
      drawEncounter();
    };
    apply.onclick = () => hitEnemy(report.amount);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "quiet";
    dismiss.textContent = "Dismiss";
    dismiss.onclick = () => { markHit(action, "dismissed"); drawCombat(); };
    const buttons = document.createElement("div");
    buttons.className = "hit-buttons";
    buttons.append(apply);
    if (report.halfOnSave) {
      const half = document.createElement("button");
      half.type = "button";
      half.className = "ghost";
      half.textContent = "Saved: " + Math.floor(report.amount / 2);
      half.disabled = !target || needsPick;
      half.onclick = () => hitEnemy(Math.floor(report.amount / 2), " (saved for half)");
      buttons.append(half);
    }
    // The enemy's notes say it resists something (a swarm, a golem): one tap
    // for half, with the note right there so the DM can check the damage type.
    const resists = target ? String(target.abilities ?? "").match(/[^.;]*\bresist[^.;]*/i)?.[0].trim() ?? "" : "";
    // The hit's damage type, from the attacker's sheet ("Shadow Slash (E)" is
    // slashing): when the note names it, the resistance is certain.
    const damageType = attacksFor(state.party.findIndex(character => character.name === action.name)).find(attack => how.startsWith(attack.name))?.type ?? "";
    const resisted = Boolean(resists && damageType && new RegExp("\\b" + damageType + "\\b", "i").test(resists));
    if (resists && (!report.save || report.save.rider)) {
      const half = document.createElement("button");
      half.type = "button";
      half.className = resisted ? "cta" : "ghost";
      half.textContent = "Resists: " + Math.floor(report.amount / 2);
      half.title = resists;
      half.disabled = !target || needsPick;
      half.onclick = () => hitEnemy(Math.floor(report.amount / 2), " (resisted, half)");
      buttons.append(half);
      text.textContent += " · " + resists;
    }
    // One tap: roll the enemy's save against the spell's DC and apply the result.
    if (report.save && target && !needsPick) {
      const bonus = saveBonus(target, report.save.ability);
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "cta";
      saveButton.textContent = "Roll " + report.save.ability + " save (" + (bonus >= 0 ? "+" : "") + bonus + ")" + (resisted ? " · resists " + damageType : "");
      saveButton.onclick = () => {
        if (report.save.rider) {
          // A maneuver: the damage lands either way; the save decides the effect.
          const outcome = enemySave(target, { ...report.save, amount: report.amount, half: false });
          const effect = report.save.effect || "the effect";
          hitEnemy(resisted ? Math.floor(report.amount / 2) : report.amount, (resisted ? " (resists " + damageType + ")" : "") + " (" + report.save.ability + " save " + outcome.total + " vs DC " + report.save.dc + ": "
            + (outcome.saved ? "saved, no " + effect : "failed, " + effect) + ")");
          $("combat-status").textContent = target.name + " rolled " + outcome.total + " on the " + report.save.ability + " save (DC " + report.save.dc + "): "
            + (outcome.saved ? "saved, no " + effect : "failed: " + effect) + ". " + (resisted ? Math.floor(report.amount / 2) + " damage applied (resists " + damageType + ")." : report.amount + " damage applied.");
          return;
        }
        const outcome = enemySave(target, { ...report.save, amount: report.amount, half: report.halfOnSave });
        const dealt = resisted ? Math.floor(outcome.damage / 2) : outcome.damage; // resistance halves after the save
        hitEnemy(dealt, " (" + report.save.ability + " save " + outcome.total + " vs DC " + report.save.dc + ": " + (outcome.saved ? "saved" : "failed") + (resisted ? ", resists " + damageType : "") + ")");
        $("combat-status").textContent = target.name + " rolled " + outcome.total + " on the " + report.save.ability + " save (DC " + report.save.dc + "): "
          + (outcome.saved ? "saved, " : "failed, ") + dealt + " damage applied" + (resisted ? " (resists " + damageType + ")" : "") + ".";
      };
      buttons.prepend(saveButton);
    }
    buttons.append(dismiss);
    item.append(text, ...(retarget ? [retarget] : []), buttons);
    return item;
  }));
  if ((pending.length || asks.length) && currentTab !== "combat") $("tab-combat").classList.add("has-news");
}

async function setInitiative(character, value, status) {
  const number = Math.round(Number(value));
  if (String(value).trim() === "" || !Number.isFinite(number)) {
    status.textContent = "Enter your initiative total.";
    return;
  }
  try {
    await backend.combatInitiative(room, character, number);
    state.combat = { ...state.combat, party: { ...state.combat.party, [character]: number } };
    status.textContent = "Initiative " + number + " recorded.";
    drawCombat();
    sync();
  } catch (error) {
    status.textContent = error.message;
  }
}
$("init-roll").onclick = () => openDice(initiativeExpression(), "Initiative", async total => {
  dice.onResult = null; // one initiative per tap
  await setInitiative(myIndex(), total, $("dice-status"));
  setTimeout(closeDice, 1500); // recorded: back to the fight
}, initiativeMode());
$("combat-init").onsubmit = event => {
  event.preventDefault();
  setInitiative(myIndex(), $("init-value").value, $("init-status"));
  $("init-value").value = "";
};
// A player ends their own turn with a story line; the DM's phone (which
// runs the turn order) sees it and moves to the next turn.
const END_TURN = "⏭️ ends their turn";
// Passing the turn goes through the database (migration 0009, or the local
// server), so it works even when the DM's phone is asleep. Until 0009 runs,
// it falls back to asking the DM's phone with a story line.
let passTurnFallback = false;
let passTurnTimer;
$("combat-ask").onclick = () => {
  showTab("moves");
  askClaude("It's my turn in this fight. What are my best options this turn?");
};
$("combat-end-turn").onclick = async () => {
  flushMiss();
  const button = $("combat-end-turn");
  const me = Number($("character").value);
  button.disabled = true;
  button.textContent = "Passing the turn…";
  $("combat-status").textContent = "";
  clearTimeout(passTurnTimer);
  try {
    if (backend.combatPassTurn && !passTurnFallback) {
      try {
        const next = await backend.combatPassTurn(room, me);
        state.combat = { ...state.combat, turn: next.turn, round: next.round };
        drawCombat();
        sync();
        return;
      } catch (error) {
        if (!/could not find the function/i.test(error.message)) throw error;
        passTurnFallback = true;
      }
    }
    await backend.postAction(room, me, END_TURN);
    sync();
    // If the DM's phone doesn't pick it up, say so instead of spinning forever.
    passTurnTimer = setTimeout(() => {
      if (state?.combat?.turn !== "pc:" + me) return;
      button.disabled = false;
      button.textContent = "End my turn ▶";
      $("combat-status").textContent = "The DM's phone hasn't moved the turn on. It needs the app open, or the DM can tap Next turn.";
    }, 8000);
  } catch (error) {
    button.disabled = false;
    button.textContent = "End my turn ▶";
    $("combat-status").textContent = error.message;
    sync();
  }
};
let advancing = false;
async function handleTurnEnds() {
  if (!isHost || !state?.combat || advancing) return;
  const key = "dnd-turn-handled:" + room;
  const handled = storage.get(key);
  const started = storage.get("dnd-combat-start:" + room);
  if (handled === null && started === null) {
    // First look at this fight on this phone: only react to turns ended from now on.
    storage.set(key, String(Math.max(0, ...(state.actions ?? []).map(action => Number(action.id) || 0))));
    return;
  }
  // Never older than the start of this fight, so a turn ended in an earlier
  // fight can't skip someone now.
  const since = Math.max(Number(handled ?? 0), Number(started ?? 0));
  const ends = (state.actions ?? []).filter(action => action.text === END_TURN && Number(action.id) > since);
  if (!ends.length) return;
  const newest = String(Math.max(...ends.map(action => Number(action.id))));
  const current = state.combat.turn;
  if (!ends.some(action => current === "pc:" + action.character)) {
    storage.set(key, newest);
    return;
  }
  advancing = true;
  try {
    // Mark it handled only once the turn has moved on; a failed publish is
    // retried on the next sync.
    if (await stepTurn(1)) storage.set(key, newest);
  } finally {
    advancing = false;
  }
}

async function stepTurn(direction) {
  const { turn, round } = nextTurn(liveOrder(), state.combat.turn, state.combat.round, direction);
  for (const id of ["combat-advance", "combat-prev"]) $(id).disabled = true;
  try {
    await publishCombat({ turn, round });
    $("combat-status").textContent = "";
    return true;
  } catch (error) {
    $("combat-status").textContent = error.message;
    return false;
  } finally {
    for (const id of ["combat-advance", "combat-prev"]) $(id).disabled = false;
  }
}
$("combat-advance").onclick = () => stepTurn(1);
$("combat-stop").onclick = () => {
  if (state?.combat && confirmTap($("combat-stop"), "Tap again to end combat for everyone")) toggleCombat();
};
$("combat-finish").onclick = () => {
  if (state?.combat && confirmTap($("combat-finish"), "Tap again to end combat for everyone")) toggleCombat();
};
$("combat-prev").onclick = () => stepTurn(-1);
$("enc-combat").onclick = () => {
  if (state?.combat && !state?.combatUnavailable && !confirmTap($("enc-combat"), "Tap again to end combat for everyone")) return;
  toggleCombat();
};
async function toggleCombat() {
  if (state?.combatUnavailable) {
    $("enc-combat-status").textContent = "Combat needs a one-time database update: run supabase/migrations/0004_dnd_combat.sql in the Supabase SQL editor.";
    return;
  }
  $("enc-combat").disabled = true;
  try {
    if (state.combat) {
      clearTimeout(combatTimer); // a pending enemy update mustn't reopen the fight
      await backend.combatEnd(room);
      state.combat = null;
      endRages();
      $("enc-combat-status").textContent = "Combat ended.";
      drawCombat();
    } else {
      // Enemies who haven't rolled get initiative now.
      enemies = enemies.map(enemy => enemy.initiative === null
        ? { ...enemy, initiative: roll("d20" + (enemy.init >= 0 ? "+" : "") + enemy.init).total } : enemy);
      saveEncounter(); // keeps the rolls with the table too
      storage.set("dnd-combat-start:" + room, String(Math.max(0, ...(state.actions ?? []).map(action => Number(action.id) || 0))));
      await publishCombat({ round: 1, turn: null, reset: true });
      drawEncounter();
      showTab("combat");
    }
    sync();
  } catch (error) {
    // Shown on both cards: the DM may have tapped either one.
    $("enc-combat-status").textContent = $("combat-status").textContent = error.message;
  } finally {
    $("enc-combat").disabled = false;
  }
}

// What else an enemy's hit does (the Assassin's poison, a wolf's trip): roll
// the extra damage (doubled on a crit) and offer it whole or halved for a
// save the player makes; an effect-only rider just says what to ask for.
function riderRow(rider, critical, index, who, source, landed = { done: false }) {
  const box = document.createElement("div");
  box.className = "apply-row rider-row";
  const text = document.createElement("span");
  text.className = "fineprint";
  const saveText = rider.save ? "DC " + rider.dc + " " + rider.save + " save" : "";
  if (!rider.damage) {
    text.textContent = "Plus: " + who + " makes a " + saveText + " or " + (rider.effect ?? "suffers the effect") + ". Ask them to roll it.";
    box.append(text);
    return box;
  }
  const extra = roll(critical ? critExpression(rider.damage) : rider.damage);
  const type = rider.type ? " " + rider.type : "";
  text.textContent = "Plus " + extra.total + type + " [" + extra.breakdown + "]" + (saveText ? ": " + who + " makes a " + saveText + (rider.half ? ", half on a success." : ", none on a success.") : ".");
  const status = document.createElement("span");
  status.className = "fineprint";
  const give = (amount, note, chosen) => {
    for (const button of box.querySelectorAll("button")) button.disabled = true;
    chosen?.classList.add("is-chosen");
    status.textContent = "Applied " + amount + type + " to " + who + ".";
    addNarration(source + " deals " + who + " " + amount + type + " damage" + note + ".");
    const sameHit = landed.done; // the weapon damage of this hit went in first
    landed.done = true;
    adjustHp(index, -amount, status, { sameHit });
  };
  const full = document.createElement("button");
  full.type = "button";
  full.className = "danger-soft";
  full.textContent = (saveText ? "Failed: " : "Apply ") + extra.total + type;
  full.onclick = () => give(extra.total, saveText ? " (failed the save)" : "", full);
  box.append(text, full);
  if (saveText) {
    const saved = document.createElement("button");
    saved.type = "button";
    saved.className = "ghost";
    const amount = rider.half ? Math.floor(extra.total / 2) : 0;
    saved.textContent = "Saved: " + amount;
    saved.onclick = () => amount ? give(amount, " (saved for half)", saved) : (status.textContent = who + " saved: no" + type + " damage.", saved.disabled = full.disabled = true, saved.classList.add("is-chosen"));
    box.append(saved);
  }
  box.append(status);
  return box;
}

// ── To narrate (DM only): what the app resolved, one tap from the update box. ──
const narrateKey = () => "dnd-narrate:" + room;
function addNarration(line) {
  storage.set(narrateKey(), JSON.stringify([...readJson(narrateKey(), []), line].slice(-20)));
  drawNarration();
}
function drawNarration() {
  const lines = isHost ? readJson(narrateKey(), []) : [];
  $("narrate").hidden = !lines.length;
  $("narrate-count").textContent = lines.length ? String(lines.length) : "";
  $("narrate-list").replaceChildren(...lines.map((line, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = line;
    button.onclick = () => {
      setDraft([$("draft").value.trim(), line].filter(Boolean).join(" "));
      $("manual-controls").open = true;
      storage.set(narrateKey(), JSON.stringify(readJson(narrateKey(), []).filter((_, other) => other !== index)));
      drawNarration();
    };
    item.append(button);
    return item;
  }));
}
$("narrate-clear").onclick = () => { storage.remove(narrateKey()); drawNarration(); };

// ── Encounter tracker (DM only, kept on this device) ──
const TEMPLATE_KEY = "dnd-enemy-templates";
const encounterKey = () => "dnd-encounter:" + room;
const readJson = (key, fallback) => { try { return JSON.parse(storage.get(key) ?? "null") ?? fallback; } catch { return fallback; } };
let enemies = [];
let encounterLoaded = false;
const savedTemplates = () => readJson(TEMPLATE_KEY, []);
// The encounter is kept on this phone and, on the hosted app, saved with the
// table (host only, migration 0008) so the DM can switch devices mid-session.
// Which copy wins is decided by whether this device has a change the table
// hasn't confirmed yet (":dirty"), never by comparing this phone's clock with
// the server's: they can be minutes apart, and a reload in the save window
// used to put the old enemies back.
let encounterTimer;
let encounterCloud = true;
let encounterEdits = 0; // bumps on every change, so a slow save can't mark a newer one as saved
const encounterDirtyKey = () => encounterKey() + ":dirty";
function saveEncounter() {
  storage.set(encounterKey(), JSON.stringify(enemies));
  storage.set(encounterKey() + ":at", String(Date.now()));
  if (isHost && state?.combat) schedulePublish();
  if (!backend.encounterSave || !encounterCloud) return;
  storage.set(encounterDirtyKey(), "1");
  const edit = ++encounterEdits;
  clearTimeout(encounterTimer);
  encounterTimer = setTimeout(() => {
    encounterTimer = null;
    backend.encounterSave(room, enemies)
      .then(() => {
        if (edit === encounterEdits) storage.remove(encounterDirtyKey());
        $("encounter-sync").textContent = "Saved with the table: open it on any device where you're signed in as the DM.";
      })
      .catch(error => {
        if (/could not find the function/i.test(error.message)) encounterCloud = false;
        $("encounter-sync").textContent = encounterCloud ? "Couldn't save to the table: " + error.message + " It will try again with your next change."
          : "Saved on this device only. Run supabase/migrations/0008_dnd_encounter.sql to keep it with the table.";
      });
  }, 800);
}
// Back on the page: keep this device's copy, push it, or take the table's
// (pickEncounter in encounter.js).
async function loadCloudEncounter() {
  if (!backend.encounterGet || !isHost) return;
  try {
    const editsBefore = encounterEdits;
    const saved = await backend.encounterGet(room);
    // Changed (and maybe already saved) while this read was out: it's stale.
    if (encounterEdits !== editsBefore) return;
    const choice = pickEncounter({
      cloud: saved,
      local: enemies,
      dirty: storage.get(encounterDirtyKey()) !== null,
      pending: Boolean(encounterTimer),
      savedHere: storage.get(encounterKey() + ":at") !== null
    });
    if (choice === "cloud") {
      enemies = saved.enemies;
      storage.set(encounterKey(), JSON.stringify(enemies));
      storage.set(encounterKey() + ":at", String(Date.now()));
      drawEncounter();
      if (state?.combat) schedulePublish();
    } else if (choice === "push") {
      saveEncounter(); // this device has changes the table hasn't got yet
    }
    if (!storage.get(encounterDirtyKey())) $("encounter-sync").textContent = "Saved with the table: open it on any device where you're signed in as the DM.";
  } catch (error) {
    if (/could not find the function/i.test(error.message)) {
      encounterCloud = false;
      $("encounter-sync").textContent = "Saved on this device only. Run supabase/migrations/0008_dnd_encounter.sql to keep it with the table.";
    }
  }
}

// The party's level, read from the roster ("… · Level 10 · …"): it sorts the
// stock enemies into Minions, Soldiers, Elites and Bosses for this party.
function partyLevel() {
  const levels = (state?.party ?? []).map(member => Number(String(member.role ?? "").match(/Level (\d+)/)?.[1])).filter(Number.isFinite);
  return levels.length ? Math.max(...levels) : 10;
}
function drawTemplateOptions() {
  const custom = savedTemplates();
  // Quick add: one list grouped by how tough each foe is for this party.
  const level = partyLevel();
  const groups = TIERS.map(tier => {
    const group = document.createElement("optgroup");
    group.label = tier + " for a level-" + level + " party";
    group.append(...enemyTemplates.map((template, index) => [template, index]).filter(([template]) => enemyTier(template, level) === tier)
      .map(([template, index]) => new Option(template.name + " · CR " + template.cr + " · AC " + template.ac, "srd:" + index)));
    return group;
  }).filter(group => group.children.length);
  const yours = document.createElement("optgroup");
  yours.label = "Your templates";
  yours.append(...custom.map((template, index) => new Option("★ " + template.name, "custom:" + index)));
  const quick = $("quick-template");
  const kept = quick.value;
  quick.replaceChildren(new Option("Pick an enemy…", ""), ...(custom.length ? [yours] : []), ...groups);
  quick.value = [...quick.options].some(option => option.value === kept) ? kept : "";
  $("enemy-template").replaceChildren(
    new Option("Blank", ""),
    ...custom.map((template, index) => new Option("★ " + template.name + " (yours)", "custom:" + index)),
    ...enemyTemplates.map((template, index) => new Option(template.name + " · AC " + template.ac + " · HP " + template.hp, "srd:" + index))
  );
}
// A template attack's rider (the Assassin's poison) has no form field: it
// rides along with the attack's name while the form is filled from it.
let formRiders = {};
function fillEnemyForm(template) {
  const attacks = template?.attacks ?? [];
  formRiders = Object.fromEntries(attacks.filter(attack => attack[3]).map(attack => [attack[0], attack[3]]));
  $("enemy-name").value = template?.name ?? "";
  $("enemy-ac").value = template?.ac ?? 12;
  $("enemy-hp").value = template?.hp ?? "2d8+2";
  $("enemy-init").value = template?.init ?? 0;
  $("enemy-speed").value = template?.speed ?? 30;
  for (const n of [1, 2]) {
    const [name, hit, damage] = attacks[n - 1] ?? ["", "", ""];
    $("atk" + n + "-name").value = name;
    $("atk" + n + "-hit").value = hit === "" ? "" : hit;
    $("atk" + n + "-dmg").value = damage;
  }
  $("enemy-abilities").value = template?.abilities ?? "";
  $("enemy-saves").value = template?.saves ? formatSaves(template.saves) : "";
}
function enemyFormStats() {
  const typed = [1, 2].map(n => [$("atk" + n + "-name").value.trim(), Number($("atk" + n + "-hit").value) || 0, $("atk" + n + "-dmg").value.trim()]).filter(([name]) => name)
    .map(attack => formRiders[attack[0]] ? [...attack, formRiders[attack[0]]] : attack);
  return {
    name: $("enemy-name").value.trim() || "Enemy",
    ac: Number($("enemy-ac").value) || 10,
    hp: $("enemy-hp").value.trim() || "1",
    init: Number($("enemy-init").value) || 0,
    speed: Number($("enemy-speed").value) || 30,
    // Left the attack fields empty but wrote "Musket +6 (2d8+2)" in the notes: use that.
    attacks: typed.length ? typed : attacksFromNotes($("enemy-abilities").value),
    abilities: $("enemy-abilities").value.trim(),
    saves: parseSaves($("enemy-saves").value)
  };
}
// Enemies added mid-fight roll their own initiative, so they join the order
// without re-rolling the ones already fighting.
const joinFight = added => state?.combat ? rollInitiative(added) : added;
const templateFrom = value => {
  const [kind, index] = String(value).split(":");
  return kind === "srd" ? enemyTemplates[index] : kind === "custom" ? savedTemplates()[index] : null;
};
// One tap: the stock (or saved) stat block goes straight in, HP rolled for each.
$("quick-enemy").onsubmit = event => {
  event.preventDefault();
  const template = templateFrom($("quick-template").value);
  if (!template) { $("quick-status").textContent = "Pick an enemy first."; $("quick-template").focus(); return; }
  const added = joinFight(createEnemies(template, $("quick-count").value, undefined, enemies));
  enemies = [...enemies, ...added];
  saveEncounter();
  drawEncounter();
  $("quick-status").textContent = "Added " + added.length + " × " + template.name + " (HP " + added.map(enemy => enemy.maxHp).join(", ") + ")."
    + (state?.combat ? " Initiative " + added.map(enemy => enemy.initiative).join(", ") + ": they're in the turn order." : "");
};
$("enemy-template").onchange = () => {
  const [kind, index] = $("enemy-template").value.split(":");
  fillEnemyForm(kind === "srd" ? enemyTemplates[index] : kind === "custom" ? savedTemplates()[index] : null);
};
$("enemy-form").onsubmit = event => {
  event.preventDefault();
  const stats = enemyFormStats();
  if (!/^\d+$/.test(stats.hp) && !parseDice(stats.hp)) {
    $("enemy-status").textContent = "HP should be a number or dice like 2d8+2.";
    return;
  }
  const added = joinFight(createEnemies(stats, $("enemy-count").value, undefined, enemies));
  enemies = [...enemies, ...added];
  saveEncounter();
  drawEncounter();
  $("enemy-status").textContent = "Added " + added.length + " × " + stats.name + " (HP " + added.map(enemy => enemy.maxHp).join(", ") + ").";
};
$("enemy-save-template").onclick = () => {
  const stats = enemyFormStats();
  const custom = savedTemplates().filter(template => template.name !== stats.name);
  storage.set(TEMPLATE_KEY, JSON.stringify([stats, ...custom].slice(0, 30)));
  drawTemplateOptions();
  $("enemy-status").textContent = "Saved “" + stats.name + "” to your templates on this device.";
};
$("enc-init").onclick = () => {
  // Mid-fight this re-rolls every enemy and reshuffles the turn order.
  if (state?.combat && !confirmTap($("enc-init"), "Tap again to re-roll every enemy mid-fight")) return;
  enemies = rollInitiative(enemies);
  saveEncounter();
  drawEncounter();
};
$("enc-clear").onclick = () => {
  if (!confirmTap($("enc-clear"), "Tap again to remove every enemy")) return;
  enemies = [];
  saveEncounter();
  drawEncounter();
};

function enemyCard(enemy) {
  const card = document.createElement("article");
  const health = enemyStatus(enemy);
  card.className = "enemy is-" + health;
  const head = document.createElement("div");
  head.className = "enemy-head";
  const name = document.createElement("strong");
  name.textContent = enemy.name;
  const tags = document.createElement("div");
  tags.className = "chips";
  for (const text of ["AC " + enemy.ac, (enemy.init >= 0 ? "Init +" : "Init ") + enemy.init + (enemy.initiative !== null ? " → " + enemy.initiative : ""), enemy.speed + " ft"]) {
    const chip = document.createElement("span");
    chip.textContent = text;
    tags.append(chip);
  }
  if (health !== "ok") {
    const chip = document.createElement("span");
    chip.className = "state";
    chip.textContent = health === "down" ? "DOWN" : "BLOODIED";
    tags.append(chip);
  }
  for (const condition of enemy.conditions ?? []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "enemy-condition";
    chip.textContent = (conditionByName[condition]?.icon ?? "") + " " + condition + " ✕";
    chip.setAttribute("aria-label", "Remove " + condition + " on " + enemy.name);
    chip.onclick = () => {
      enemies = enemies.map(other => other.id === enemy.id ? { ...other, conditions: (other.conditions ?? []).filter(c => c !== condition) } : other);
      saveEncounter();
      drawEncounter();
    };
    tags.append(chip);
  }
  head.append(name, tags);

  const bar = document.createElement("div");
  bar.className = "hp-bar";
  const fill = document.createElement("i");
  fill.style.width = Math.round((enemy.hp / enemy.maxHp) * 100) + "%";
  bar.append(fill);
  const hpText = document.createElement("p");
  hpText.className = "hp-text";
  hpText.textContent = "HP " + enemy.hp + " / " + enemy.maxHp;

  const adjust = document.createElement("div");
  adjust.className = "action-row hp-adjust";
  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "0";
  amount.inputMode = "numeric";
  amount.placeholder = "Amount";
  amount.setAttribute("aria-label", "HP amount for " + enemy.name);
  const update = sign => {
    const value = Math.abs(Number(amount.value) || 0);
    if (!value) return amount.focus();
    enemies = enemies.map(other => other.id === enemy.id ? applyHp(other, sign * value) : other);
    saveEncounter();
    drawEncounter();
  };
  const hurt = document.createElement("button");
  hurt.type = "button";
  hurt.className = "danger-soft";
  hurt.textContent = "Damage";
  hurt.onclick = () => update(-1);
  const heal = document.createElement("button");
  heal.type = "button";
  heal.className = "ghost";
  heal.textContent = "Heal";
  heal.onclick = () => update(1);
  adjust.append(amount, hurt, heal);

  const result = document.createElement("p");
  result.className = "enemy-roll";
  result.hidden = true;
  const attacks = document.createElement("div");
  attacks.className = "attack-buttons";
  // Who this enemy is attacking: the roll is checked against their AC.
  if (enemy.attacks.length && state?.party) {
    const target = document.createElement("select");
    target.className = "enemy-target";
    target.setAttribute("aria-label", enemy.name + " attacks");
    target.append(new Option("🎯 Target…", ""), ...state.party.map(({ name }, index) => {
      const ac = partyAc(index);
      return new Option(name.replace(/^The /, "") + (ac ? " · AC " + ac.text : ""), String(index));
    }));
    target.value = enemyTargets.get(enemy.id) ?? "";
    target.onchange = () => {
      enemyTargets.set(enemy.id, target.value);
      // The same enemy can be on screen twice (DM tab and the Combat tab's
      // turn card): both show the target its attacks will use.
      for (const other of document.querySelectorAll("select.enemy-target")) {
        if (other !== target && other.getAttribute("aria-label") === target.getAttribute("aria-label")) other.value = target.value;
      }
    };
    attacks.append(target);
  }
  const rollers = new Map(); // attack → its one-swing roller, for Run turn
  for (const attackEntry of enemy.attacks) {
    const [label, hit, damage, rider] = attackEntry;
    // "Longsword (×2)" is a multiattack: one tap rolls every swing.
    const times = swingCount(label);
    const name = label.replace(/\s*\([×x]\d\)/i, "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = (times > 1 ? times + " × " + name : label) + " " + (hit >= 0 ? "+" : "") + hit + (damage ? " · " + damage : "") + (rider?.damage ? " +" + rider.damage + " " + (rider.type ?? "") : "");
    if (times > 1) button.setAttribute("aria-label", "Roll all " + times + " " + name + " attacks");
    // auto (Run turn): a clear hit on someone not raging is applied at once,
    // and the outcome goes into the turn's summary line.
    const rollOne = (swing, auto = null) => {
      const label = times > 1 ? name + " " + swing + " of " + times : name;
      const toHit = roll("d20" + (hit >= 0 ? "+" : "") + hit);
      const harm = damage ? roll(damage) : null;
      const critDamage = harm && toHit.critical ? roll(critExpression(damage)) : null;
      const shown = critDamage ?? harm;
      const line = document.createElement("span");
      line.textContent = label + ": " + toHit.total + " to hit" + (toHit.critical ? " (CRIT)" : toHit.fumble ? " (nat 1)" : "")
        + " [" + toHit.breakdown + "]" + (shown ? " · " + shown.total + " damage [" + shown.breakdown + "]" : "");
      const parts = [line];
      const choice = enemyTargets.get(enemy.id);
      if (choice !== undefined && choice !== "") {
        const index = Number(choice);
        const who = partyName(index).replace(/^The /, "");
        const ac = partyAc(index);
        const outcome = attackOutcome(toHit, ac);
        const verdict = document.createElement("strong");
        verdict.className = "verdict is-" + outcome;
        verdict.textContent = outcome === "crit" ? "CRITICAL HIT on " + who + "!"
          : outcome === "hit" ? "HIT " + who + " (AC " + ac.text + ")"
          : outcome === "miss" ? "MISS " + who + (ac ? " (AC " + ac.text + ")" : "")
          : outcome === "unsure" ? toHit.total + " vs " + who + "'s unconfirmed AC " + ac.text + ": it hits if their AC is " + toHit.total + " or less. You decide."
          : who + "'s AC isn't set — the DM decides.";
        parts.push(verdict);
        if (shown && (outcome === "hit" || outcome === "crit" || outcome === "unknown" || outcome === "unsure")) {
          const row = document.createElement("div");
          row.className = "apply-row";
          const status = document.createElement("span");
          status.className = "fineprint";
          const landed = { done: false }; // weapon damage and its rider are one hit
          const apply = (amount, chosen) => {
            for (const button of row.querySelectorAll("button")) button.disabled = true;
            chosen?.classList.add("is-chosen"); // which one was used stays visible
            status.textContent = "Applied " + amount + " to " + who + ".";
            addNarration(enemy.name + "'s " + name + " hits " + who + " for " + amount + " damage" + (outcome === "crit" ? " (a critical hit)" : "") + ".");
            const sameHit = landed.done; // the rider of this hit went in first
            landed.done = true;
            adjustHp(index, -amount, status, { sameHit });
          };
          const full = document.createElement("button");
          full.type = "button";
          full.className = "danger-soft";
          full.textContent = "Apply " + shown.total + " to " + who;
          full.onclick = () => apply(shown.total, full);
          // Raging: resistance to bludgeoning, piercing and slashing. The
          // app doesn't know the damage type, so it says so and lets the DM pick.
          if (readRes(index).raging) {
            const rage = document.createElement("p");
            rage.className = "fineprint rage-hint";
            rage.textContent = "😤 " + who + " is raging: weapon damage (bludgeoning, piercing, slashing) is halved. Use Half unless it's another type.";
            parts.push(rage);
          }
          const half = document.createElement("button");
          half.type = "button";
          half.className = "quiet";
          half.textContent = "Half (" + Math.floor(shown.total / 2) + ")";
          half.title = "Resistance";
          half.onclick = () => apply(Math.floor(shown.total / 2), half);
          row.append(full, half, status);
          parts.push(row);
          if (rider) parts.push(riderRow(rider, toHit.critical, index, who, enemy.name + "'s " + name, landed));
          if (auto && (outcome === "hit" || outcome === "crit") && !readRes(index).raging) {
            apply(shown.total, full);
            auto.damage += shown.total;
          } else if (auto) auto.open = true; // left for the DM: raging, or an AC it can't check
          if (auto && rider) auto.open = true; // the rider's save is the DM's to roll
        }
        if (auto) auto.rolls.push(toHit.total + (outcome === "crit" ? " (crit)" : outcome === "hit" ? " hits" : outcome === "miss" ? " misses" : " (DM's call)"));
      }
      return parts;
    };
    rollers.set(attackEntry, rollOne);
    button.onclick = () => {
      const parts = [];
      if (rider && enemyTargets.get(enemy.id) == null || rider && enemyTargets.get(enemy.id) === "") {
        const note = document.createElement("p");
        note.className = "fineprint";
        note.textContent = "Each hit also: " + riderText(rider) + ". Pick a target to roll it with the hit.";
        parts.push(note);
      }
      for (let swing = 1; swing <= times; swing++) {
        const one = document.createElement("div");
        one.className = "enemy-swing";
        one.append(...rollOne(swing));
        parts.push(one);
      }
      result.replaceChildren(...parts);
      result.hidden = false;
    };
    attacks.append(button);
  }
  // Run turn: the whole routine (a dragon's claws and bite, two rakes) at the
  // picked target in one tap. Clear hits land at once; anything that needs a
  // ruling (rage, an unsure AC, a rider's save) keeps its buttons. One line
  // goes to the table with how it went.
  if (enemy.attacks.length && state?.party) {
    const run = document.createElement("button");
    run.type = "button";
    run.className = "cta enemy-run";
    const routine = enemyRoutine(enemy);
    run.textContent = "⚔️ Run turn: " + routine.map(([[label], times]) => (times > 1 ? times + " × " : "") + label.replace(/\s*\([×x]\d\)/i, "")).join(" + ");
    run.onclick = () => {
      const choice = enemyTargets.get(enemy.id);
      if (choice === undefined || choice === "") {
        result.replaceChildren(Object.assign(document.createElement("strong"), { className: "verdict", textContent: "Pick a target first (🎯 Target…)." }));
        result.hidden = false;
        return;
      }
      const index = Number(choice);
      const who = partyName(index).replace(/^The /, "");
      const auto = { rolls: [], damage: 0, open: false };
      const parts = [];
      for (const [entry, times] of routine) {
        for (let swing = 1; swing <= times; swing++) {
          const one = document.createElement("div");
          one.className = "enemy-swing";
          one.append(...rollers.get(entry)(swing, auto));
          parts.push(one);
        }
      }
      result.replaceChildren(...parts);
      result.hidden = false;
      const names = routine.map(([[label]]) => label.replace(/\s*\([×x]\d\)/i, "")).join(" and ");
      tellTable(index, "⚔️ " + enemy.name + " attacks " + who + " (" + names + "): " + auto.rolls.join(", ")
        + (auto.damage ? " · " + auto.damage + " damage" : "") + (auto.open ? " · the DM is deciding the rest" : ""));
    };
    const picker = attacks.querySelector("select.enemy-target");
    attacks.insertBefore(run, picker ? picker.nextSibling : attacks.firstChild);
  }

  const addCondition = document.createElement("select");
  addCondition.className = "enemy-condition-select";
  addCondition.setAttribute("aria-label", "Add a condition to " + enemy.name);
  addCondition.append(new Option("+ Condition", ""), ...conditions.filter(({ name }) => !(enemy.conditions ?? []).includes(name)).map(({ name, icon }) => new Option(icon + " " + name, name)));
  addCondition.onchange = () => {
    if (!addCondition.value) return;
    enemies = enemies.map(other => other.id === enemy.id ? { ...other, conditions: [...(other.conditions ?? []), addCondition.value] } : other);
    saveEncounter();
    drawEncounter();
  };
  attacks.append(addCondition);
  card.append(head, bar, hpText, adjust, attacks, result);
  for (const condition of enemy.conditions ?? []) {
    const note = document.createElement("p");
    note.className = "fineprint";
    note.textContent = condition + ": " + (conditionByName[condition]?.text ?? "");
    card.append(note);
  }
  {
    const more = document.createElement("details");
    more.className = "fold";
    const summary = document.createElement("summary");
    summary.textContent = enemy.abilities ? "Abilities, notes, and saves" : "Saving throws";
    const savesLine = document.createElement("p");
    savesLine.className = "fineprint";
    savesLine.textContent = "Saves: " + formatSaves(enemy.saves);
    more.append(summary, ...(enemy.abilities ? [Object.assign(document.createElement("p"), { textContent: enemy.abilities })] : []), savesLine);
    card.append(more);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "quiet";
  remove.textContent = "Remove";
  remove.onclick = () => { enemies = enemies.filter(other => other.id !== enemy.id); saveEncounter(); drawEncounter(); };
  card.append(remove);
  return card;
}

function drawEncounter() {
  if (!encounterLoaded) {
    enemies = readJson(encounterKey(), []);
    encounterLoaded = true;
    drawTemplateOptions();
    loadCloudEncounter();
  }
  const total = enemies.length;
  const up = standing(enemies);
  $("encounter-count").textContent = total ? up + " of " + total + " standing" : "No enemies yet";
  $("encounter-controls").hidden = !total;
  $("enemy-builder").open = !total || $("enemy-builder").open;
  renderInto($("enemy-list"), enemies.map(enemyCard));
  drawCombat();
}

// ── DMs who can start tables (hosted, migration 0010) ──
async function drawDmList() {
  if (!isHost || !backend.hostList) { $("dm-list").hidden = true; return; }
  try {
    const hosts = await backend.hostList();
    $("dm-list").hidden = false;
    $("dm-emails").replaceChildren(...hosts.map(({ email, you }) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = email + (you ? " (you)" : "");
      item.append(name);
      if (!you && hosts.length > 1) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "quiet";
        remove.textContent = "Remove";
        remove.onclick = async () => {
          if (!window.confirm("Stop " + email + " from starting tables?")) return;
          try { await backend.removeHost(email); drawDmList(); } catch (error) { $("dm-status").textContent = error.message; }
        };
        item.append(remove);
      }
      return item;
    }));
  } catch {
    $("dm-list").hidden = true; // not run yet (0010) or not a listed DM
  }
}
$("dm-add").onsubmit = async event => {
  event.preventDefault();
  const email = $("dm-add-email").value.trim();
  if (!email) return;
  try {
    await backend.addHost(email);
    $("dm-add-email").value = "";
    $("dm-status").textContent = email + " can now start tables.";
    drawDmList();
  } catch (error) {
    $("dm-status").textContent = error.message;
  }
};

function setHost(value) {
  isHost = value;
  $("table").classList.toggle("player-room", !isHost);
  for (const id of ["host", "party-editor", "close-wrap"]) $(id).hidden = !isHost;
  if (state) renderStory();
  $("history-editor").hidden = !isHost || !backend.saveHistory;
  $("tab-dm").hidden = !isHost;
  $("encounter").hidden = !isHost;
  const claudeDm = isHost && Boolean(state?.ai) && !ended && Boolean(backend.dmAsk);
  $("claude-enemies").hidden = !claudeDm;
  $("dm-assistant").hidden = !claudeDm;
  // A DM account that opens a character's view gets no player tools: say why.
  for (const note of document.querySelectorAll(".host-player-note")) {
    note.hidden = !isHost;
    note.textContent = "You're the DM on this device, so the player tools (attack cards, Send to the DM, death saves) are hidden here. "
      + (backend.hosted ? "To play a character, sign in on this device with an email that isn't on the DM list." : "Players open the table link on their own phones.");
  }
  $("board-link").href = "?room=" + room + "&board=1";
  drawDmList();
  if (isHost) drawEncounter();
  drawNarration();
  drawCombat();
  if (!isHost && currentTab === "dm") showTab("scene");
  if (isHost && storage.get(TAB_KEY) === "dm" && currentTab !== "dm") showTab("dm");
  if (!isHost) stopMic();
}

let poll;
// Tables this browser joined, so a player who lands on the home page can get
// back to the DM's table instead of starting their own.
const RECENT_KEY = "dnd-recent-tables";
function recentTables() {
  try {
    return JSON.parse(storage.get(RECENT_KEY) ?? "[]").filter(entry => Date.now() - entry.at < tableAge);
  } catch {
    return [];
  }
}
function rememberTable(code) {
  storage.set(RECENT_KEY, JSON.stringify([{ code, at: Date.now() }, ...recentTables().filter(entry => entry.code !== code)].slice(0, 5)));
}
const tableLabel = code => "Table " + code.slice(0, 4).toUpperCase();

// ── Themes (per phone; src/theme.js applies the saved one before drawing) ──
const THEMES = [
  ["arena", "Arena", "Dark, red and gold", ["#0e0f12", "#e5383b", "#c9a84c"]],
  ["parchment", "Parchment", "Light, like an old map", ["#efe6d2", "#a8322d", "#8a6a1f"]],
  ["arcane", "Arcane", "Midnight blue and violet", ["#0b0d1a", "#8b5cf6", "#f0c060"]],
  ["wildwood", "Wildwood", "Forest green and amber", ["#0d1410", "#e0862f", "#d8c06a"]]
];
function drawThemePickers() {
  const current = document.documentElement.dataset.theme || "arena";
  for (const picker of document.querySelectorAll(".theme-picker")) {
    picker.replaceChildren(...THEMES.map(([id, name, blurb, colors]) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "theme-option" + (id === current ? " is-active" : "");
      option.setAttribute("role", "radio");
      option.setAttribute("aria-checked", String(id === current));
      const swatch = document.createElement("div");
      swatch.className = "theme-swatch";
      swatch.append(...colors.map(color => { const dot = document.createElement("i"); dot.style.background = color; return dot; }));
      const title = document.createElement("strong");
      title.textContent = name;
      const note = document.createElement("span");
      note.textContent = blurb;
      option.append(swatch, title, note);
      option.onclick = () => {
        window.dndSetTheme?.(id);
        drawThemePickers();
      };
      return option;
    }));
  }
}
drawThemePickers();

// ── First visit: a short "how this works" walkthrough, once per phone. ──
const WELCOME_KEY = "dnd-welcomed";
const WELCOME_STEPS = [
  ["Pick your character", "Tap your name in the row of chips at the top. Your sheet, rolls, HP, and suggestions all follow that choice."],
  ["Watch the Scene", "The DM narrates out loud and the latest update shows on the Scene tab. Tell the table what you do in the box under it."],
  ["When a fight starts", "The Combat tab opens by itself. The card at the top always shows your next step (roll initiative, attack, send the hit to the DM, end your turn) with a button that does it."],
  ["Stuck? Help is one tap away", "Moves suggests things your character can do right now. The round 🎲 Roll button rolls any dice. HP, spell slots, and rages are on the Sheet tab. Tap ? at the top to see this again."]
];
let welcomeStep = 0;
function drawWelcome() {
  const [title, text] = WELCOME_STEPS[welcomeStep];
  $("welcome-step").textContent = "HOW IT WORKS · " + (welcomeStep + 1) + " OF " + WELCOME_STEPS.length;
  $("welcome-title").textContent = title;
  $("welcome-text").textContent = text;
  $("welcome-dots").replaceChildren(...WELCOME_STEPS.map((_, index) => {
    const dot = document.createElement("i");
    if (index === welcomeStep) dot.className = "is-on";
    return dot;
  }));
  $("welcome-back").disabled = welcomeStep === 0;
  $("welcome-next").textContent = welcomeStep === WELCOME_STEPS.length - 1 ? "Let's play" : "Next";
}
function openWelcome() {
  welcomeStep = 0;
  drawWelcome();
  $("welcome").hidden = false;
  document.body.classList.add("no-scroll");
  $("welcome-next").focus();
}
// Players only (the DM can open it with ?), once the table has loaded.
function maybeWelcome() {
  if (storage.get(WELCOME_KEY) || ended || $("table").hidden) return;
  if (!state) return void setTimeout(maybeWelcome, 500);
  if (!isHost) openWelcome();
}
function closeWelcome() {
  $("welcome").hidden = true;
  document.body.classList.remove("no-scroll");
  storage.set(WELCOME_KEY, "1");
}
$("welcome-next").onclick = () => {
  if (welcomeStep === WELCOME_STEPS.length - 1) return closeWelcome();
  welcomeStep += 1;
  drawWelcome();
};
$("welcome-back").onclick = () => { welcomeStep = Math.max(0, welcomeStep - 1); drawWelcome(); };
$("welcome-skip").onclick = closeWelcome;
$("help").onclick = openWelcome;

// Sheet tab: D&D basics open and the long character sheet folded until the
// player chooses otherwise (remembered on this phone).
for (const id of ["character-library", "rules-basics"]) {
  const saved = storage.get("dnd-open:" + id);
  $(id).open = saved === null ? id === "rules-basics" : saved === "1";
  $(id).addEventListener("toggle", () => storage.set("dnd-open:" + id, $(id).open ? "1" : "0"));
}

// ── TV board: ?room=…&board=1 shows a read-only, big-text view of the table
// (scene, combat order, party HP) for a screen everyone can see. Enemies show
// only as Healthy, Bloodied, or Down, even when the DM's account opens it. ──
const boardMode = new URLSearchParams(location.search).get("board") === "1";
// ── TV board: a stage, not a transcript ─────────────────────────────────
// The DM's post plays a passage at a time, like captions; the last few
// moments sit in a strip under it; the party are portraits with HP rings; in
// a fight a turn track runs across the top; big moments get a full-screen
// flash. Nothing scrolls.
const board = { sceneId: null, passages: [], page: 0, timer: 0, seen: null, enemies: new Map(), hp: new Map(), combat: false, flashes: [], flashing: false };
// Short enough for a track chip or a portrait: "Roan", "Logan", "Croupier 2".
const shortName = (name, enemy = false) => {
  const plain = name.replace(/^The /, "");
  if (plain.length <= 12) return plain;
  const words = plain.split(/\s+/);
  return enemy ? words.slice(-2).join(" ") : words[0];
};
const initials = name => name.replace(/^The /, "").split(/\s+/).filter(word => !/^(the|of)$/i.test(word)).slice(0, 2).map(word => word[0]).join("").toUpperCase();
function boardPage(page) {
  clearTimeout(board.timer);
  board.page = Math.max(0, Math.min(board.passages.length - 1, page));
  const scene = $("board-scene");
  scene.classList.remove("is-in");
  void scene.offsetWidth; // restart the fade
  scene.textContent = board.passages[board.page] ?? "";
  scene.classList.add("is-in");
  $("board-pages").replaceChildren(...(board.passages.length > 1 ? board.passages.map((_, index) => {
    const dot = document.createElement("i");
    if (index === board.page) dot.className = "is-on";
    else if (index < board.page) dot.className = "is-read";
    return dot;
  }) : []));
  // Long enough to read aloud slowly, then the next passage; it rests on the last.
  if (board.page < board.passages.length - 1) {
    const words = (board.passages[board.page] ?? "").split(/\s+/).length;
    board.timer = setTimeout(() => boardPage(board.page + 1), Math.min(22000, Math.max(7000, words * 380)));
  }
}
document.addEventListener("keydown", event => {
  if (!boardMode) return;
  if (event.key === "ArrowRight" || event.key === " ") boardPage(board.page + 1);
  if (event.key === "ArrowLeft") boardPage(board.page - 1);
});
function boardFlash(text, kind = "") {
  board.flashes.push({ text, kind });
  if (board.flashing) return;
  const next = () => {
    const flash = board.flashes.shift();
    if (!flash) { board.flashing = false; $("board-flash").hidden = true; return; }
    board.flashing = true;
    // Hidden for a frame, so each queued flash replays its animation.
    $("board-flash").hidden = true;
    void $("board-flash").offsetWidth;
    $("board-flash").className = "board-flash" + (flash.kind ? " is-" + flash.kind : "");
    $("board-flash-text").textContent = flash.text;
    $("board-flash").hidden = false;
    setTimeout(next, 3200);
  };
  next();
}
const MOMENT_ICON = { hit: "⚔️", call: "⚔️", miss: "💨", pending: "🎯", roll: "🎲", ask: "⏳", heal: "💚", status: "✨", turn: "⏭️", action: "💬", dm: "📜" };
function momentCard(entry) {
  const { moment } = entry;
  const item = document.createElement("li");
  item.className = "moment is-" + moment.kind + (moment.verdict ? " is-" + moment.verdict : "") + (moment.natural === 20 ? " is-nat20" : moment.natural === 1 ? " is-nat1" : "") + (board.seen && !board.seen.has(entry.id) ? " is-new" : "");
  const icon = element("span", "moment-icon", MOMENT_ICON[moment.kind] ?? "•");
  const body = document.createElement("div");
  body.className = "moment-body";
  const who = element("strong", "", moment.kind === "ask" ? "Waiting on " + moment.who : moment.who);
  // chronicleLine sentences start with the name: say it once.
  const said = moment.text.startsWith(moment.who + " ") ? moment.text.slice(moment.who.length + 1) : moment.text;
  body.append(who, element("span", "", said + (moment.note && moment.kind !== "ask" ? " · " + moment.note : "")));
  item.append(icon, body);
  if (moment.kind === "roll") {
    const total = element("b", "moment-total", String(moment.total));
    if (moment.verdict) total.append(element("small", "", moment.verdict === "success" ? "✓" : "✗"));
    item.append(total);
  }
  return item;
}
function drawBoard() {
  if (!boardMode || !state) return;
  const first = board.seen === null;
  board.seen ??= new Set();
  const latest = state.scenes.at(-1);
  const sceneKey = ended ? "ended" : latest ? latest.id + ":" + latest.text : "none";
  if (sceneKey !== board.sceneId) {
    board.sceneId = sceneKey;
    // A split-party update opens with who it's for ("To White Wizard: …").
    board.passages = ended ? ["The session has ended."] : scenePassages(sceneText(latest) || "Waiting for the DM.");
    boardPage(0);
  }
  const before = state.scenes.at(-2);
  $("board-previously").hidden = !before;
  const beforeText = before ? sceneText(before) : "";
  $("board-previously").textContent = before ? "Before this — " + (beforeText.length > 170 ? beforeText.slice(0, 170).replace(/\s+\S*$/, "") + "…" : beforeText) : "";

  // Moments since the DM's latest post: an attack's call is folded into its
  // hit, an answered roll request into its roll.
  const actions = (state.actions ?? []).filter(action => !latest || action.created >= latest.created)
    .map(action => ({ id: "a" + action.id, at: action.created, name: action.name, raw: String(action.text), moment: boardMoment(action.name, action.text) }))
    .filter(entry => entry.moment);
  // A roll request closes when its own answer arrives: the same label from
  // the same character, one answer per check or save (as on their phone).
  const answeredAsks = new Set();
  for (const answer of actions.filter(entry => entry.moment.kind === "roll")) {
    const open = actions.find(entry => entry.moment.kind === "ask" && entry.name === answer.name && Number(entry.id.slice(1)) < Number(answer.id.slice(1))
      && (parseRollAsk(entry.raw)?.kind === "attack" || !answeredAsks.has(entry.id))
      && answer.raw.startsWith("🎲 " + rollAskLabel(parseRollAsk(entry.raw))));
    if (open) answeredAsks.add(open.id);
  }
  const shown = actions.filter((entry, index) => {
    const later = actions.slice(index + 1);
    if (entry.moment.kind === "call") return !later.some(next => next.moment.kind === "hit" && next.moment.who === entry.moment.who && next.moment.enemy === entry.moment.enemy);
    if (entry.moment.kind === "ask") return !answeredAsks.has(entry.id);
    return true;
  }).slice(-4);
  renderInto($("board-moments"), shown.map(momentCard));
  $("board-moments").hidden = !shown.length;

  // Big moments, once each: a natural 20 or 1, a critical hit.
  if (!first) {
    for (const entry of actions) {
      if (board.seen.has(entry.id)) continue;
      const { moment } = entry;
      if (moment.kind === "roll" && moment.natural === 20) boardFlash("NATURAL 20 · " + moment.who, "gold");
      else if (moment.kind === "roll" && moment.natural === 1) boardFlash("NATURAL 1 · " + moment.who, "dark");
      else if (moment.kind === "hit" && /critical hit/.test(moment.text)) boardFlash("CRITICAL HIT · " + moment.who, "gold");
    }
  }
  for (const entry of actions) board.seen.add(entry.id);

  // The fight: a turn track, the turn called out over the stage.
  const combat = state.combat;
  document.body.classList.toggle("board-combat", Boolean(combat));
  $("board-track").hidden = $("board-round").hidden = $("board-turn").hidden = !combat;
  if (combat && !board.combat && !first) boardFlash("ROLL INITIATIVE", "red");
  if (!combat && board.combat && [...board.enemies.values()].length && [...board.enemies.values()].every(status => status === "down")) boardFlash("VICTORY", "gold");
  board.combat = Boolean(combat);
  let currentName = "";
  if (combat) {
    const order = combatOrder(combat, state.party);
    const current = order.find(entry => entry.key === combat.turn);
    currentName = current?.kind === "pc" ? current.name : "";
    $("board-round").textContent = "ROUND " + combat.round;
    // The name as the track shows it ("Logan", not "Logan Ninefingers's").
    const called = current && shortName(current.name, current.kind === "enemy");
    $("board-turn").textContent = current ? called + (current.kind === "enemy" ? " acts" : /s$/i.test(called) ? "' turn" : "'s turn") : "Roll initiative";
    $("board-turn").className = "board-turn" + (current?.kind === "enemy" ? " is-enemy" : "");
    renderInto($("board-track"), order.map(entry => {
      const chip = document.createElement("div");
      chip.className = "track-chip is-" + entry.kind + " is-" + (entry.status ?? "pc") + (entry.key === combat.turn ? " is-turn" : "");
      chip.append(element("b", "", entry.initiative ?? "–"), element("span", "", shortName(entry.name, entry.kind === "enemy")));
      if (entry.kind === "enemy") chip.append(element("em", "", STATUS_TEXT[entry.status] ?? ""));
      return chip;
    }));
    // Keep the one acting in view when the order is wider than the screen.
    // Centred, so a phone-width track shows who's before and after.
    const track = $("board-track");
    const live = track.querySelector(".is-turn");
    if (live) track.scrollLeft = Math.max(0, live.offsetLeft - track.offsetLeft - (track.clientWidth - live.offsetWidth) / 2);
    for (const entry of order.filter(entry => entry.kind === "enemy")) {
      const was = board.enemies.get(entry.key);
      if (!first && was && was !== "down" && entry.status === "down") boardFlash(entry.name.toUpperCase() + " FALLS", "red");
      board.enemies.set(entry.key, entry.status);
    }
  } else if (!board.combat) board.enemies.clear();

  // The party as portraits: an HP ring, AC, rage; the one acting glows.
  const party = state.party.map((member, index) => {
    const record = state.hp?.[member.name];
    const health = partyHpStatus(record);
    const was = board.hp.get(member.name);
    if (!first && record && record.hp <= 0 && was > 0) boardFlash(member.name.replace(/^The /, "").toUpperCase() + " IS DOWN", "red");
    if (record) board.hp.set(member.name, record.hp);
    const item = document.createElement("li");
    const away = isSittingOut(combat, index); // not in this fight (elsewhere in the story)
    item.className = "party-hero is-" + health + (member.name === currentName ? " is-turn" : "") + (state.resources?.[member.name]?.raging ? " is-raging" : "") + (away ? " is-out" : "");
    const share = record?.max ? Math.max(0, Math.min(100, Math.round(record.hp / record.max * 100))) : 0;
    const ring = document.createElement("div");
    ring.className = "party-hero-ring";
    ring.style.setProperty("--hp", share + "%");
    ring.append(element("span", "", initials(member.name)));
    const ac = partyAc(index);
    const info = document.createElement("div");
    info.className = "party-hero-info";
    info.append(element("strong", "", shortName(member.name)),
      element("span", "", (record ? (health === "down" ? "DOWN" : record.hp + " / " + record.max + (record.temp ? " +" + record.temp : "")) : "HP —") + (ac ? " · AC " + ac.text : "") + (state.resources?.[member.name]?.raging ? " · 😤" : "")));
    if (away) info.append(element("em", "", "not in this fight"));
    item.append(ring, info);
    return item;
  });
  renderInto($("board-party"), party);
}

function enterRoom() {
  $("tabbar").hidden = false;
  $("copy").hidden = false;
  $("dice-fab").hidden = false;
  $("help").hidden = boardMode;
  $("home").hidden = boardMode;
  // Anyone at the table can put the TV board on a big screen: it only shows
  // what every player already sees, and never acts as the DM.
  $("tv").href = "?room=" + room + "&board=1";
  $("tv").hidden = boardMode;
  if (!boardMode) setTimeout(maybeWelcome, 600);
  document.body.classList.add("in-table");
  showTab(storage.get(TAB_KEY) ?? "scene");
  $("table-code").textContent = " · " + tableLabel(room).toUpperCase() + (isPractice() ? " · PRACTICE" : "");
  $("lobby").hidden = true;
  $("table").hidden = boardMode;
  $("board").hidden = !boardMode;
  if (boardMode) {
    document.body.classList.add("board-mode");
    for (const id of ["tabbar", "dice-fab", "copy", "help", "tv"]) $(id).hidden = true;
    // The one way out: back to this table's normal view.
    $("board-exit").href = "?room=" + room;
    $("board-exit").hidden = false;
  }
  setHost(false);
  showCachedRoom();
  sync();
  poll ??= setInterval(sync, 1500);
}

// ── Lobby and sign-in (hosted mode uses the UFC app's email-code login) ──
let pendingEmail = "";
let myRoomCount = 0;
function tableLink(code, text, { tag = "", note = "", action = null } = {}) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = "?room=" + code;
  link.textContent = text;
  if (tag) {
    const label = document.createElement("span");
    label.className = "tag";
    label.textContent = tag;
    link.append(label);
  }
  if (note) {
    const small = document.createElement("small");
    small.textContent = note;
    link.append(small);
  }
  item.append(link);
  if (action) {
    item.classList.add("with-action");
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.className ?? "quiet";
    button.textContent = action.text;
    button.setAttribute("aria-label", action.label);
    button.onclick = () => action.onclick(button);
    item.append(button);
  }
  return item;
}
const shortTime = ms => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

// ── Managing your tables from the home screen ──
// A DM deletes tables they started (a finished test, a practice run) without
// opening each one; a real table can save its session to the history first,
// as ending it from inside does.
// practice: true, false, or null when unknown (the hosted list before
// migration 0014): unknown never offers the history save, so a test table's
// updates can't land in the campaign.
async function deleteTable(code, practice) {
  if (practice !== false) {
    await backend.closeRoom(code);
  } else {
    const save = Boolean(backend.endTable)
      && window.confirm("Add this table's updates to the campaign history first, so Claude remembers them? (Cancel deletes without saving.)");
    if (backend.endTable) await backend.endTable(code, save);
    else await backend.closeRoom(code);
  }
  storage.remove("practice:" + code);
  storage.set(RECENT_KEY, JSON.stringify(recentTables().filter(entry => entry.code !== code)));
}
function drawMyRooms(found) {
  // Practice status from the server, else this phone's marker, else unknown.
  const rooms = found.map(entry => ({ ...entry,
    practice: typeof entry.practice === "boolean" ? entry.practice : storage.get("practice:" + entry.code) === "1" ? true : null }));
  $("my-rooms").hidden = !rooms.length;
  // Your own tables are listed here, not again under "Tables you joined".
  const mine = new Set(rooms.map(entry => entry.code));
  for (const item of [...$("recent-room-list").children]) {
    if (mine.has(item.querySelector("a")?.getAttribute("href")?.slice(6))) item.remove();
  }
  $("recent-rooms").hidden = !$("recent-room-list").children.length;
  $("my-room-list").replaceChildren(...rooms.map(({ code, created, active, practice }) =>
    tableLink(code, tableLabel(code), {
      tag: practice ? "PRACTICE" : "",
      note: "Started " + shortTime(created) + (active && active - created > 60000 ? " · last used " + shortTime(active) : ""),
      action: {
        text: "Delete",
        className: "danger-soft",
        label: "Delete " + tableLabel(code),
        onclick: async button => {
          if (!window.confirm(practice ? "Delete this practice table? Nothing from it is saved."
            : "Delete " + tableLabel(code) + " for everyone? Its updates and player entries are removed"
              + (practice === null ? " without saving them to the campaign history (to save them, open the table and end it there)." : "."))) return;
          button.disabled = true;
          try {
            await deleteTable(code, practice);
            $("my-rooms-status").textContent = tableLabel(code) + " deleted.";
            showLobby();
          } catch (error) {
            button.disabled = false;
            $("my-rooms-status").textContent = error.message;
          }
        }
      }
    })));
  const practiceRooms = rooms.filter(entry => entry.practice === true);
  $("delete-practice").hidden = practiceRooms.length < 2;
  $("delete-practice").textContent = "Delete all " + practiceRooms.length + " practice tables";
  $("delete-practice").onclick = async () => {
    if (!window.confirm("Delete all " + practiceRooms.length + " practice tables? Nothing from them is saved.")) return;
    $("delete-practice").disabled = true;
    const results = await Promise.allSettled(practiceRooms.map(entry => deleteTable(entry.code, true)));
    $("delete-practice").disabled = false;
    const failed = results.filter(result => result.status === "rejected").length;
    $("my-rooms-status").textContent = failed ? failed + " couldn't be deleted. Try again." : "Practice tables deleted.";
    showLobby();
  };
}
$("join-form").onsubmit = event => {
  event.preventDefault();
  const value = $("join-link").value.trim();
  const code = (value.match(/room=([a-f0-9]{24})/i) ?? value.match(/^([a-f0-9]{24})$/i))?.[1];
  if (!code) {
    $("lobby-status").textContent = "That doesn't look like a table link. Ask the DM to tap Share player link.";
    return;
  }
  location.href = "?room=" + code.toLowerCase();
};
async function showLobby(message = "") {
  $("lobby").hidden = false;
  $("table").hidden = true;
  $("board").hidden = true;
  document.body.classList.remove("board-mode");
  $("board-exit").hidden = true;
  $("lobby-status").textContent = message;
  const user = backend.user();
  $("signin").hidden = !backend.hosted || Boolean(user);
  $("account").hidden = backend.hosted && !user;
  $("account-cards").hidden = $("account").hidden;
  $("tabbar").hidden = true;
  $("copy").hidden = true;
  $("dice-fab").hidden = true;
  $("help").hidden = true;
  $("home").hidden = true;
  $("tv").hidden = true;
  document.body.classList.remove("in-table");
  $("account-line").hidden = !backend.hosted;
  $("join").hidden = !room;
  $("joining-note").hidden = !room;
  const recent = recentTables();
  $("recent-rooms").hidden = !recent.length;
  // Players can tidy their own list (this only forgets it on this phone).
  $("recent-room-list").replaceChildren(...recent.map(({ code, at }) => tableLink(code, tableLabel(code), {
    note: "Joined " + new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    action: {
      text: "Remove",
      label: "Remove " + tableLabel(code) + " from this list",
      onclick: () => {
        storage.set(RECENT_KEY, JSON.stringify(recentTables().filter(entry => entry.code !== code)));
        showLobby();
      }
    }
  })));
  if (backend.hosted && !user) return;
  if (user) $("account-email").textContent = user.email;
  try {
    const rooms = await backend.myRooms();
    myRoomCount = rooms.length;
    if (backend.canStartTables) {
      const canStart = await backend.canStartTables().catch(() => true);
      for (const id of ["create", "create-practice"]) $(id).hidden = !canStart;
      $("not-dm").hidden = canStart;
      $("dm-card").querySelector(".fineprint:not(#not-dm)").hidden = !canStart;
    }
    drawMyRooms(rooms);
  } catch (error) {
    if (error.status === 401) showLobby("Sign in again to continue.");
  }
}

$("email-form").onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  const email = $("email").value.trim().toLowerCase();
  button.disabled = true;
  $("lobby-status").textContent = "";
  try {
    await backend.sendCode(email);
    pendingEmail = email;
    $("code-email").textContent = email;
    $("email-form").hidden = true;
    $("code-form").hidden = false;
    $("code").value = "";
    $("code").focus();
  } catch (error) {
    $("lobby-status").textContent = error.status === 429
      ? "Too many codes requested. Wait a minute and try again."
      : "Couldn't send the code. Check the email address and try again.";
  } finally {
    button.disabled = false;
  }
};
$("code-form").onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await backend.verifyCode(pendingEmail, $("code").value.replace(/\s/g, ""));
    $("code-form").hidden = true;
    $("email-form").hidden = false;
    if (room) enterRoom();
    else showLobby();
  } catch {
    $("lobby-status").textContent = "Wrong or expired code. Try again, or request a new one.";
  } finally {
    button.disabled = false;
  }
};
$("code-back").onclick = () => {
  $("code-form").hidden = true;
  $("email-form").hidden = false;
  $("lobby-status").textContent = "";
};
$("signout").onclick = async () => {
  await backend.signOut();
  showLobby();
};
$("join").onclick = () => enterRoom();
function isPractice() {
  return storage.get("practice:" + room) === "1" || Boolean(state?.scenes[0]?.text.startsWith(PRACTICE_MARK));
}
$("create-practice").onclick = async () => {
  $("create-practice").disabled = true;
  try {
    const code = await backend.createRoom(starterParty,
      PRACTICE_MARK + ": test freely. Nothing from this table is added to the campaign history.\n\n" + starterRecap);
    storage.set("practice:" + code, "1");
    location.href = "?room=" + code;
  } catch (error) {
    $("lobby-status").textContent = error.message;
    $("create-practice").disabled = false;
    if (error.status === 401) showLobby("Sign in again to continue.");
  }
};
$("create").onclick = async () => {
  const warning = myRoomCount
    ? "You already have an open table. Start another one? Players on your current table won't see it."
    : "Start a new table as the DM? Players should open the DM's link instead.";
  if (!window.confirm(warning)) return;
  $("create").disabled = true;
  try {
    const code = await backend.createRoom(starterParty, starterRecap);
    location.href = "?room=" + code;
  } catch (error) {
    $("lobby-status").textContent = error.message;
    $("create").disabled = false;
    if (error.status === 401) showLobby("Sign in again to continue.");
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (listening) {
      resumeOnReturn = true;
      stopMic();
      $("mic-status").textContent = "Listening paused while the screen was off or another app was open.";
    }
    return;
  }
  returnToTable();
  if (resumeOnReturn && !ended) {
    resumeOnReturn = false;
    startMic();
  }
});
window.addEventListener("pageshow", returnToTable);
// Back on this tab: catch up, and pick up encounter changes the DM made on
// another device before this one saves over them.
function returnToTable() {
  sync();
  if (isHost && encounterLoaded) loadCloudEncounter();
}

// Back to the home screen (your tables, join by link). The table stays open;
// "Tables you joined" (or your DM list) gets you straight back in.
$("home").onclick = () => {
  if (listening && !window.confirm("Stop listening and go back to your tables?")) return;
  if (room) rememberTable(room);
  location.href = "./";
};



// ── Claude for the DM: enemies from a description, and the DM assistant ──
// Host only; nothing is sent until the DM taps. TABLE STATE gives Claude the
// fight as the DM sees it (real enemy HP included: only the DM reads it).
function dmTableState() {
  const lines = [];
  const combat = state?.combat;
  if (combat) {
    const order = liveOrder();
    const current = order.find(entry => entry.key === combat.turn);
    lines.push("Fight: round " + combat.round + (current ? ", " + current.name + "'s turn" : ", turn order not started"));
  } else lines.push("No fight right now.");
  for (const [index, member] of (state?.party ?? []).entries()) {
    const record = state.hp?.[member.name];
    const away = isSittingOut(combat, index) ? " (not in this fight)" : "";
    lines.push(member.name + ": " + (record ? record.hp + "/" + record.max + " HP" : "HP not set") + (readRes(index).raging ? ", raging" : "") + away);
  }
  for (const enemy of enemies) {
    lines.push(enemy.name + ": " + enemy.hp + "/" + enemy.maxHp + " HP, AC " + enemy.ac + (enemy.conditions?.length ? ", " + enemy.conditions.join(", ") : ""));
  }
  return lines.join("\n").slice(0, 3000);
}

function statBlockCard(enemy, onAdd, onSave) {
  const card = document.createElement("article");
  card.className = "claude-enemy";
  const attacks = enemy.attacks.map(([name, hit, damage, rider]) => name + " " + (hit >= 0 ? "+" : "") + hit + " · " + damage + (rider ? " (" + riderText(rider) + ")" : "")).join("; ");
  card.append(element("strong", "", enemy.name + " × " + enemy.count),
    element("p", "fineprint", "CR " + (enemy.cr || "?") + " · AC " + enemy.ac + " · HP " + enemy.hp + " · " + enemy.speed + " ft · init " + (enemy.init >= 0 ? "+" : "") + enemy.init),
    element("p", "fineprint", attacks || "No attacks"),
    element("p", "", enemy.abilities));
  const row = document.createElement("div");
  row.className = "action-row";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "cta";
  add.textContent = "Add " + enemy.count;
  add.onclick = () => { onAdd(); add.disabled = true; add.textContent = "Added"; };
  const save = document.createElement("button");
  save.type = "button";
  save.className = "quiet";
  save.textContent = "Save as my template";
  save.onclick = () => { onSave(); save.disabled = true; save.textContent = "Saved"; };
  row.append(add, save);
  card.append(row);
  return card;
}

$("claude-enemy-form").onsubmit = async event => {
  event.preventDefault();
  const prompt = $("claude-enemy-text").value.trim();
  if (!prompt) { $("claude-enemy-status").textContent = "Describe the enemies you want."; return; }
  const button = event.submitter;
  button.disabled = true;
  $("claude-enemy-status").textContent = "Claude is building them…";
  try {
    const { enemies: built, note } = await backend.dmAsk(room, "enemies", prompt, dmTableState());
    const addOne = template => {
      const { count, ...stats } = template;
      const added = joinFight(createEnemies(stats, count, undefined, enemies));
      enemies = [...enemies, ...added];
      saveEncounter();
      drawEncounter();
      $("claude-enemy-status").textContent = "Added " + added.length + " × " + stats.name + " (HP " + added.map(enemy => enemy.maxHp).join(", ") + ").";
    };
    const saveOne = template => {
      const { count, ...stats } = template;
      storage.set(TEMPLATE_KEY, JSON.stringify([stats, ...savedTemplates().filter(saved => saved.name !== stats.name)].slice(0, 30)));
      drawTemplateOptions();
    };
    const cards = built.map(template => statBlockCard(template, () => addOne(template), () => saveOne(template)));
    if (built.length > 1) {
      const all = document.createElement("button");
      all.type = "button";
      all.className = "secondary";
      all.textContent = "Add them all";
      all.onclick = () => { for (const card of cards) card.querySelector("button.cta:not(:disabled)")?.click(); all.disabled = true; };
      cards.push(all);
    }
    $("claude-enemy-list").replaceChildren(...(note ? [element("p", "callout gold", note)] : []), ...cards);
    $("claude-enemy-status").textContent = "Check them over, then add.";
  } catch (error) {
    $("claude-enemy-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

const DM_PRESETS = [
  ["🌀 A twist", "Give me a twist that fits where the story is right now."],
  ["🎭 An NPC", "Give me an NPC the party could meet next: name, look, voice, and what they want."],
  ["🏛️ Describe it", "Describe this place or moment vividly, in a few sentences I can read out."],
  ["⚔️ Enemy tactics", "What would the enemies do on their next turns, given the table state?"],
  ["🧭 Stuck?", "The players seem stuck. Give me hints I can drop without handing them the answer."]
];
$("dm-ask-presets").replaceChildren(...DM_PRESETS.map(([label, text]) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip quiet";
  chip.textContent = label;
  chip.onclick = () => { $("dm-ask-text").value = text; $("dm-ask-text").focus(); };
  return chip;
}));
$("dm-ask-form").onsubmit = async event => {
  event.preventDefault();
  const prompt = $("dm-ask-text").value.trim();
  if (!prompt) { $("dm-ask-status").textContent = "Ask something, or tap an idea above."; return; }
  const button = event.submitter;
  button.disabled = true;
  $("dm-ask-status").textContent = "Claude is thinking…";
  try {
    const { answer, ideas } = await backend.dmAsk(room, "dm", prompt, dmTableState());
    const items = ideas.map(idea => {
      const item = document.createElement("div");
      item.className = "dm-idea";
      item.append(element("strong", "", idea.title), element("p", "", idea.detail));
      if (idea.line) {
        item.append(element("blockquote", "", idea.line));
        const use = document.createElement("button");
        use.type = "button";
        use.className = "quiet";
        use.textContent = "Add to my update";
        use.onclick = () => { setDraft([$("draft").value.trim(), idea.line].filter(Boolean).join("\n\n")); use.textContent = "Added to your update"; use.disabled = true; };
        item.append(use);
      }
      return item;
    });
    $("dm-ask-out").replaceChildren(...(answer ? [element("p", "", answer)] : []), ...items);
    $("dm-ask-out").hidden = false;
    $("dm-ask-status").textContent = "";
  } catch (error) {
    $("dm-ask-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};


// ── Who an update is for: everyone, or part of a split party. The choice
// stays until the DM changes it, so a run of updates to the vault all go
// there. While it's private, a banner by the mic says so (with a one-tap way
// back to everyone), and speech isn't published on its own: the DM taps
// Publish update for each private update. ──
const SCENE_TO = () => "dnd-scene-to:" + room;
function sceneTo() {
  const picked = readJson(SCENE_TO(), []);
  const names = (state?.party ?? []).map(member => member.name).filter(name => picked.includes(name));
  return names.length && names.length < (state?.party?.length ?? 0) ? names : null;
}
function drawSceneTo() {
  const box = $("scene-to");
  if (!isHost || !state?.party) { box.hidden = true; $("scene-to-note").hidden = true; return; }
  box.hidden = false;
  const to = sceneTo();
  const chip = (label, on, onclick, aria) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (on ? " is-on" : "");
    button.textContent = label;
    button.setAttribute("aria-pressed", String(on));
    if (aria) button.setAttribute("aria-label", aria);
    button.onclick = onclick;
    return button;
  };
  const set = names => { storage.set(SCENE_TO(), JSON.stringify(names)); drawSceneTo(); };
  box.replaceChildren(element("span", "fineprint", "To:"), chip("Everyone", !to, () => set([])),
    ...state.party.map(({ name }) => {
      const on = Boolean(to?.includes(name));
      return chip(name.replace(/^The /, ""), on, () => set(on ? to.filter(other => other !== name) : [...(to ?? []), name]), (on ? "Stop sending to " : "Send only to ") + name);
    }));
  // Shown by the mic, outside the fold, so a private To is never missed.
  const note = $("scene-to-note");
  note.hidden = !to;
  if (!to) return;
  clearPublishTimers();
  $("manual-controls").open = true;
  const everyone = document.createElement("button");
  everyone.type = "button";
  everyone.className = "ghost";
  everyone.textContent = "Send to everyone";
  everyone.onclick = () => set([]);
  note.replaceChildren(element("span", "", "🔒 Private: updates go only to " + to.map(name => name.replace(/^The /, "")).join(", ")
    + ". Speech waits in the draft until you tap Publish update."), everyone);
}

// ── Start ── Last in the file: everything above (including constants a
// cached table draws with at once, like the split-party To setting) must be
// defined before the first draw.
// Home-screen app (manifest.json + sw.js): installable, and opens offline.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (room && (!backend.hosted || backend.user())) enterRoom();
else showLobby(room ? "Sign in to join the table." : "");
