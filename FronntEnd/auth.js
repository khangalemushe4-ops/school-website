// Tiny auth helper shared by all pages.
const API = ''; // same-origin
const TOKEN_KEY = 'ac360_token';
const USER_KEY = 'ac360_user';

const Auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  logout() {
    this.clear();
    location.href = 'home.html';
  },
  isLoggedIn() { return !!this.token; },
  isAdmin() { return this.user?.is_admin === true; },
};

// Fetch wrapper that adds the auth token and parses JSON errors.
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (Auth.token) headers['Authorization'] = 'Bearer ' + Auth.token;
  const res = await fetch(API + path, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// Inject the shared slideshow background into every page.
function injectSlideshow() {
  if (document.querySelector('.bg-slideshow')) return;
  const wrap = document.createElement('div');
  wrap.className = 'bg-slideshow';
  wrap.innerHTML = `
    <div class="bg-slide s1"></div>
    <div class="bg-slide s2"></div>
    <div class="bg-slide s3"></div>
    <div class="bg-slide s4"></div>
    <div class="bg-overlay"></div>`;
  document.body.prepend(wrap);
}

// Renders the top nav into <nav id="main-nav"></nav>.
function renderNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  const user = Auth.user;
  const current = (location.pathname.split('/').pop() || 'home.html').toLowerCase();

  const mkLink = (href, label) => {
    const active = current === href.toLowerCase() ? ' class="active"' : '';
    return `<a href="${href}"${active}>${label}</a>`;
  };

  const links = [
    mkLink('home.html', 'Home'),
    mkLink('services.html', 'Services'),
    mkLink('bookings.html', 'Bookings'),
    mkLink('contact.html', 'Contact'),
  ].join('');

  const adminLink = Auth.isAdmin() ? mkLink('admin.html', 'Admin') : '';
  const right = user
    ? `<span class="nav-user">Hi, ${user.name?.split(' ')[0] || 'there'}</span>
       ${adminLink}
       <a href="#" class="nav-logout" onclick="Auth.logout();return false;">Logout</a>`
    : `<a href="login.html" class="nav-login">Login</a>`;

  nav.innerHTML = `
    <div class="nav-brand"><a href="home.html">AutoClean360</a></div>
    <div class="nav-links">${links}</div>
    <div class="nav-actions">${right}</div>`;
}

// Guard: redirect to login if not authenticated.
function requireAuth() {
  if (!Auth.isLoggedIn()) location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
}
function requireAdmin() {
  if (!Auth.isAdmin()) location.href = 'home.html';
}

document.addEventListener('DOMContentLoaded', () => {
  injectSlideshow();
  renderNav();
});