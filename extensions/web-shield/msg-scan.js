/* AVS Scam Shield — message-text scanner for WhatsApp Web & Messenger.
 *
 * Watches incoming message bubbles, sends the text to the native host's
 * scam classifier (check_text), and badges messages that score
 * suspicious or scam. All analysis is local — message text never leaves
 * the machine except to the local AVS backend via native messaging.
 */
(() => {
  "use strict";

  const TAG = "AVS Scam Shield";
  const SEEN_ATTR = "data-avs-scanned";

  // Selectors for incoming-message containers (best-effort; these apps
  // change DOM often — anything missed is simply not scanned).
  const INCOMING = [
    "div.message-in",                       // WhatsApp Web
    "div[data-testid='msg-container']",     // WhatsApp (alt)
    "div[role='row']",                      // Messenger / Facebook
  ].join(",");

  const TEXT_SEL = [
    "span.selectable-text",                 // WhatsApp
    "div[dir='auto']",                      // Messenger
  ].join(",");

  const seen = new Set();
  const pending = new Map(); // node -> text (batched)

  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h;
  }

  function extractText(node) {
    const spans = node.querySelectorAll(TEXT_SEL);
    const parts = [];
    for (const s of spans) {
      const t = (s.textContent || "").trim();
      if (t.length >= 15) parts.push(t); // skip emoji-only / timestamps
    }
    return parts.join(" ").slice(0, 4000);
  }

  function badge(node, result) {
    if (!node.isConnected) return;
    const el = document.createElement("div");
    el.style.cssText =
      "margin:4px 0 0;padding:6px 10px;border-radius:8px;font:12px/1.4 system-ui;" +
      (result.verdict === "scam"
        ? "background:#7f1d1d;color:#fecaca;"
        : "background:#78350f;color:#fde68a;");
    const tactics = (result.tactics || []).slice(0, 3).join(", ");
    el.textContent =
      `⚠ ${TAG}: this message looks ${result.verdict} (score ${result.score})` +
      (tactics ? ` — ${tactics}` : "") +
      (result.advice ? `. ${result.advice}` : "");
    (node.querySelector("[data-avs-badge-target]") || node).appendChild(el);
  }

  function scan(node, text) {
    const key = hash(text);
    if (seen.has(key)) return;
    seen.add(key);
    chrome.runtime.sendMessage({ type: "check_text", text }, (reply) => {
      if (chrome.runtime.lastError || !reply) return;
      if (reply.verdict === "scam" || reply.verdict === "suspicious") {
        badge(node, reply);
      }
    });
  }

  function sweep(root) {
    for (const node of root.querySelectorAll
      ? root.querySelectorAll(INCOMING)
      : []) {
      if (node.hasAttribute(SEEN_ATTR)) continue;
      node.setAttribute(SEEN_ATTR, "1");
      const text = extractText(node);
      if (text) scan(node, text);
    }
  }

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const added of m.addedNodes) {
        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        if (added.matches && added.matches(INCOMING)) {
          const text = extractText(added);
          if (text && !added.hasAttribute(SEEN_ATTR)) {
            added.setAttribute(SEEN_ATTR, "1");
            scan(added, text);
          }
        }
        sweep(added);
      }
    }
  });

  obs.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  sweep(document);
})();
