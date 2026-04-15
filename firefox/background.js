// background.js — capture orgId from real API traffic and share with content scripts
// Cross-browser shim: Firefox exposes `browser` (Promise-based); Chrome exposes `chrome`.
// Firefox exposes `browser` (Promise-based); Chromium exposes `chrome`.
// The shim below provides a consistent API surface for both.

const _chrome = (typeof browser !== 'undefined') ? browser : chrome;

const TAB_ORG = new Map();   // tabId -> orgId string
let LAST_ORG = null;         // fallback if no per-tab yet

const TAB_API = new Map();   // tabId -> api origin
let LAST_API = null;        // fallback

const ORG_RE = /\/api\/v2\/orgs\/(\d+)\b/;

function updateApiForTab(tabId, url) {
  if (tabId == null || tabId < 0 || !url) return;

  try {
    const u = new URL(url);

    // Only learn from real Illumio API traffic
    if (!u.pathname.startsWith('/api/v2/')) return;

    const origin = u.origin;
    const prev = TAB_API.get(tabId);

    if (prev !== origin) {
      TAB_API.set(tabId, origin);
      LAST_API = origin;
      console.info('[RR] Discovered backend API:', origin);
    }
  } catch (_) {}
}

function updateOrgForTab(tabId, orgId) {
  if (tabId == null || tabId < 0 || !orgId) return;
  const s = String(orgId);
  const prev = TAB_ORG.get(tabId);
  if (prev !== s) {
    TAB_ORG.set(tabId, s);
    LAST_ORG = s;
    // Optionally broadcast to the tab (not required for the minimal flow)
    // chrome.tabs.sendMessage(tabId, { type: 'ORG_UPDATED', orgId: s }).catch(()=>{});
  }
}

// Observe outgoing requests (before request is made)
_chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
    updateApiForTab(details.tabId, details.url);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Also parse response URLs (sometimes redirects / final URL is more reliable)
_chrome.webRequest.onCompleted.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
    updateApiForTab(details.tabId, details.url);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Clean up if a tab closes
_chrome.tabs.onRemoved.addListener((tabId) => {
  TAB_ORG.delete(tabId);
  TAB_API.delete(tabId);
});

// Answer content-script requests
_chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'GET_ORG_ID') {
    const tabId = sender?.tab?.id;
    sendResponse({
      orgId: (tabId != null ? TAB_ORG.get(tabId) : null) || LAST_ORG || null
    });
    return true;
  }

  if (msg.type === 'GET_API_BASE') {
    const tabId = sender?.tab?.id;
    sendResponse({
      apiBase: (tabId != null ? TAB_API.get(tabId) : null) || LAST_API || null
    });
    return true;
  }
});
