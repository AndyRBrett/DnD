import { recommend, coachingPrompt, characterAbilities } from "./scene-options.js";
// A practice table is marked by its opening update (no database change), and
// the device that started it also remembers it, in case 30+ updates push the
// opening line out of view.
const PRACTICE_MARK = "PRACTICE TABLE";
import { backend, storage } from "./backend.js";
import { organizeSheet, basics, conditions } from "./rules.js";
import { roll, poolExpression, rollableFrom, parse as parseDice } from "./dice.js";
import { createDie, percentileLabels } from "./dice3d.js";
import { templates as enemyTemplates, createEnemies, applyHp, status as enemyStatus, standing, rollInitiative, publicEnemies, combatOrder, nextTurn, upNext, maxHpFromSheet, changePartyHp, partyHpStatus, combatStats, concentrationDc, attackOutcome, hitReportText, parseHitReport, deathSave, buildAttack, abilityMods, attackBreakdown, slotKey, resourceLeft, spendResource, rest as restResources, castableLevels, upcastAttack } from "./encounter.js";
import { party as starterParty, recap as starterRecap, sheets } from "./campaign.js";

const $ = id => document.getElementById(id);
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

function showOptions() {
  const character = selectedCharacter();
  if (!character) return;
  storage.set("dnd-character", $("character").value);
  $("character-role").textContent = character.role;
  drawConditions();
  const rolls = sheets[character.name]?.rolls ?? [];
  $("quick-rolls").hidden = !rolls.length;
  $("quick-roll-chips").replaceChildren(...rollTiles(rolls));
  $("combat-rolls").replaceChildren(...rollTiles(rolls));
  $("combat-rolls-card").hidden = !rolls.length || isHost;
  drawCombat();
  updateChips();
  $("action-label").textContent = "What is " + character.name + " doing?";
  const recent = state.scenes;
  const advice = recommend(character, recent);
  const latest = recent.at(-1);
  $("situation").textContent = advice.situation + (latest ? " · Updated " +
    new Date(latest.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
  const line = latest?.text ?? "";
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
      tile.onclick = () => openDice(expression, label);
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
  list("options", advice.options);
  $("ask-dm").textContent = advice.question;
  drawSheet(character);
  resetClaude();
}

let claudeFor = "";
function resetClaude() {
  const key = $("character").value + ":" + (state?.scenes.at(-1)?.id ?? "");
  $("claude").hidden = !state?.ai || ended;
  $("tab-claude").hidden = $("claude").hidden;
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
  $("claude-status").textContent = question ? "Claude is thinking about your question…" : "Claude is reading the story…";
  try {
    const advice = await backend.advise(room, Number(index), question);
    if ($("character").value !== index || (!question && state.scenes.at(-1)?.id !== sceneId)) {
      $("claude-status").textContent = "The scene moved on. Ask again for the latest update.";
      return;
    }
    claudeFor = index + ":" + sceneId;
    $("claude-reply").hidden = !advice.answer;
    $("claude-asked").textContent = question ? "You asked: “" + question + "”" : "";
    $("claude-reply").querySelector("span").textContent = advice.answer ?? "";
    $("claude-situation").textContent = "Claude · " + advice.situation;
    $("claude-big-picture").hidden = !advice.bigPicture;
    $("claude-big-picture").querySelector("span").textContent = advice.bigPicture ?? "";
    $("claude-options").replaceChildren(...advice.options.map(option => claudeOption(option, Number(index))));
    $("claude-ask").textContent = advice.question;
    $("claude-answer").hidden = false;
    $("claude-status").textContent = "";
    if (question) $("question-text").value = "";
  } catch (error) {
    $("claude-status").textContent = error.message || "Claude could not answer. Try again.";
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

// One Claude option: what to do, why, how it works, and an editable line to
// post straight into the story.
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
  if (option.declare && backend.postAction && Array.isArray(state?.actions)) {
    const form = document.createElement("form");
    form.className = "declare";
    const field = document.createElement("textarea");
    field.rows = 2;
    field.maxLength = 300;
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
    for (const [label, value] of pairs) list.append(element("dt", "", label), element("dd", "", value));
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
  for (const [title, lines] of [...(full.lists ?? []), ["First-turn attack routine", full.routine], ["Open questions for the DM", full.questions], ["Identity", full.identity?.map(([label, value]) => label + ": " + value)]]) {
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
    wrap.append(title, ...section.entries.map(sheetEntry));
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
  if ($("tab-" + name)?.hidden) name = "scene";
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
}

async function sync() {
  if (!room || syncing || ended || $("table").hidden) return;
  syncing = true;
  try {
    const fresh = await backend.room(room);
    const hostChanged = fresh.isHost !== isHost;
    const rosterChanged = JSON.stringify(state?.party) !== JSON.stringify(fresh.party);
    const scenesChanged = JSON.stringify(state?.scenes) !== JSON.stringify(fresh.scenes)
      || JSON.stringify(state?.actions) !== JSON.stringify(fresh.actions);
    const previous = state;
    state = fresh;
    if (JSON.stringify(previous?.combat) !== JSON.stringify(fresh.combat)) combatChanged(previous);
    else if (JSON.stringify(previous?.hp) !== JSON.stringify(fresh.hp) || previous?.hpUnavailable !== fresh.hpUnavailable) drawCombat();
    if (hostChanged) setHost(fresh.isHost);
    if (!previous) rememberTable(room);
    if (rosterChanged || hostChanged) drawRoster();
    if (scenesChanged) {
      if (previous && previous.scenes.at(-1)?.id !== state.scenes.at(-1)?.id) flashScene();
      renderStory();
    }
    $("action-form").hidden = !backend.postAction || !Array.isArray(state.actions) || ended;
    if ($("party-actions").hidden === (isHost && Boolean(backend.postAction) && Array.isArray(state.actions))) drawPartyActions();
    if (rosterChanged || scenesChanged) showOptions();
    if (scenesChanged && !rosterChanged) drawHitInbox();
    if (isPractice()) {
      $("practice-banner").hidden = false;
      $("table-code").textContent = " · " + tableLabel(room).toUpperCase() + " · PRACTICE";
    }
    if (typeof state.historyChars === "number") $("history-size").textContent = "· " + describeSize(state.historyChars);
    $("connection").textContent = isHost ? "HOST" : "PLAYER";
  } catch (error) {
    if (error.status === 404) {
      ended = true;
      stopMic();
      $("notice").textContent = error.message;
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
      $("edit").hidden = true;
      $("connection").textContent = "ENDED";
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

function flashScene() {
  if (currentTab !== "scene") $("tab-scene").classList.add("has-news");
  const panel = document.querySelector(".scene-panel");
  panel.classList.remove("fresh");
  void panel.offsetWidth;
  panel.classList.add("fresh");
}

function setDraft(value) {
  $("draft").value = value.slice(0, 1500);
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
  if ($("auto").checked && !editId && !ended) {
    const words = $("draft").value.trim().split(/\s+/).filter(Boolean).length;
    const short = words < 5;
    publishTimer = setTimeout(() => publish(true), short ? Math.max(delay, 7000) : delay);
    if (!short) publishDeadline ??= setTimeout(() => publish(true), 9000);
  }
}

async function publish(automatic = false) {
  if (writing || ended || (automatic && (!$("auto").checked || editId))) return;
  const text = $("draft").value.trim();
  if (!text) return;
  clearPublishTimers();
  const id = editId;
  writing = true;
  $("publish").disabled = true;
  try {
    await backend.postScene(room, text, id);
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
$("draft").oninput = clearPublishTimers;
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
$("character").onchange = showOptions;
$("ask-claude").onclick = () => askClaude();
$("copy-coach").onclick = async () => {
  const character = selectedCharacter();
  if (!character || ended) return;
  const prompt = coachingPrompt(character, state.scenes);
  try {
    await navigator.clipboard.writeText(prompt);
    $("coach-status").textContent = "Copied. Paste into your D&D chat for a deeper answer.";
  } catch {
    window.prompt("Copy this prompt into your D&D chat", prompt);
  }
};
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
    const party = Array.from({length: 5}, (_, index) => Object.fromEntries(
      ["name", "role", "moves"].map(key => [key, data.get(key + index)])
    ));
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
    const updates = isPractice() ? [] : state.scenes.map(scene =>
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
function renderStory(force = false) {
  if (storyEditing && !force) return;
  for (const form of $("scene-current").querySelectorAll(".story-editor")) form.remove();
  $("scene-current").classList.remove("is-editing");
  $("scene").hidden = false;
  $("scene").textContent = state.scenes.at(-1)?.text || "Waiting for an update.";
  $("edit").hidden = !isHost || ended || !state.scenes.length;
  drawStory();
}
const canEditStory = entry => !ended && (entry.kind === "scene"
  ? isHost
  : Boolean(backend.editAction) && (isHost || entry.mine));
function storyItem(entry) {
  const item = document.createElement("li");
  if (entry.kind === "action") item.className = "player-action";
  const text = document.createElement("span");
  text.className = "story-text";
  text.textContent = entry.kind === "action" ? entry.name + ": " + entry.text : entry.text;
  item.append(text);
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
  if (storyEditing) renderStory(true);
  if (!container.isConnected) return;
  storyEditing = entry;
  for (const child of container.children) child.hidden = true;
  container.classList.add("is-editing");
  const form = document.createElement("form");
  form.className = "story-editor";
  const area = document.createElement("textarea");
  area.value = entry.text;
  area.rows = entry.kind === "scene" ? 4 : 2;
  area.maxLength = entry.kind === "scene" ? 1500 : 300;
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
    if (!window.confirm(entry.kind === "scene" ? "Delete this update for everyone?" : "Delete " + entry.name + "'s action for everyone?")) return;
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
  const latest = state.scenes.at(-1);
  const actions = (state.actions ?? []).map(action => ({ ...action, kind: "action" }));
  const since = actions.filter(action => !latest || action.created >= latest.created);
  $("since-actions").replaceChildren(...[...since].reverse().map(storyItem));
  $("since-wrap").hidden = !since.length;
  const earlier = [
    ...state.scenes.slice(0, -1).map(scene => ({ kind: "scene", id: scene.id, at: scene.created, text: scene.text })),
    ...actions.filter(action => latest && action.created < latest.created).map(action => ({ ...action, at: action.created }))
  ].sort((a, b) => b.at - a.at);
  $("history").replaceChildren(...earlier.map(storyItem));
}

// Host view: one input per character, for players without a phone out.
function drawPartyActions() {
  $("party-actions").hidden = !isHost || !backend.postAction || !Array.isArray(state?.actions);
  if ($("party-actions").hidden) return;
  const typed = [...$("party-action-rows").querySelectorAll("input")].map(input => input.value);
  $("party-action-rows").replaceChildren(...state.party.map(({ name }, index) => {
    const row = document.createElement("form");
    row.className = "action-row party-action";
    const input = document.createElement("input");
    input.maxLength = 300;
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

$("action-form").onsubmit = async event => {
  event.preventDefault();
  const text = $("action-text").value.trim();
  if (!text || !state) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await backend.postAction(room, Number($("character").value), text);
    $("action-text").value = "";
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
  storage.set(conditionKey(), JSON.stringify(active));
  drawConditions();
  const character = selectedCharacter();
  if (!character || !backend.postAction || !Array.isArray(state?.actions) || ended) return;
  const { icon } = conditionByName[name];
  const text = !level ? "is no longer " + name + (name === "Exhaustion" ? "ed" : "")
    : name === "Exhaustion" ? "has Exhaustion level " + level + " " + icon
    : name === "Concentrating" ? "is concentrating on a spell " + icon
    : "is " + name + " " + icon;
  try {
    await backend.postAction(room, Number($("character").value), text.replace("Exhaustioned", "exhausted"));
    $("condition-status").textContent = "The table can see this.";
    sync();
  } catch (error) {
    $("condition-status").textContent = error.message;
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
    button.onclick = () => setCondition(name, active[name] ? 0 : 1);
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
    : [{ ...face, kind: face.sides, caption: "d" + face.sides, label: face.value === undefined ? undefined : String(face.value) }]);
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
  const parsed = parseDice($("dice-expression").value.trim() || "d20");
  if (!parsed) return stageDice([]);
  const faces = parsed.dice.flatMap(die => Array.from({ length: die.count }, () => ({ sides: die.sides })));
  const single20 = faces.length === 1 && faces[0].sides === 20 && parsed.dice[0].sign === 1;
  if (single20 && dice.mode !== "normal") faces.push({ sides: 20 });
  for (const slot of stageDice(faces)) slot.die.idle();
}
async function spinDice(result) {
  const faces = result.groups.flatMap(group => group.results.map(value => ({ sides: group.sides, value })));
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
function openDice(expression = "", label = "", onResult = null) {
  dice.onResult = onResult;
  dice.pool = {};
  dice.modifier = 0;
  dice.label = label;
  $("mod-value").textContent = "+0";
  $("dice-expression").value = expression;
  $("dice-label").textContent = label ? label + " · " + expression : "";
  $("dice-result").hidden = true;
  $("dice-status").textContent = "";
  const canShare = Boolean(backend.postAction) && Array.isArray(state?.actions) && !isHost && !ended && !onResult;
  $("dice-share-wrap").hidden = !canShare;
  const notes = conditionRollNotes();
  $("dice-conditions").hidden = !notes.length;
  $("dice-conditions").textContent = notes.join(" ");
  $("dice-tray").hidden = false;
  previewDice();
  document.body.classList.add("no-scroll");
}
function closeDice() {
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
$("mod-minus").onclick = () => { dice.modifier -= 1; dice.label = ""; $("dice-label").textContent = ""; if (!Object.keys(dice.pool).length) dice.pool = { 20: 1 }; syncDiceExpression(); };
$("mod-plus").onclick = () => { dice.modifier += 1; dice.label = ""; $("dice-label").textContent = ""; if (!Object.keys(dice.pool).length) dice.pool = { 20: 1 }; syncDiceExpression(); };
$("dice-expression").oninput = () => { dice.pool = {}; dice.modifier = 0; $("mod-value").textContent = "+0"; previewDice(); };
for (const button of $("dice-mode").children) {
  button.onclick = () => {
    dice.mode = button.dataset.mode;
    for (const other of $("dice-mode").children) other.classList.toggle("is-active", other === button);
    previewDice();
  };
}
$("dice-clear").onclick = () => openDice();
$("dice-roll").onclick = async () => {
  const expression = $("dice-expression").value.trim() || "d20";
  const result = roll(expression, { mode: dice.mode });
  if (!result) {
    $("dice-status").textContent = "Try something like d20+5, 2d6+3, or 1d12+7.";
    return;
  }
  $("dice-status").textContent = "";
  $("dice-result").hidden = true;
  $("dice-roll").disabled = true;
  try {
    await spinDice(result);
  } finally {
    $("dice-roll").disabled = false;
  }
  $("dice-total").textContent = String(result.total);
  $("dice-tag").textContent = result.critical ? "NATURAL 20" : result.fumble ? "NATURAL 1" : result.mode !== "normal" ? result.mode.toUpperCase() : "";
  $("dice-result").className = "dice-result" + (result.critical ? " is-crit" : result.fumble ? " is-fumble" : "");
  $("dice-breakdown").textContent = result.expression + " → " + result.breakdown;
  $("dice-result").hidden = false;
  $("dice-result").animate?.([{ transform: "scale(.92)", opacity: .4 }, { transform: "scale(1)", opacity: 1 }], { duration: 220, easing: "ease-out" });
  if (!(result.groups.length === 1 && result.groups[0].sides === 20 && result.groups[0].count === 1)) {
    lastDamageRoll = { total: result.total, label: dice.label || result.expression };
  }
  const name = dice.label || result.expression;
  dice.log.unshift(name + ": " + result.total + " (" + result.breakdown + ")");
  dice.log = dice.log.slice(0, 8);
  list("dice-log", dice.log);
  if (dice.onResult) {
    await dice.onResult(result.total, result);
    return;
  }
  if (!$("dice-share-wrap").hidden && $("dice-share").checked) {
    const text = ("🎲 " + name + ": " + result.total + " (" + result.breakdown + (result.mode !== "normal" ? ", " + result.mode : "") + ")").slice(0, 300);
    try {
      await backend.postAction(room, Number($("character").value), text);
      $("dice-status").textContent = "Shared with the table.";
      sync();
    } catch (error) {
      $("dice-status").textContent = error.message;
    }
  }
};

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
function initiativeExpression() {
  const name = selectedCharacter()?.name;
  const entry = (sheets[name]?.rolls ?? []).find(([label]) => /initiative/i.test(label));
  return (entry && rollableFrom(entry[1])) || "d20";
}
function combatChanged(previous) {
  const before = previous?.combat;
  const now = state.combat;
  drawCombat();
  if (!before && now) {
    if (!isHost) showTab("combat");
    $("tab-combat").classList.toggle("has-news", currentTab !== "combat");
  }
  if (before && !now) {
    if (currentTab === "combat") showTab("scene");
    $("notice").textContent = "Combat ended.";
    setTimeout(() => { if ($("notice").textContent === "Combat ended.") $("notice").textContent = ""; }, 6000);
  }
  const mine = "pc:" + myIndex();
  if (now && !isHost && now.turn === mine && before?.turn !== mine) {
    navigator.vibrate?.([120, 60, 120]);
    if (currentTab !== "combat") $("tab-combat").classList.add("has-news");
  }
}
async function publishCombat(changes = {}) {
  clearTimeout(combatTimer);
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

function drawCombat() {
  drawHp();
  drawHitReport();
  drawHitInbox();
  const combat = state?.combat;
  const available = Boolean(backend.combatSet) && !ended;
  $("tab-combat").hidden = !combat;
  if (!combat && currentTab === "combat") showTab("scene");
  if (isHost) {
    $("enc-combat").hidden = !available || (!combat && !enemies.length);
    $("enc-combat").textContent = combat ? "End combat" : "Start combat";
    $("enc-combat").className = combat ? "danger-soft" : "cta";
    if (combat) $("enc-combat-status").textContent = "Combat is live. Players see names, initiative, and Healthy / Bloodied / Down — never HP or AC.";
  }
  if (!combat) return;

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
  const foes = order.filter(entry => entry.kind === "enemy");
  const up = foes.filter(entry => entry.status !== "down").length;
  $("combat-foes").textContent = foes.length ? up + " of " + foes.length + " enemies standing" : "No enemies yet";
  $("combat-dm").hidden = !isHost;

  const mine = me === null ? undefined : combat.party?.[me];
  $("combat-init").hidden = isHost;
  $("init-title").textContent = Number.isFinite(mine) ? "Your initiative: " + mine : "Your initiative";
  $("init-roll").textContent = "Roll " + initiativeExpression();
  $("combat-hint").hidden = isHost;

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
      item.append(input);
    }
    return item;
  }));
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
function partyAc(index) {
  const value = combatStats(sheets[partyName(index)], hpRecord(index)).find(stat => stat.label === "AC")?.value;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}
function hpText(record) {
  return record ? record.hp + " / " + record.max + (record.temp ? " (+" + record.temp + " temp)" : "") : "Not set";
}
async function adjustHp(index, change, status) {
  const record = hpRecord(index);
  if (!record) { status.textContent = "Set max HP first."; return; }
  state.hp = { ...state.hp, [partyName(index)]: changePartyHp(record, change) };
  drawCombat();
  const concentrating = !isHost && index === Number($("character").value) && activeConditions().Concentrating;
  const reminder = change < 0 && concentrating
    ? "🧠 Concentration save: DC " + concentrationDc(-change) + " Constitution — or the spell ends." : "";
  try {
    await backend.adjustHp(room, index, change);
    if (reminder) status.textContent = reminder;
  } catch (error) {
    status.textContent = error.message;
  }
  await sync();
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
  const record = { max, hp: Math.max(0, Math.min(max, Math.round(Number(values.hp ?? max)))), temp: Math.max(0, Math.round(Number(values.temp) || 0)) };
  const keptAc = ac ?? hpRecord(index)?.ac;
  if (keptAc) record.ac = keptAc;
  state.hp = { ...state.hp, [partyName(index)]: record };
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
    if (compact) strip.textContent = stats.map(stat => stat.label.replace("Passive Perc.", "PP") + " " + stat.value + (stat.unconfirmed ? "?" : "")).join(" · ");
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
      note.textContent = HP_LABEL[health];
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
  const sheetAc = combatStats(sheets[partyName(index)]).find(stat => stat.label === "AC")?.value;
  const [acLabel, acInput] = field("AC", record?.ac ?? sheetAc ?? "");
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
const deathKey = index => "dnd-death:" + room + ":" + index;
const readDeath = index => readJson(deathKey(index), { successes: 0, failures: 0 });
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
        const next = { ...readDeath(index), [key]: saves[key] >= n ? n - 1 : n };
        storage.set(deathKey(index), JSON.stringify(next));
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
  rollButton.textContent = "Roll death save";
  rollButton.hidden = Boolean(outcome);
  rollButton.onclick = () => openDice("d20", "Death save", async natural => {
    const result = deathSave(readDeath(index), natural);
    const { outcome: what, ...counts } = result;
    storage.set(deathKey(index), JSON.stringify(counts));
    const summary = what === "revived" ? "natural 20 — back up with 1 HP!"
      : what === "dead" ? "fails — dead" : what === "stable" ? "succeeds — stable"
      : (natural >= 10 ? "success" : natural === 1 ? "natural 1, two failures" : "failure") + " (" + counts.successes + " ✓ / " + counts.failures + " ✗)";
    $("dice-status").textContent = "Death save " + natural + ": " + summary;
    if (what === "revived") await adjustHp(index, 1, $("dice-status"));
    if (backend.postAction && Array.isArray(state?.actions)) {
      backend.postAction(room, index, "💀 death save " + natural + ": " + summary).then(sync).catch(() => {});
    }
    drawHp();
  });
  const hint = document.createElement("p");
  hint.className = "fineprint";
  hint.textContent = "Taking damage while down is a failure (a critical hit is two) — tap a box. Any healing brings you back.";
  box.append(title, row("Successes", "successes", "✓"), row("Failures", "failures", "✗"), rollButton, hint);
  return box;
}

// ── Resources: spell slots and per-rest features (Rage, Channel Divinity,
// superiority dice…), kept on this phone for each character. Campaign tables
// share one record (so it carries between sessions); a practice table has its
// own. Rage and rests are posted to the story so the DM sees them. ──
const ORDINAL = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th" };
const resKey = index => "dnd-res:" + (isPractice() ? room : "campaign") + ":" + partyName(index);
const readRes = index => readJson(resKey(index), { used: {}, raging: false });
function writeRes(index, value) {
  storage.set(resKey(index), JSON.stringify(value));
  drawCombat();
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
  const sheet = sheets[partyName(index)];
  const res = readRes(index);
  const box = document.createElement("div");
  box.className = "res-widget";
  const head = document.createElement("div");
  head.className = "res-head";
  const title = document.createElement("p");
  title.className = "eyebrow red";
  title.textContent = "RESOURCES · " + partyName(index).toUpperCase();
  head.append(title);
  box.append(head);
  const set = (key, left) => {
    const max = resourceLeft(sheet, { used: {} }, key);
    writeRes(index, { ...res, used: { ...res.used, [key]: Math.max(0, Math.min(max, max - left)) } });
  };
  for (const resource of sheet.resources) {
    const block = document.createElement("div");
    block.className = "res-block";
    const name = document.createElement("strong");
    name.textContent = resource.name;
    const per = document.createElement("span");
    per.className = "res-per";
    per.textContent = resource.per === "short" ? "back on a short or long rest" : "back on a long rest";
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
  const rests = document.createElement("div");
  rests.className = "action-row rest-row";
  const shortRest = document.createElement("button");
  shortRest.type = "button";
  shortRest.className = "ghost";
  shortRest.textContent = "Short rest";
  shortRest.onclick = () => {
    writeRes(index, restResources(sheet, readRes(index), "short"));
    tellTable(index, "🏕️ takes a short rest");
  };
  const longRest = document.createElement("button");
  longRest.type = "button";
  longRest.className = "ghost";
  longRest.textContent = "Long rest";
  longRest.onclick = () => {
    if (!window.confirm("Long rest: refill all slots and features, and restore full HP?")) return;
    writeRes(index, restResources(sheet, readRes(index), "long"));
    const record = hpRecord(index);
    if (record) saveHp(index, { hp: record.max, max: record.max, temp: 0, ac: record.ac }, document.createElement("p"));
    tellTable(index, "🛌 takes a long rest");
  };
  rests.append(shortRest, longRest);
  box.append(rests);
  return box;
}
function fillResources(container, index) {
  const open = container.querySelector(".how-slots")?.open ?? false;
  container.replaceChildren(resourcesWidget(index));
  const how = container.querySelector(".how-slots");
  if (how) how.open = open;
}

// Redraws a widget unless someone is typing in it (the poll would wipe it).
function fillHp(container, index, options = {}) {
  if (container.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
  // Keep the "Set HP" fold open across polls, but close it once HP is set.
  const known = String(Boolean(hpRecord(index)));
  const open = container.dataset.known === known && (container.querySelector("details")?.open ?? false);
  container.dataset.known = known;
  container.replaceChildren(hpWidget(index, { ...options, open }));
}
function drawHp() {
  const available = hpAvailable();
  const me = Number($("character").value);
  const ready = available && state?.party?.[me];
  $("hp-badge").hidden = !ready || isHost;
  if (!ready) for (const id of ["res-sheet", "res-combat", "rage-badge"]) $(id).hidden = true;
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
    if (record?.hp > 0 && storage.get(deathKey(me))) storage.remove(deathKey(me));
    const health = partyHpStatus(record);
    $("hp-badge").className = "badge hp-badge is-" + health;
    $("hp-badge").textContent = "❤️ " + (record ? (health === "down" ? "DOWN" : record.hp + "/" + record.max + (record.temp ? " +" + record.temp : "")) : "Set HP");
    fillHp($("hp-sheet"), me);
    if (!$("hp-combat").hidden) fillHp($("hp-combat"), me);
    const hasResources = Boolean(sheets[partyName(me)]?.resources?.length) && !isHost;
    $("res-sheet").hidden = !hasResources;
    $("res-combat").hidden = !hasResources || $("hp-combat").hidden;
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
$("hp-badge").onclick = () => {
  showTab("sheet");
  $("hp-sheet").scrollIntoView({ behavior: "smooth", block: "start" });
};

// ── Hit reports: a player tells the DM "🎯 hit Bandit 2 for 14 damage"
// (a story line); the DM's phone offers to apply it to that enemy. ──
let lastDamageRoll = null;
const HANDLED_KEY = () => "dnd-hits-handled:" + room;
const handledHits = () => new Set(readJson(HANDLED_KEY(), []));
function markHit(id) {
  storage.set(HANDLED_KEY(), JSON.stringify([...handledHits(), id].slice(-300)));
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
const attackFlow = { character: null, index: 0, options: new Set(), step: "ready", toHit: null, crit: false, damage: null, sent: [], level: null, spent: false, spentManeuver: false, notes: [] };
function resetAttack(keepChoice = true) {
  Object.assign(attackFlow, { step: "ready", toHit: null, crit: false, damage: null, sent: [], spent: false, spentManeuver: false, notes: [] });
  if (!keepChoice) Object.assign(attackFlow, { index: 0, options: new Set() });
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
function drawAttack() {
  const combat = state?.combat;
  const card = $("attack-card");
  card.hidden = !combat || isHost || ended;
  if (card.hidden) return;
  const me = Number($("character").value);
  if (attackFlow.character !== me) { attackFlow.character = me; resetAttack(false); }
  const sheet = sheets[partyName(me)] ?? {};
  const attacks = sheet.attacks ?? [];
  const baseAttack = attacks[attackFlow.index];
  const res = readRes(me);
  const levels = castableLevels(baseAttack, sheet, res);
  if (baseAttack?.slot && !attackFlow.spent && !levels.includes(attackFlow.level)) attackFlow.level = levels[0] ?? null;
  const attack = baseAttack?.slot && attackFlow.level ? upcastAttack(baseAttack, attackFlow.level) : baseAttack;
  const isOn = option => attackFlow.options.has(option.name) || Boolean(option.rage && res.raging);
  $("attack-title").textContent = "Attack · " + partyName(me).replace(/^The /, "");

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
  const options = attack && !attack.save ? sheet.attackOptions ?? [] : [];
  if (attack) {
    const math = attackBreakdown(attack, sheet, options.filter(isOn));
    const lines = [
      math.hit ? "To hit: " + math.hit : "Save: " + math.dc,
      baseAttack.slot ? ORDINAL[baseAttack.slot] + "-level spell: uses a spell slot" : baseAttack.spends ? "Uses " + baseAttack.spends + " (" + resourceLeft(sheet, res, baseAttack.spends) + " left)" : "",
      "Damage: " + math.damage + (attack.type ? " " + attack.type : ""),
      attack.note ?? ""
    ].filter(Boolean);
    $("attack-note").replaceChildren(...lines.map((text, index) => {
      const line = document.createElement(index < 1 || text.startsWith("Damage") ? "strong" : "span");
      line.textContent = text;
      return line;
    }));
  } else {
    $("attack-note").textContent = "No attacks on this sheet yet — use Other damage below.";
  }
  $("attack-options").replaceChildren(...options.map(option => {
    const label = document.createElement("label");
    label.className = "attack-option";
    label.title = option.note ?? "";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isOn(option);
    const spentOut = option.spends && resourceLeft(sheet, res, option.spends) < 1 && !box.checked;
    box.disabled = spentOut;
    box.onchange = () => {
      if (box.checked) attackFlow.options.add(option.name); else attackFlow.options.delete(option.name);
      drawAttack();
    };
    const text = document.createElement("span");
    text.textContent = option.name + (option.rage && res.raging ? " 😤" : "") + (spentOut ? " (none left)" : option.spends ? " · " + resourceLeft(sheet, res, option.spends) + " left" : "");
    label.append(box, text);
    return label;
  }));

  const select = $("attack-target");
  if (document.activeElement !== select) {
    const chosen = select.value;
    const targets = (combat.enemies ?? []).filter(enemy => enemy.status !== "down");
    select.replaceChildren(new Option(targets.length ? "Which enemy?" : "No enemies standing", ""),
      ...targets.map(enemy => new Option(enemy.name + " · " + (STATUS_TEXT[enemy.status] ?? ""), enemy.name)));
    select.value = targets.some(enemy => enemy.name === chosen) ? chosen : "";
  }

  const steps = $("attack-steps");
  if (!attack) { steps.replaceChildren(); return; }
  const chosenOptions = options.filter(isOn);
  const built = buildAttack(attack, chosenOptions, { crit: attackFlow.crit, extraCritDice: sheet.critExtraDice ?? 0 });
  const parts = [];
  // Spend the slot (or Channel Divinity) when the spell is cast, and a
  // superiority die when its maneuver is used on a hit.
  const spend = stage => {
    let next = readRes(me);
    const notes = [];
    if (!attackFlow.spent) {
      if (baseAttack.slot && attackFlow.level) {
        next = spendResource(sheet, next, slotKey(attackFlow.level));
        notes.push("Used a " + ORDINAL[attackFlow.level] + "-level slot (" + resourceLeft(sheet, next, slotKey(attackFlow.level)) + " left)");
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
      storage.set(resKey(me), JSON.stringify(next));
      drawHp();
    }
  };
  let blocked = "";
  if (baseAttack.slot && !attackFlow.spent && !levels.length) {
    blocked = "No spell slots left for " + baseAttack.name + " (it needs a " + ORDINAL[baseAttack.slot] + "-level slot or higher). Take a long rest, or fix the dots under Resources.";
  } else if (baseAttack.spends && !attackFlow.spent && resourceLeft(sheet, res, baseAttack.spends) < 1) {
    blocked = "No " + baseAttack.spends + " left — it comes back on a rest.";
  }
  const rollDamage = () => { spend("damage"); openDice(built.damage, attack.name + " damage", total => {
    attackFlow.damage = total;
    attackFlow.step = "damage";
    drawAttack();
    setTimeout(closeDice, 1200);
  }); };
  const next = stepButton("Next attack", "quiet", () => { resetAttack(); drawAttack(); });

  for (const note of attackFlow.notes ?? []) parts.push(stepText("✨ " + note, "fineprint"));
  if (attackFlow.step === "ready" && baseAttack.slot && levels.length) {
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
      parts.push(stepText("Targets make a " + built.save + ". The DM rolls their saves."),
        stepButton("Roll damage · " + built.damage, "cta", rollDamage));
    } else {
      parts.push(stepButton("Roll to hit · " + built.toHit + (built.mode === "advantage" ? " (advantage)" : ""), "cta", () => {
        spend("hit");
        openDice(built.toHit, attack.name + " to hit", (total, result) => {
          attackFlow.toHit = result;
          attackFlow.crit = result.critical;
          attackFlow.step = result.critical ? "hit" : result.fumble ? "miss" : "rolled";
          drawAttack();
          setTimeout(closeDice, 1200);
        });
        setDiceMode(built.mode);
      }));
    }
  } else if (attackFlow.step === "rolled") {
    const natural = attackFlow.toHit.natural;
    parts.push(stepText(attackFlow.toHit.total + " to hit (rolled " + natural + "). Tell the DM — does it hit?", "is-big"),
      stepButton("Hit", "cta", () => { attackFlow.step = "hit"; drawAttack(); }),
      stepButton("Miss", "ghost", () => { attackFlow.step = "miss"; drawAttack(); }));
  } else if (attackFlow.step === "hit") {
    parts.push(stepText(attackFlow.crit ? "CRITICAL HIT! Natural 20 — damage dice are doubled." : "Hit with " + attackFlow.toHit.total + "!", attackFlow.crit ? "is-crit" : "is-hit"),
      stepButton("Roll damage · " + built.damage, "cta", rollDamage));
  } else if (attackFlow.step === "miss") {
    parts.push(stepText(attackFlow.toHit?.fumble ? "Natural 1 — a miss." : "Miss.", "is-miss"), next);
  } else if (attackFlow.step === "damage") {
    const detail = "with " + attack.name + (attackFlow.level ? " (" + ORDINAL[attackFlow.level] + "-level)" : "") + (built.save ? ", " + built.save
      : ", " + attackFlow.toHit.total + " to hit" + (attackFlow.crit ? ", critical" : ""));
    parts.push(stepText(attackFlow.damage + " " + (attack.type ?? "") + " damage" + (attackFlow.crit ? " (critical)" : ""), "is-big"));
    const target = select.value;
    if (backend.postAction && Array.isArray(state?.actions)) {
      const send = stepButton(target ? "Send " + attackFlow.damage + " to the DM · " + target : "Pick the target above to send", "cta", async () => {
        const name = $("attack-target").value;
        if (!name) { $("attack-target").focus(); return; }
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
      send.disabled = !target;
      parts.push(send);
      if (attackFlow.sent.length) parts.push(stepText("Sent to the DM for " + attackFlow.sent.join(", ") + (built.save ? ". Pick another target to send the same roll." : "."), "fineprint"));
    } else {
      parts.push(stepText("Tell the DM: " + attackFlow.damage + " damage.", "fineprint"));
    }
    parts.push(next);
  }
  steps.replaceChildren(...parts);
}
$("attack-target").onchange = () => drawAttack();

function drawHitInbox() {
  const box = $("hit-inbox");
  const combat = state?.combat;
  if (!isHost || !combat || !encounterLoaded) { box.hidden = true; return; }
  const since = Number(storage.get("dnd-combat-start:" + room) ?? 0); // last action id before the fight
  const handled = handledHits();
  const pending = (state.actions ?? [])
    .map(action => ({ action, report: parseHitReport(action.text) }))
    .filter(({ action, report }) => report && !handled.has(action.id) && Number(action.id) > since);
  box.hidden = !pending.length;
  $("hit-list").replaceChildren(...pending.map(({ action, report }) => {
    const item = document.createElement("li");
    const target = enemies.find(enemy => enemy.name === report.enemy);
    const text = document.createElement("span");
    const versus = target && report.toHit !== null
      ? (report.crit ? " · critical" : report.toHit >= target.ac ? " · " + report.toHit + " vs AC " + target.ac + " ✓" : " · ⚠ " + report.toHit + " vs AC " + target.ac + " — a miss?")
      : "";
    text.textContent = action.name.replace(/^The /, "") + " hit " + report.enemy + " for " + report.amount
      + (report.detail ? " " + report.detail.replace(/, \d+ to hit|, critical/g, "") : "") + versus
      + (target ? " (HP " + target.hp + "/" + target.maxHp + ")" : " — not in your encounter");
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "danger-soft";
    apply.textContent = "Apply";
    apply.disabled = !target;
    apply.onclick = () => {
      markHit(action.id);
      enemies = enemies.map(enemy => enemy.name === report.enemy ? applyHp(enemy, -report.amount) : enemy);
      saveEncounter();
      drawEncounter();
    };
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "quiet";
    dismiss.textContent = "Dismiss";
    dismiss.onclick = () => { markHit(action.id); drawCombat(); };
    const buttons = document.createElement("div");
    buttons.className = "hit-buttons";
    buttons.append(apply);
    if (report.halfOnSave) {
      const half = document.createElement("button");
      half.type = "button";
      half.className = "ghost";
      half.textContent = "Saved: " + Math.floor(report.amount / 2);
      half.disabled = !target;
      half.onclick = () => {
        markHit(action.id);
        enemies = enemies.map(enemy => enemy.name === report.enemy ? applyHp(enemy, -Math.floor(report.amount / 2)) : enemy);
        saveEncounter();
        drawEncounter();
      };
      buttons.append(half);
    }
    buttons.append(dismiss);
    item.append(text, buttons);
    return item;
  }));
  if (pending.length && currentTab !== "combat") $("tab-combat").classList.add("has-news");
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
  await setInitiative(myIndex(), total, $("dice-status"));
});
$("combat-init").onsubmit = event => {
  event.preventDefault();
  setInitiative(myIndex(), $("init-value").value, $("init-status"));
  $("init-value").value = "";
};
async function stepTurn(direction) {
  const { turn, round } = nextTurn(liveOrder(), state.combat.turn, state.combat.round, direction);
  for (const id of ["combat-advance", "combat-prev"]) $(id).disabled = true;
  try {
    await publishCombat({ turn, round });
    $("combat-status").textContent = "";
  } catch (error) {
    $("combat-status").textContent = error.message;
  } finally {
    for (const id of ["combat-advance", "combat-prev"]) $(id).disabled = false;
  }
}
$("combat-advance").onclick = () => stepTurn(1);
$("combat-prev").onclick = () => stepTurn(-1);
$("enc-combat").onclick = async () => {
  if (state?.combatUnavailable) {
    $("enc-combat-status").textContent = "Combat needs a one-time database update: run supabase/migrations/0004_dnd_combat.sql in the Supabase SQL editor.";
    return;
  }
  $("enc-combat").disabled = true;
  try {
    if (state.combat) {
      if (!window.confirm("End combat for everyone? Your encounter stays here.")) return;
      await backend.combatEnd(room);
      state.combat = null;
      $("enc-combat-status").textContent = "Combat ended.";
      drawCombat();
    } else {
      // Enemies who haven't rolled get initiative now.
      enemies = enemies.map(enemy => enemy.initiative === null
        ? { ...enemy, initiative: roll("d20" + (enemy.init >= 0 ? "+" : "") + enemy.init).total } : enemy);
      storage.set(encounterKey(), JSON.stringify(enemies));
      storage.set("dnd-combat-start:" + room, String(Math.max(0, ...(state.actions ?? []).map(action => Number(action.id) || 0))));
      await publishCombat({ round: 1, turn: null, reset: true });
      drawEncounter();
      showTab("combat");
    }
    sync();
  } catch (error) {
    $("enc-combat-status").textContent = error.message;
  } finally {
    $("enc-combat").disabled = false;
  }
};

// ── Encounter tracker (DM only, kept on this device) ──
const TEMPLATE_KEY = "dnd-enemy-templates";
const encounterKey = () => "dnd-encounter:" + room;
const readJson = (key, fallback) => { try { return JSON.parse(storage.get(key) ?? "null") ?? fallback; } catch { return fallback; } };
let enemies = [];
let encounterLoaded = false;
const savedTemplates = () => readJson(TEMPLATE_KEY, []);
function saveEncounter() {
  storage.set(encounterKey(), JSON.stringify(enemies));
  if (isHost && state?.combat) schedulePublish();
}

function drawTemplateOptions() {
  const custom = savedTemplates();
  $("enemy-template").replaceChildren(
    new Option("Blank", ""),
    ...custom.map((template, index) => new Option("★ " + template.name + " (yours)", "custom:" + index)),
    ...enemyTemplates.map((template, index) => new Option(template.name + " · AC " + template.ac + " · HP " + template.hp, "srd:" + index))
  );
}
function fillEnemyForm(template) {
  const attacks = template?.attacks ?? [];
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
}
function enemyFormStats() {
  return {
    name: $("enemy-name").value.trim() || "Enemy",
    ac: Number($("enemy-ac").value) || 10,
    hp: $("enemy-hp").value.trim() || "1",
    init: Number($("enemy-init").value) || 0,
    speed: Number($("enemy-speed").value) || 30,
    attacks: [1, 2].map(n => [$("atk" + n + "-name").value.trim(), Number($("atk" + n + "-hit").value) || 0, $("atk" + n + "-dmg").value.trim()]).filter(([name]) => name),
    abilities: $("enemy-abilities").value.trim()
  };
}
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
  const added = createEnemies(stats, $("enemy-count").value);
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
  enemies = rollInitiative(enemies);
  saveEncounter();
  drawEncounter();
};
$("enc-clear").onclick = () => {
  if (!window.confirm("Remove every enemy from this encounter?")) return;
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
      return new Option(name.replace(/^The /, "") + (ac ? " · AC " + ac : ""), String(index));
    }));
    target.value = enemyTargets.get(enemy.id) ?? "";
    target.onchange = () => enemyTargets.set(enemy.id, target.value);
    attacks.append(target);
  }
  for (const [label, hit, damage] of enemy.attacks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = label + " " + (hit >= 0 ? "+" : "") + hit + (damage ? " · " + damage : "");
    button.onclick = () => {
      const toHit = roll("d20" + (hit >= 0 ? "+" : "") + hit);
      const harm = damage ? roll(damage) : null;
      const critDamage = harm && toHit.critical ? roll(damage.replace(/(\d*)d(\d+)/g, (_, count, sides) => (Number(count || 1) * 2) + "d" + sides)) : null;
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
          : outcome === "hit" ? "HIT " + who + " (AC " + ac + ")"
          : outcome === "miss" ? "MISS " + who + (ac ? " (AC " + ac + ")" : "")
          : who + "'s AC isn't set — the DM decides.";
        parts.push(verdict);
        if (shown && (outcome === "hit" || outcome === "crit" || outcome === "unknown")) {
          const row = document.createElement("div");
          row.className = "apply-row";
          const status = document.createElement("span");
          status.className = "fineprint";
          const apply = amount => {
            for (const button of row.querySelectorAll("button")) button.disabled = true;
            status.textContent = "Applied " + amount + " to " + who + ".";
            adjustHp(index, -amount, status);
          };
          const full = document.createElement("button");
          full.type = "button";
          full.className = "danger-soft";
          full.textContent = "Apply " + shown.total + " to " + who;
          full.onclick = () => apply(shown.total);
          const half = document.createElement("button");
          half.type = "button";
          half.className = "quiet";
          half.textContent = "Half (" + Math.floor(shown.total / 2) + ")";
          half.title = "Resistance";
          half.onclick = () => apply(Math.floor(shown.total / 2));
          row.append(full, half, status);
          parts.push(row);
        }
      }
      result.replaceChildren(...parts);
      result.hidden = false;
    };
    attacks.append(button);
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
  if (enemy.abilities) {
    const more = document.createElement("details");
    more.className = "fold";
    const summary = document.createElement("summary");
    summary.textContent = "Abilities and notes";
    const text = document.createElement("p");
    text.textContent = enemy.abilities;
    more.append(summary, text);
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
  }
  const total = enemies.length;
  const up = standing(enemies);
  $("encounter-count").textContent = total ? up + " of " + total + " standing" : "No enemies yet";
  $("encounter-controls").hidden = !total;
  $("enemy-builder").open = !total || $("enemy-builder").open;
  $("enemy-list").replaceChildren(...enemies.map(enemyCard));
  drawCombat();
}

function setHost(value) {
  isHost = value;
  $("table").classList.toggle("player-room", !isHost);
  for (const id of ["host", "party-editor", "close-wrap"]) $(id).hidden = !isHost;
  if (state) renderStory();
  $("history-editor").hidden = !isHost || !backend.saveHistory;
  $("tab-dm").hidden = !isHost;
  $("encounter").hidden = !isHost;
  if (isHost) drawEncounter();
  drawCombat();
  if (!isHost && currentTab === "dm") showTab("scene");
  if (isHost && storage.get(TAB_KEY) === "dm" && currentTab !== "dm") showTab("dm");
  if (!isHost) stopMic();
}

let poll;
// Tables this browser joined, so a player who lands on the home page can get
// back to the DM's table instead of starting their own.
const RECENT_KEY = "dnd-recent-tables";
const tableAge = 8 * 60 * 60 * 1000;
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

function enterRoom() {
  $("tabbar").hidden = false;
  $("copy").hidden = false;
  $("dice-fab").hidden = false;
  document.body.classList.add("in-table");
  showTab(storage.get(TAB_KEY) ?? "scene");
  $("table-code").textContent = " · " + tableLabel(room).toUpperCase() + (isPractice() ? " · PRACTICE" : "");
  $("lobby").hidden = true;
  $("table").hidden = false;
  setHost(false);
  sync();
  poll ??= setInterval(sync, 1500);
}

// ── Lobby and sign-in (hosted mode uses the UFC app's email-code login) ──
let pendingEmail = "";
let myRoomCount = 0;
function tableLink(code, text) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = "?room=" + code;
  link.textContent = text;
  item.append(link);
  return item;
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
  $("lobby-status").textContent = message;
  const user = backend.user();
  $("signin").hidden = !backend.hosted || Boolean(user);
  $("account").hidden = backend.hosted && !user;
  $("account-cards").hidden = $("account").hidden;
  $("tabbar").hidden = true;
  $("copy").hidden = true;
  $("dice-fab").hidden = true;
  document.body.classList.remove("in-table");
  $("account-line").hidden = !backend.hosted;
  $("join").hidden = !room;
  const recent = recentTables();
  $("recent-rooms").hidden = !recent.length;
  $("recent-room-list").replaceChildren(...recent.map(({ code, at }) => tableLink(code, tableLabel(code) + " · joined " + new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))));
  if (!user) return;
  $("account-email").textContent = user.email;
  try {
    const rooms = await backend.myRooms();
    myRoomCount = rooms.length;
    $("my-rooms").hidden = !rooms.length;
    $("my-room-list").replaceChildren(...rooms.map(({ code, created }) =>
      tableLink(code, tableLabel(code) + " · started " + new Date(created).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))));
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
  sync();
  if (resumeOnReturn && !ended) {
    resumeOnReturn = false;
    startMic();
  }
});
window.addEventListener("pageshow", sync);

if (room && (!backend.hosted || backend.user())) enterRoom();
else showLobby(room ? "Sign in to join the table." : "");
