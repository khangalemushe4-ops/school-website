// Tiny auth helper shared by all pages.
const API = ''; // same-origin; empty string means "current host"
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

// Renders the top nav into <nav id="main-nav"></nav>.
function renderNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  const user = Auth.user;
  const guestLinks = `
    <a href="home.html">Home</a>
    <a href="services.html">Services</a>
    <a href="contact.html">Contact</a>`;
  const userLinks = `
    <a href="home.html">Home</a>
    <a href="bookings.html">Bookings</a>
    <a href="vehicles.html">Vehicles</a>
    <a href="contact.html">Contact</a>`;
  const adminLink = Auth.isAdmin() ? `<a href="admin.html">Admin</a>` : '';
  const right = user
    ? `<span class="nav-user">Hi, ${user.name?.split(' ')[0] || 'there'}</span>
       ${adminLink}
       <a href="#" onclick="Auth.logout();return false;">Logout</a>`
    : `<a href="login.html">Login</a>
       <a href="signup.html" class="nav-cta">Sign up</a>`;
  nav.innerHTML = `
    <div class="nav-links">${user ? userLinks : guestLinks}</div>
    <div class="nav-actions">${right}</div>`;
}

// Guard: redirect to login if not authenticated.
function requireAuth() {
  if (!Auth.isLoggedIn()) location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
}
function requireAdmin() {
  if (!Auth.isAdmin()) location.href = 'home.html';
}

document.addEventListener('DOMContentLoaded', renderNav);