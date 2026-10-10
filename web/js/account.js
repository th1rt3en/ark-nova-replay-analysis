// The account widget: "Log in / Sign up" or the player's name and rating, on every page that includes this module (docs/accounts_plan.md).
// It asks GET /api/auth/me and shows nothing when the accounts are not switched on (404).
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

async function call(path, body) {
  const res = await fetch('/api/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status, code: data.status });
  return data;
}

const bar = el('div', { id: 'acctbar' });
const dlg = el('dialog', { id: 'acctdlg', className: 'acctdlg' });
let account = null;

function renderBar() {
  bar.replaceChildren();
  if (account) {
    const me = el('a', { className: 'acctname', href: '/profile.html?id=' + encodeURIComponent(account.id), title: 'Your profile' }, account.username);
    bar.append(me, el('span', { className: 'muted small' }, ` rating ${account.rating}`));
    const out = el('button', { type: 'button', className: 'linkbtn' }, 'Log out');
    out.onclick = async () => { await call('logout', {}).catch(() => {}); account = null; window.arkAccount = null; renderBar(); document.dispatchEvent(new CustomEvent('account-changed', { detail: null })); };
    bar.append(out);
  } else {
    const b = el('button', { type: 'button' }, 'Log in / Sign up');
    b.onclick = () => open('login');
    bar.append(b);
  }
}

function field(label, props) {
  const input = el('input', { className: 'acctinput', ...props });
  return { input, row: el('label', { className: 'acctfield' }, label, input) };
}

function open(view) {
  show(view);
  if (!dlg.open) dlg.showModal();
}

function frame(title, ...parts) {
  const msg = el('p', { className: 'acctmsg', role: 'alert', hidden: true });
  const close = el('button', { type: 'button', className: 'linkbtn', title: 'Close' }, 'Close');
  close.onclick = () => dlg.close();
  dlg.replaceChildren(el('div', { className: 'accthead' }, el('h2', {}, title), close), ...parts, msg);
  return (text) => { msg.textContent = text; msg.hidden = !text; };
}

async function run(button, say, fn) {
  button.disabled = true; say('');
  try { await fn(); } catch (e) { say(e.message); } finally { button.disabled = false; }
}

function done() {
  window.arkAccount = account;
  renderBar();
  document.dispatchEvent(new CustomEvent('account-changed', { detail: account }));
}

function show(view) {
  if (view === 'login') return showLogin();
  if (view === 'signup') return showSignup();
  if (view === 'recover') return showRecover();
}

function links(...pairs) {
  return el('p', { className: 'small acctlinks' }, ...pairs.flatMap(([text, v], i) => {
    const a = el('button', { type: 'button', className: 'linkbtn' }, text);
    a.onclick = () => show(v);
    return i ? [' · ', a] : [a];
  }));
}

function showLogin() {
  const u = field('Username', { autocomplete: 'username', required: true }), p = field('Password', { type: 'password', autocomplete: 'current-password', required: true });
  const go = el('button', { type: 'submit' }, 'Log in');
  const form = el('form', { className: 'acctform' }, u.row, p.row, go);
  const say = frame('Log in', form, links(['Create an account', 'signup'], ['Forgot your password?', 'recover']));
  form.onsubmit = (e) => { e.preventDefault(); run(go, say, async () => { account = (await call('login', { username: u.input.value, password: p.input.value })).account; dlg.close(); done(); }); };
  u.input.focus();
}

function showSignup() {
  const u = field('Username', { autocomplete: 'username', required: true, maxLength: 40 });
  const go = el('button', { type: 'submit' }, 'Continue');
  const form = el('form', { className: 'acctform' }, u.row, go);
  const say = frame('Create an account', el('p', { className: 'muted small' }, 'A username and a password. No email. If you play on Board Game Arena under the same username, your starting Elo can be copied from there.'), form, links(['I already have an account', 'login']));
  form.onsubmit = (e) => { e.preventDefault(); run(go, say, async () => { const c = await call('check', { username: u.input.value }); if (!c.available) throw new Error('That username is taken.'); await showChoice(c); }); };
  u.input.focus();
}

// The Turnstile check of the signup (only when the server has a site key): the script is loaded when the form needs it.
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = ok; s.onerror = fail; document.head.append(s);
  });
}

async function showChoice(c) {
  const cfg = await call('config').catch(() => ({ turnstile_site_key: '' }));
  let tsToken = null;
  const box = el('div', { className: 'acctchoice' });
  let pick;                                              // undefined until the player chooses: nothing is pre-selected, the seed is a one-time choice
  const radio = (value, label, disabled) => {
    const r = el('input', { type: 'radio', name: 'bga', value, disabled, checked: false });
    r.onchange = () => { pick = value === '' ? null : value; };
    return el('label', { className: 'acctopt' + (disabled ? ' off' : '') }, r, label);
  };
  if (c.matches.length) {
    box.append(el('p', {}, c.matches.length === 1 ? 'A BGA player uses this username:' : `${c.matches.length} BGA players have used this username. Pick yours:`));
    for (const m of c.matches) {
      box.append(radio(m.bga_player_id, `BGA player ${m.bga_player_id} · Elo ${m.elo} · ${m.games} games · last game ${(m.last_game_at || '').slice(0, 10) || 'unknown'}${m.available ? '' : ' (already has an account)'}`, !m.available));
    }
    box.append(radio('', "None of these, I'm a new player (you start at 0)", false));
    box.append(el('p', { className: 'acctwarn' }, 'The BGA player id you choose will be used to set your starting Elo. This is done once and cannot be changed afterwards.'));
  } else {
    box.append(el('p', { className: 'muted' }, 'No BGA player uses this username, so you start as a new player with a rating of 0.'));
  }
  const p1 = field('Password (at least 10 characters)', { type: 'password', autocomplete: 'new-password', required: true, minLength: 10 });
  const p2 = field('Repeat the password', { type: 'password', autocomplete: 'new-password', required: true });
  const go = el('button', { type: 'submit' }, 'Create the account');
  const terms = el('p', { className: 'muted small' }, 'By creating an account you accept the ', el('a', { href: '/terms.html', target: '_blank', rel: 'noopener' }, 'terms and privacy notes'), '.');
  const ts = el('div', { className: 'acctts' });
  const form = el('form', { className: 'acctform' }, box, p1.row, p2.row, ts, terms, go);
  const say = frame(`Create an account: ${c.username}`, form, links(['Back', 'signup']));
  if (cfg.turnstile_site_key) loadTurnstile().then(() => window.turnstile.render(ts, { sitekey: cfg.turnstile_site_key, callback: (t) => { tsToken = t; }, 'expired-callback': () => { tsToken = null; } })).catch(() => say('The check that you are not a robot could not be loaded.'));
  form.onsubmit = (e) => {
    e.preventDefault();
    if (c.matches.length && pick === undefined) return say('Choose which BGA player you are, or "None of these".');
    if (p1.input.value !== p2.input.value) return say('The two passwords differ.');
    if (cfg.turnstile_site_key && !tsToken) return say('Please complete the check that you are not a robot.');
    run(go, say, async () => {
      const r = await call('register', { username: c.username, password: p1.input.value, bga_player_id: pick ?? null, turnstile_token: tsToken });
      account = r.account; done(); showRecoveryCode(r.recovery_code, 'Your account is ready');
    });
  };
}

function showRecoveryCode(code, title) {
  const copy = el('button', { type: 'button' }, 'Copy');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied'; } catch (e) { copy.textContent = 'Select the code and copy it'; } };
  const ok = el('button', { type: 'button' }, 'I have saved it');
  ok.onclick = () => dlg.close();
  frame(title, el('p', {}, 'This is your recovery code. It is the only way to get back in if you forget your password, and it is shown only once. Keep it somewhere safe.'),
    el('p', { className: 'acctcode' }, code), el('div', { className: 'acctform' }, copy, ok));
}

function showRecover() {
  const u = field('Username', { required: true }), c = field('Recovery code', { required: true, placeholder: 'xxxx-xxxx-xxxx-xxxx-xxxx', autocomplete: 'off' });
  const p = field('New password (at least 10 characters)', { type: 'password', autocomplete: 'new-password', required: true, minLength: 10 });
  const go = el('button', { type: 'submit' }, 'Set the new password');
  const form = el('form', { className: 'acctform' }, u.row, c.row, p.row, go);
  const say = frame('Recover your account', form, links(['Back to log in', 'login']));
  form.onsubmit = (e) => { e.preventDefault(); run(go, say, async () => { const r = await call('recover', { username: u.input.value, recovery_code: c.input.value, password: p.input.value }); account = r.account; done(); showRecoveryCode(r.recovery_code, 'Password changed: here is your new recovery code'); }); };
}

async function init() {
  try {
    const me = await call('me');
    account = me.account;
  } catch (e) { return; }                                // the accounts are off on this server: no widget
  window.arkAccountsEnabled = true; window.arkAccount = account;
  document.body.append(bar, dlg);
  renderBar();
  document.dispatchEvent(new CustomEvent('account-changed', { detail: account }));
}
init();
