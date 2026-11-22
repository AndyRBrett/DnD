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
    advise: (code, character) => post(code, "advise", { character }, false)
  };
}

function hostedBackend({ url, anonKey }) {
  // Kept apart from the UFC app's session (same origin on GitHub Pages) so
  // refreshing one never signs the other out.
  const SESSION_KEY = "dnd_sb_session";
  let session = null;
  try { session = JSON.parse(storage.get(SESSION_KEY) ?? "null"); } catch {}
  let refreshing;

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
    room: code => rpc("dnd_room_v2", { p_code: code }),
    postAction: (code, character, text) => rpc("dnd_post_action", { p_code: code, p_character: character, p_text: text }),
    myRooms: () => rpc("dnd_my_rooms"),
    postScene: (code, text, id) => rpc("dnd_post_scene", { p_code: code, p_text: text, p_id: id ?? null }),
    saveParty: (code, party) => rpc("dnd_save_party", { p_code: code, p_party: party }),
    closeRoom: code => rpc("dnd_end_table_v2", { p_code: code, p_save_history: false }),
    endTable: (code, saveHistory) => rpc("dnd_end_table_v2", { p_code: code, p_save_history: saveHistory }),
    history: code => rpc("dnd_history", { p_code: code }),
    saveHistory: (code, text) => rpc("dnd_save_history", { p_code: code, p_history: text }),
    async advise(code, character) {
      const response = await fetch(url + "/functions/v1/dnd-advise", {
        method: "POST",
        headers: { apikey: anonKey, Authorization: "Bearer " + await token(), "content-type": "application/json" },
        body: JSON.stringify({ code, character })
      });
      const data = await readJson(response);
      if (!response.ok) throw failure(data?.error ?? data?.message, response.status);
      return data;
    }
  };
}

export const backend = SUPABASE ? hostedBackend(SUPABASE) : localBackend();
