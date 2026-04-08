// background.js — capture orgId from real API traffic and share with content scripts
// Cross-browser shim: Firefox exposes `browser` (Promise-based); Chrome exposes `chrome`.
// Using the `chrome` alias works in Firefox too for callback-style APIs, but
// the shim below ensures consistent behaviour for both.
const _chrome = (typeof browser !== 'undefined') ? browser : chrome;

const TAB_ORG = new Map();   // tabId -> orgId string
let LAST_ORG = null;         // fallback if no per-tab yet

const ORG_RE = /\/api\/v2\/orgs\/(\d+)\b/;

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
_chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Also parse response URLs (sometimes redirects / final URL is more reliable)
_chrome.webRequest.onCompleted.addListener(
  (details) => {
    const m = ORG_RE.exec(details.url);
    if (m) updateOrgForTab(details.tabId, m[1]);
  },
  { urls: ["https://*/api/v2/*"] }
);

// Clean up if a tab closes
_chrome.tabs.onRemoved.addListener((tabId) => {
  TAB_ORG.delete(tabId);
});

// Answer content-script requests
_chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_ORG_ID') {
    const tabId = sender?.tab?.id;
    const byTab = (tabId != null) ? TAB_ORG.get(tabId) : null;
    sendResponse({ orgId: byTab || LAST_ORG || null });
    return true; // indicate async OK
  }
});
