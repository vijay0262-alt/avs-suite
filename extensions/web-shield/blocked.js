/** AVS Web Shield block page controller. */

const params = new URLSearchParams(location.search);
const url = params.get("url") || "";
const level = params.get("level") || "high";
const source = params.get("source") || "heuristic";
const reasons = (params.get("reasons") || "").split("|").filter(Boolean);

document.getElementById("url").textContent = url;
document.getElementById("level").textContent =
  source === "clickfix" ? "ClickFix attack" :
  source === "scareware" ? "scareware" :
  `${level} risk`;

const list = document.getElementById("reasons");
const labels = reasons.length
  ? reasons
  : ["This site matched AVS threat intelligence or scam heuristics."];
for (const reason of labels.slice(0, 8)) {
  const li = document.createElement("li");
  li.textContent = reason.replace(/[_:]/g, " · ").replace(/\s+/g, " ");
  list.appendChild(li);
}

document.getElementById("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else window.close();
});

document.getElementById("proceed").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "proceed_anyway", url });
});
