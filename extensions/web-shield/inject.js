/**
 * AVS Web Shield page-context hooks (MAIN world).
 *
 * Wraps APIs that scam pages abuse:
 *  - navigator.clipboard.writeText/write + execCommand('copy'):
 *    ClickFix / fake-CAPTCHA attacks trick users into pasting a malicious
 *    command into the Run dialog or terminal.
 *  - requestFullscreen + beforeunload trap + alarm audio: scareware
 *    ("Your PC is infected, call support") locks the page full-screen and
 *    prevents the user leaving.
 *
 * Signals are posted via window.postMessage and relayed by content.js.
 * Each signal fires at most once per page.
 */

(function () {
  "use strict";

  const fired = new Set();
  function signal(name, signals) {
    if (fired.has(name)) return;
    fired.add(name);
    window.postMessage({ avs_signal: name, signals }, "*");
  }

  // -----------------------------------------------------------------
  // ClickFix: clipboard writes containing shell/command patterns
  // -----------------------------------------------------------------

  const COMMAND_PATTERNS = [
    /\bpowershell\b/i,
    /\bpwsh\b/i,
    /\bmshta\b/i,
    /\bregsvr32\b/i,
    /\brundll32\b/i,
    /\bcertutil\b/i,
    /\bbitsadmin\b/i,
    /\bmsiexec\b/i,
    /\bwscript\b/i,
    /\bcscript\b/i,
    /\bcmd(?:\.exe)?\s*\/[ck]\b/i,
    /\bcurl\b[^|]*\|\s*(?:iex|sh|bash|powershell)/i,
    /\biex\s*\(/i,
    /\binvoke-(?:expression|webrequest|restmethod)/i,
    /\bwget\b[^|]*\|\s*(?:sh|bash)/i,
  ];

  function inspectClipboardText(text) {
    if (typeof text !== "string" || text.length < 15 || text.length > 4096) return;
    for (const pattern of COMMAND_PATTERNS) {
      if (pattern.test(text)) {
        signal("avs_clickfix_suspected", [
          `clipboard_command:${pattern.source.slice(0, 40)}`,
        ]);
        return;
      }
    }
  }

  if (navigator.clipboard) {
    const origWriteText = navigator.clipboard.writeText &&
      navigator.clipboard.writeText.bind(navigator.clipboard);
    if (origWriteText) {
      navigator.clipboard.writeText = function (text) {
        try { inspectClipboardText(text); } catch {}
        return origWriteText(text);
      };
    }
    const origWrite = navigator.clipboard.write &&
      navigator.clipboard.write.bind(navigator.clipboard);
    if (origWrite && typeof ClipboardItem !== "undefined") {
      navigator.clipboard.write = function (items) {
        try {
          for (const item of items) {
            if (item.types && item.types.includes("text/plain")) {
              item.getType("text/plain")
                .then((blob) => blob.text())
                .then(inspectClipboardText)
                .catch(() => {});
            }
          }
        } catch {}
        return origWrite(items);
      };
    }
  }

  const origExecCommand = document.execCommand &&
    document.execCommand.bind(document);
  if (origExecCommand) {
    document.execCommand = function (command, ...rest) {
      if (typeof command === "string" && command.toLowerCase() === "copy") {
        try {
          const sel = document.getSelection();
          if (sel) inspectClipboardText(sel.toString());
        } catch {}
      }
      return origExecCommand(command, ...rest);
    };
  }

  // -----------------------------------------------------------------
  // Scareware: fullscreen lock + leave-trap + alarm audio
  // -----------------------------------------------------------------

  const scareSignals = new Set();
  function scarewareCheck() {
    // Require at least two abuse signals to avoid false positives on
    // legitimate fullscreen apps (video, games) or alarm uses.
    if (scareSignals.size >= 2) {
      signal("avs_scareware_suspected", [...scareSignals]);
    }
  }

  const origRequestFs = Element.prototype.requestFullscreen;
  if (origRequestFs) {
    Element.prototype.requestFullscreen = function (...args) {
      scareSignals.add("fullscreen_lock");
      scarewareCheck();
      return origRequestFs.apply(this, args);
    };
  }

  const origAddListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, ...rest) {
    if (type === "beforeunload" && this === window) {
      scareSignals.add("beforeunload_trap");
      // Defer: only counts if combined with another signal later.
      setTimeout(scarewareCheck, 0);
    }
    return origAddListener.call(this, type, listener, ...rest);
  };

  // Heuristic page-content scan — fake support hotlines.
  function scanScarewareText() {
    const body = document.body;
    if (!body) return;
    const text = (body.innerText || "").slice(0, 50_000);
    const scarePatterns = [
      /(?:your (?:computer|pc|device) (?:is|has been) (?:infected|blocked|compromised))/i,
      /call (?:microsoft|apple|windows)? ?support (?:immediately|now)/i,
      /do not (?:close|restart|shut down|turn off)/i,
      /toll[- ]?free[^\d]{0,20}(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i,
    ];
    let hits = 0;
    for (const p of scarePatterns) if (p.test(text)) hits++;
    if (hits >= 2) {
      scareSignals.add("scareware_content");
      scarewareCheck();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(scanScarewareText, 1500), { once: true });
  } else {
    setTimeout(scanScarewareText, 1500);
  }
})();
