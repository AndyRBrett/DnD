// Where rooms live. Two interchangeable backends with the same methods:
//  - local: the Node server in this repo (scripts/local.mjs), no login, the
//    host is whoever holds the room's host key in this browser.
//  - hosted: Supabase (the UFC app's project), email-code login like the UFC
//    app, the host is the account that started the room.
// config.js decides: the local server serves SUPABASE = null.
import { SUPABASE } from "./config.js";

export const storage = {
  get(key) { try { return localStorage.getItem(key) ?? sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {} }
};

const failure = (message, status) => Object.assign(new Error(message || "Something went wrong. Try again."), { status });

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

function localBackend() {
  const hostKey = code => storage.get("host:" + code);
  async function call(path, options = {}) {
    const response = await fetch("/api/rooms" + path, { cache: "no-store", ...options });
    const data = await readJson(response);
    if (!response.ok) throw failure(data?.error, response.status);
    return data;
  }
  const post = (code, path, payload, host = true) => call("/" + code + "/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(host ? { "x-table-host": hostKey(code) ?? "" } : {}) },
    body: JSON.stringify(payload)
  });
  return {
    hosted: false,
    user: () => null,
    async createRoom() {
      const { code, host } = await call("", { method: "POST", headers: { "x-table-action": "create" } });
      storage.set("host:" + code, host);
      return code;
    },
    async room(code) {
      const state = await call("/" + code);
      return { ...state, isHost: Boolean(hostKey(code)) };
    },
    myRooms: async () => [],
    postScene: (code, text, id) => post(code, "scene", { text, id }),
    saveParty: (code, party) => post(code, "party", { party }),
    async closeRoom(code) {
      await post(code, "close", {});
      storage.remove("host:" + code);
    },
    advise: (code, character, question = "", spent = [], table = "") => post(code, "advise", { character, question, spent, table }, false),
    setResources: (code, character, state) => post(code, "resources", { character, state }, false),
    deleteScene: (code, id) => post(code, "scene", { id, delete: true }),
    setHp: (code, character, { hp, max, temp, ac }) => post(code, "hp", { character, hp, max, temp, ac }, false),
    adjustHp: (code, character, change) => post(code, "hp-adjust", { character, change }, false),
    combatSet: (code, combat) => post(code, "combat", combat),
    combatEnd: code => post(code, "combat", { end: true }),
    combatPassTurn: (code, character) => post(code, "pass-turn", { character }, false),
    combatInitiative: (code, character, value) => post(code, "initiative", { character, value }, false)
  };
}

function hostedBackend({ url, anonKey }) {
  // Kept apart from the UFC app's session (same origin on GitHub Pages) so
  // refreshing one never signs the other out.
  const SESSION_KEY = "dnd_sb_session";
  let session = null;
  try { session = JSON.parse(storage.get(SESSION_KEY) ?? "null"); } catch {}
  let refreshing;
  let roomVersion = 5;

  function save(raw) {
    session = raw ? {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + Number(raw.expires_in ?? 3600),
      email: raw.user?.email ?? session?.email ?? ""
    } : null;
    if (session) storage.set(SESSION_KEY, JSON.stringify(session));
    else storage.remove(SESSION_KEY);
  }

  async function auth(path, body) {
    const response = await fetch(url + "/auth/v1/" + path, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await readJson(response);
    if (!response.ok) throw failure(data?.msg || data?.error_description || data?.message, response.status);
    return data;
  }

  async function token() {
    if (!session) throw failure("Sign in to continue.", 401);
    if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
    refreshing ??= auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then(save)
      .catch(error => {
        if (error.status >= 400 && error.status < 500) save(null);
        throw failure(error.status < 500 ? "Your sign-in expired. Sign in again." : "Couldn't reach the server. Try again.", error.status < 500 ? 401 : 503);
      })
      .finally(() => { refreshing = undefined; });
    await refreshing;
    return session.access_token;
  }

  async function rpc(name, args = {}) {
    const response = await fetch(url + "/rest/v1/rpc/" + name, {
      method: "POST",
      cache: "no-store",
      headers: { apikey: anonKey, Authorization: "Bearer " + await token(), "content-type": "application/json" },
      body: JSON.stringify(args)
    });
    const data = await readJson(response);
    if (!response.ok) {
      if (response.status === 401) save(null);
      throw failure(response.status === 401 ? "Sign in to continue." : data?.message, response.status);
    }
    return data;
  }

  return {
    hosted: true,
    user: () => session && { email: session.email },
    sendCode: email => auth("otp", { email, create_user: true }),
    async verifyCode(email, code) {
      save({ ...await auth("verify", { type: "email", email, token: code }) });
    },
    async signOut() {
      const access = session?.access_token;
      save(null);
      if (access) fetch(url + "/auth/v1/logout", { method: "POST", headers: { apikey: anonKey, Authorization: "Bearer " + access } }).catch(() => {});
    },
    createRoom: (party, recap) => rpc("dnd_create_room", { p_party: party, p_recap: recap }),
    // dnd_room_v3 adds combat (supabase/migrations/0004). Until that migration
    // runs, fall back to dnd_room_v2 and combat stays unavailable.
    // Newest room function first: v5 adds party resources (0007), v4 party HP (0006), v3
    // combat (0004). Until a migration runs, fall back to the one before.
    async room(code) {
      while (roomVersion > 2) {
        try {
          const data = await rpc("dnd_room_v" + roomVersion, { p_code: code });
          return { ...data, hpUnavailable: roomVersion < 4 };
        } catch (error) {
          if (error.status !== 404 && !/could not find the function/i.test(error.message)) throw error;
          roomVersion -= 1;
        }
      }
      return { ...await rpc("dnd_room_v2", { p_code: code }), combatUnavailable: true, hpUnavailable: true };
    },
    setHp: (code, character, { hp, max, temp, ac }) => rpc("dnd_hp_set", { p_code: code, p_character: character, p_hp: hp, p_max: max, p_temp: temp ?? 0, p_ac: ac ?? null }),
    adjustHp: (code, character, change) => rpc("dnd_hp_adjust", { p_code: code, p_character: character, p_change: change }),
    setResources: (code, character, state) => rpc("dnd_resources_set", { p_code: code, p_character: character, p_state: state }),
    encounterGet: code => rpc("dnd_encounter_get", { p_code: code }),
    encounterSave: (code, enemies) => rpc("dnd_encounter_save", { p_code: code, p_enemies: enemies }),
    combatSet: (code, { round, turn, enemies, reset }) => rpc("dnd_combat_set", { p_code: code, p_round: round, p_turn: turn ?? null, p_enemies: enemies, p_reset: Boolean(reset) }),
    combatEnd: code => rpc("dnd_combat_end", { p_code: code }),
    deleteScene: (code, id) => rpc("dnd_delete_scene", { p_code: code, p_id: id }),
    editAction: (code, id, text) => rpc("dnd_edit_action", { p_code: code, p_id: id, p_text: text }),
    deleteAction: (code, id) => rpc("dnd_delete_action", { p_code: code, p_id: id }),
    combatInitiative: (code, character, value) => rpc("dnd_combat_initiative", { p_code: code, p_character: character, p_value: value }),
    combatPassTurn: (code, character) => rpc("dnd_combat_pass_turn", { p_code: code, p_character: character }),
    // Who can start tables (migration 0010). Before it runs, everyone can.
    async canStartTables() {
      try {
        return await rpc("dnd_is_host");
      } catch (error) {
        if (error.status === 404 || /could not find the function/i.test(error.message)) return true;
        throw error;
      }
    },
    hostList: () => rpc("dnd_host_list"),
    addHost: email => rpc("dnd_add_host", { p_email: email }),
    removeHost: email => rpc("dnd_remove_host", { p_email: email }),
    postAction: (code, character, text) => rpc("dnd_post_action", { p_code: code, p_character: character, p_text: text }),
    myRooms: () => rpc("dnd_my_rooms"),
    postScene: (code, text, id) => rpc("dnd_post_scene", { p_code: code, p_text: text, p_id: id ?? null }),
    saveParty: (code, party) => rpc("dnd_save_party", { p_code: code, p_party: party }),
    closeRoom: code => rpc("dnd_end_table_v2", { p_code: code, p_save_history: false }),
    endTable: (code, saveHistory) => rpc("dnd_end_table_v2", { p_code: code, p_save_history: saveHistory }),
    history: code => rpc("dnd_history", { p_code: code }),
    saveHistory: (code, text) => rpc("dnd_save_history", { p_code: code, p_history: text }),
    async advise(code, character, question = "", spent = [], table = "") {
      const response = await fetch(url + "/functions/v1/dnd-advise", {
        method: "POST",
        headers: { apikey: anonKey, Authorization: "Bearer " + await token(), "content-type": "application/json" },
        body: JSON.stringify({ code, character, question, spent, table })
      });
      const data = await readJson(response);
      if (!response.ok) throw failure(data?.error ?? data?.message, response.status);
      return data;
    }
  };
}

export const backend = SUPABASE ? hostedBackend(SUPABASE) : localBackend();
