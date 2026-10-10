// Shared by the mini game pages (docs/accounts_plan.md): the anonymous id and the API calls. A game page imports this and nothing from another game.
const ANON_KEY = 'minigameAnonId';

export function anonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Date.now())).replace(/[^A-Za-z0-9_-]/g, '');
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch (e) { return 'session' + Math.random().toString(36).slice(2, 12); }          // no storage: a new id for this page view
}

export async function api(path, body) {
  const res = await fetch('/api/minigames' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Anon-Id': anonId(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status, code: data.status });
  return data;
}
