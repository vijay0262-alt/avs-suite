/**
 * AVS Web Shield content script (isolated world).
 *
 * 1. Relays signals from the MAIN-world inject.js (window.postMessage) to
 *    the service worker.
 * 2. Detects password forms whose action posts to a different registrable
 *    domain than the page — a classic credential-phishing pattern.
 */

// ---------------------------------------------------------------------------
// Relay MAIN-world signals (inject.js can't reach chrome.runtime)
// ---------------------------------------------------------------------------

const ALLOWED_SIGNALS = new Set([
  "avs_clickfix_suspected",
  "avs_scareware_suspected",
]);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !ALLOWED_SIGNALS.has(data.avs_signal)) return;
  chrome.runtime.sendMessage({
    type: data.avs_signal === "avs_clickfix_suspected"
      ? "clickfix_detected"
      : "scareware_detected",
    signals: data.signals || [],
  });
});

// ---------------------------------------------------------------------------
// Cross-domain password form detection
// ---------------------------------------------------------------------------

function registrableDomain(hostname) {
  // Lightweight heuristic for the common cases; the backend does exact
  // PSL parsing — here we only need to avoid obvious false positives.
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const tld2 = parts.slice(-2).join(".");
  // Common two-part public suffixes.
  if (/^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(tld2)) {
    return parts.slice(-3).join(".");
  }
  return tld2;
}

function checkPhishingForms() {
  const pageDomain = registrableDomain(location.hostname);
  for (const form of document.querySelectorAll("form")) {
    if (!form.querySelector('input[type="password"]')) continue;
    const action = form.getAttribute("action");
    if (!action) continue;
    try {
      const target = new URL(action, location.href);
      if (target.hostname && target.hostname !== location.hostname &&
          registrableDomain(target.hostname) !== pageDomain) {
        chrome.runtime.sendMessage({ type: "phish_form_detected" });
        return;
      }
    } catch {
      // malformed action URL — ignore
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkPhishingForms, { once: true });
} else {
  checkPhishingForms();
}
