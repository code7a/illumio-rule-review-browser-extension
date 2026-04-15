// background.js — capture orgId from real API traffic and share with content scripts

const TAB_API = new Map();   // tabId -> api origin (https://host)
let LAST_API = null;        // fallback if tab unknown

const TAB_ORG = new Map();   // tabId -> orgId string
let LAST_ORG = null;         // fallback if no per-tab yet

const ORG_RE = /\/api\/v2\/orgs\/(\d+)\b/;

function updateApiForTab(tabId, url) {
  if (!tabId || tabId < 0 || !url) return;

  try {
    const u = new URL(url);
    // Only learn from real API calls
    if (!u.pathname.startsWith('/api/v2/')) return;

    const origin = u.origin;
    const prev = TAB_API.get(tabId);

    if (prev !== origin) {
      TAB_API.set(tabId, origin);
      LAST_API = origin;
    }
  } catch (_) {}
}

function updateOrgForTab(tabId, orgId) {
  if (!tabId || tabId < 0 || !orgId) return;
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
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
    updateApiForTab(details.tabId, details.url);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Also parse response URLs (sometimes redirects / final URL is more reliable)
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
    updateApiForTab(details.tabId, details.url);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Clean up if a tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  TAB_ORG.delete(tabId);
  TAB_API.delete(tabId);
});

// Answer content-script requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'GET_ORG_ID') {
    const tabId = sender?.tab?.id;
    const byTab = tabId != null ? TAB_ORG.get(tabId) : null;
    sendResponse({ orgId: byTab || LAST_ORG || null });
    return true;
  }

  if (msg.type === 'GET_API_BASE') {
    const tabId = sender?.tab?.id;
    const apiBase = tabId != null ? TAB_API.get(tabId) : null;
    sendResponse({ apiBase: apiBase || LAST_API || null });
    return true;
  }
});