import { recommend, coachingPrompt, characterAbilities } from "/scene-options.js";

const $ = id => document.getElementById(id);
const room = new URLSearchParams(location.search).get("room");
// The host key lives in localStorage so the DM can close the tab or reopen the
// browser on the host laptop and keep control of the room.
const storage = {
  get(key) { try { return localStorage.getItem(key) ?? sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {} }
};
const hostKey = room ? storage.get("host:" + room) : null;
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


async function call(path, options) {
  const result = await fetch("/api/rooms" + path, { cache: "no-store", ...options });
  const data = await result.json();
  if (!result.ok) throw Object.assign(new Error(data.error), { status: result.status });
  return data;
}

function update(path, payload) {
  return call("/" + room + "/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-table-host": hostKey },
    body: JSON.stringify(payload)
  });
}

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
  const recent = state.scenes;
  const advice = recommend(character, recent);
  const latest = recent.at(-1);
  $("situation").textContent = advice.situation + (latest ? " · Updated " +
    new Date(latest.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
  list("options", advice.options);
  $("ask-dm").textContent = advice.question;
  const abilities = characterAbilities(character);
  list("character-abilities", abilities.ready);
  list("check-abilities", abilities.check);
  $("character-check").hidden = !abilities.check.length;
  $("character-empty").hidden = abilities.ready.length > 0 || abilities.check.length > 0;
  resetClaude();
}

let claudeFor = "";
function resetClaude() {
  const key = $("character").value + ":" + (state?.scenes.at(-1)?.id ?? "");
  $("claude").hidden = !state?.ai || ended;
  if (key === claudeFor) return;
  claudeFor = "";
  $("claude-answer").hidden = true;
  $("claude-status").textContent = "";
}

async function askClaude() {
  const index = $("character").value;
  const sceneId = state?.scenes.at(-1)?.id;
  const button = $("ask-claude");
  button.disabled = true;
  $("claude-status").textContent = "Asking Claude…";
  try {
    const advice = await call("/" + room + "/advise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ character: Number(index) })
    });
    if ($("character").value !== index || state.scenes.at(-1)?.id !== sceneId) {
      $("claude-status").textContent = "The scene moved on. Ask again for the latest update.";
      return;
    }
    claudeFor = index + ":" + sceneId;
    $("claude-situation").textContent = "Claude · " + advice.situation;
    $("claude-options").replaceChildren(...advice.options.map(option => {
      const item = document.createElement("li");
      const action = document.createElement("span");
      action.textContent = option.action;
      const why = document.createElement("small");
      why.textContent = option.why;
      item.append(action, why);
      return item;
    }));
    $("claude-ask").textContent = advice.question;
    $("claude-answer").hidden = false;
    $("claude-status").textContent = "";
  } catch (error) {
    $("claude-status").textContent = error.message || "Claude could not answer. Try again.";
  } finally {
    button.disabled = false;
  }
}

function drawRoster() {
  const stored = $("character").value || storage.get("dnd-character");
  $("character").replaceChildren(...state.party.map(({name}, index) => new Option(name, index)));
  if (state.party[Number(stored)]) $("character").value = stored ?? "0";
  if (!hostKey) return;
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
  if (syncing || ended) return;
  syncing = true;
  try {
    const fresh = await call("/" + room);
    const rosterChanged = JSON.stringify(state?.party) !== JSON.stringify(fresh.party);
    const scenesChanged = JSON.stringify(state?.scenes) !== JSON.stringify(fresh.scenes);
    const previous = state;
    state = fresh;
    if (rosterChanged) drawRoster();
    if (scenesChanged) {
      if (previous && previous.scenes.at(-1)?.id !== state.scenes.at(-1)?.id) flashScene();
      $("scene").textContent = state.scenes.at(-1)?.text || "Waiting for an update.";
      list("history", state.scenes.slice(0, -1).reverse().map(scene => scene.text));
    }
    if (rosterChanged || scenesChanged) showOptions();
    $("connection").textContent = hostKey ? "HOST" : "PLAYER";
  } catch (error) {
    if (error.status === 404) {
      ended = true;
      stopMic();
      $("notice").textContent = error.message;
      $("scene").textContent = "Session ended.";
      $("history").replaceChildren();
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
    } else {
      $("connection").textContent = "RECONNECTING";
    }
  } finally {
    syncing = false;
  }
}

function flashScene() {
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

function queuePublish(delay) {
  clearTimeout(publishTimer);
  if ($("auto").checked && !editId && !ended) {
    publishTimer = setTimeout(() => publish(true), delay);
    publishDeadline ??= setTimeout(() => publish(true), 5200);
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
    await update("scene", { text, id });
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
      queuePublish(interim.length ? 3500 : 1550);
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
$("ask-claude").onclick = askClaude;
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
  const link = new URL("/?room=" + room, location.href);
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
    await update("party", { party });
    $("notice").textContent = "Character sheets updated.";
    await sync();
  } catch (error) {
    $("notice").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("close").onclick = async () => {
  if (!window.confirm("End this room and delete the session transcript and character entries?")) return;
  stopMic();
  try {
    await update("close", {});
    storage.remove("host:" + room);
    location.href = "/";
  } catch (error) {
    $("notice").textContent = error.message;
  }
};
$("create").onclick = async () => {
  $("create").disabled = true;
  try {
    const { code, host } = await call("", { method: "POST", headers: { "x-table-action": "create" } });
    storage.set("host:" + code, host);
    location.href = "/?room=" + code;
  } catch (error) {
    $("lobby-status").textContent = error.message;
    $("create").disabled = false;
  }
};
if (room) {
  $("lobby").hidden = true;
  $("table").hidden = false;
  $("table").classList.toggle("player-room", !hostKey);
  for (const id of ["host", "party-editor", "close-wrap", "edit"]) $(id).hidden = !hostKey;
  sync();
  setInterval(sync, 1500);
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
}
