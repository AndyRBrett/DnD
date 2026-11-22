import { recommend, coachingPrompt, characterAbilities } from "./scene-options.js";
// A practice table is marked by its opening update (no database change), and
// the device that started it also remembers it, in case 30+ updates push the
// opening line out of view.
const PRACTICE_MARK = "PRACTICE TABLE";
import { backend, storage } from "./backend.js";
import { organizeSheet, basics } from "./rules.js";
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
  const rolls = sheets[character.name]?.rolls ?? [];
  $("quick-rolls").hidden = !rolls.length;
  $("quick-roll-chips").replaceChildren(...rolls.map(([label, value]) => {
    const tile = document.createElement("div");
    tile.className = "stat" + (value.endsWith("*") ? " is-unconfirmed" : "");
    const number = document.createElement("strong");
    number.textContent = value.replace(/\*$/, "");
    const name = document.createElement("span");
    name.textContent = label;
    tile.append(number, name);
    return tile;
  }));
  updateChips();
  $("action-label").textContent = "What is " + character.name + " doing?";
  const recent = state.scenes;
  const advice = recommend(character, recent);
  const latest = recent.at(-1);
  $("situation").textContent = advice.situation + (latest ? " · Updated " +
    new Date(latest.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
  const line = latest?.text ?? "";
  $("responding-to").textContent = line ? "Responding to: “" + (line.length > 140 ? line.slice(0, 140) + "…" : line) + "”" : "";
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
    if (hostChanged) setHost(fresh.isHost);
    if (!previous) rememberTable(room);
    if (rosterChanged || hostChanged) drawRoster();
    if (scenesChanged) {
      if (previous && previous.scenes.at(-1)?.id !== state.scenes.at(-1)?.id) flashScene();
      $("scene").textContent = state.scenes.at(-1)?.text || "Waiting for an update.";
      drawStory();
    }
    $("action-form").hidden = !backend.postAction || !Array.isArray(state.actions) || ended;
    if ($("party-actions").hidden === (isHost && Boolean(backend.postAction) && Array.isArray(state.actions))) drawPartyActions();
    if (rosterChanged || scenesChanged) showOptions();
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
  if (!latest || writing) return;
  if (!editId) savedDraft = $("draft").value;
  editId = latest.id;
  setDraft(latest.text);
  clearPublishTimers();
  $("publish").textContent = "Save correction";
  $("cancel").hidden = false;
  $("manual-controls").open = true;
  $("draft").focus();
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
function drawStory() {
  const latest = state.scenes.at(-1);
  const actions = state.actions ?? [];
  const since = actions.filter(action => !latest || action.created >= latest.created);
  list("since-actions", [...since].reverse().map(action => action.name + ": " + action.text));
  $("since-wrap").hidden = !since.length;
  const earlier = [
    ...state.scenes.slice(0, -1).map(scene => ({ at: scene.created, text: scene.text })),
    ...actions.filter(action => latest && action.created < latest.created)
      .map(action => ({ at: action.created, text: action.name + ": " + action.text, action: true }))
  ].sort((a, b) => b.at - a.at);
  $("history").replaceChildren(...earlier.map(entry => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (entry.action) item.className = "player-action";
    return item;
  }));
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

function setHost(value) {
  isHost = value;
  $("table").classList.toggle("player-room", !isHost);
  for (const id of ["host", "party-editor", "close-wrap", "edit"]) $(id).hidden = !isHost;
  $("history-editor").hidden = !isHost || !backend.saveHistory;
  $("tab-dm").hidden = !isHost;
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
