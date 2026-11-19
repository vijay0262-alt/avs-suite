/**
 * AVS AI Shield — Web Shield service worker.
 *
 * Maintains a persistent native-messaging port to the local AVS backend
 * (`avs-backend --native-messaging`) and checks every top-level navigation
 * against the signed threat-intel bundle + local heuristics. Unsafe
 * navigations are redirected to the extension's block page.
 *
 * Degrades fail-open: if the backend is unreachable the extension logs and
 * lets the navigation through rather than blocking the user's browsing.
 */

const NATIVE_HOST = "com.avsshield.webshield";
const CHECK_TIMEOUT_MS = 5000;
const SESSION_CACHE_TTL_MS = 60_000;
const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");

// ---------------------------------------------------------------------------
// Native port lifecycle
// ---------------------------------------------------------------------------

let port = null;
let seq = 0;
const pending = new Map(); // id -> {resolve, timer}

function ensurePort() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
  } catch (e) {
    console.warn("AVS Web Shield: native host unavailable", e);
    port = null;
    return null;
  }
  port.onMessage.addListener((msg) => {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      entry.resolve(msg);
    }
  });
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    console.warn("AVS Web Shield: native port disconnected", err && err.message);
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    pending.clear();
    port = null;
  });
  return port;
}

function sendNative(message) {
  return new Promise((resolve) => {
    const p = ensurePort();
    if (!p) return resolve(null);
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, CHECK_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      p.postMessage({ ...message, id });
    } catch (e) {
      pending.delete(id);
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Session allowlist ("proceed anyway") + result cache
// ---------------------------------------------------------------------------

// chrome.storage.session survives SW restarts but clears with the browser.
async function isSessionAllowed(url) {
  const { allowed = {} } = await chrome.storage.session.get("allowed");
  const host = new URL(url).hostname;
  return Boolean(allowed[host]);
}

async function sessionAllow(url) {
  const { allowed = {} } = await chrome.storage.session.get("allowed");
  allowed[new URL(url).hostname] = Date.now();
  await chrome.storage.session.set({ allowed });
}

const resultCache = new Map(); // url -> {result, at}
function cached(url) {
  const hit = resultCache.get(url);
  if (hit && Date.now() - hit.at < SESSION_CACHE_TTL_MS) return hit.result;
  resultCache.delete(url);
  return undefined;
}
function remember(url, result) {
  if (resultCache.size > 500) resultCache.clear();
  resultCache.set(url, { result, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Navigation checking
// ---------------------------------------------------------------------------

function shouldSkip(url) {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (url.startsWith(BLOCK_PAGE)) return true;
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  } catch {
    return true;
  }
  return false;
}

async function checkAndBlock(tabId, url) {
  if (shouldSkip(url)) return;
  if (await isSessionAllowed(url)) return;

  let result = cached(url);
  if (result === undefined) {
    const reply = await sendNative({ type: "check_url", url });
    if (!reply || reply.type === "error") return; // fail open
    result = reply;
    remember(url, result);
  }

  if (result.safe) return;

  const params = new URLSearchParams({
    url,
    level: result.risk_level || "high",
    reasons: (result.reasons || []).join("|"),
    source: result.intel_source || "heuristic",
  });
  chrome.tabs.update(tabId, { url: `${BLOCK_PAGE}?${params}` });
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // top frame only
  checkAndBlock(details.tabId, details.url);
});

// ---------------------------------------------------------------------------
// Content-script signals (scareware / ClickFix / phishing forms)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !sender.tab) return false;

  switch (msg.type) {
    case "clickfix_detected":
    case "scareware_detected": {
      const url = sender.url || (sender.tab && sender.tab.url);
      if (!url || shouldSkip(url)) break;
      const params = new URLSearchParams({
        url,
        level: "critical",
        reasons: msg.signals.join("|"),
        source: msg.type === "clickfix_detected" ? "clickfix" : "scareware",
      });
      chrome.tabs.update(sender.tab.id, { url: `${BLOCK_PAGE}?${params}` });
      break;
    }
    case "phish_form_detected": {
      const url = sender.url || (sender.tab && sender.tab.url);
      if (!url || shouldSkip(url)) break;
      checkAndBlock(sender.tab.id, url);
      break;
    }
    case "user_report":
      sendNative({ type: "report", url: msg.url, verdict: msg.verdict, note: msg.note || "" });
      break;
    case "proceed_anyway": {
      const { url } = msg;
      sessionAllow(url).then(() => {
        sendNative({ type: "allow_url", url });
        if (sender.tab) chrome.tabs.update(sender.tab.id, { url });
      });
      break;
    }
    case "check_text":
      sendNative({ type: "check_text", text: msg.text })
        .then((r) => sendResponse(r))
        .catch(() => sendResponse(null)); // fail open
      return true; // async
    case "get_status":
      sendNative({ type: "status" }).then((r) => sendResponse(r));
      return true; // async
  }
  return false;
});

// Wake the native host eagerly so the first navigation isn't cold.
ensurePort();
sendNative({ type: "ping" }).then((r) => {
  if (r) console.info("AVS Web Shield: native host connected", r.version);
});
