// Deterministic verdict engine for ListingDesk.
//
// Input: the set of Telegraph answers bought for one listing candidate.
// Output: one of LAYAK (list), WASPADA (caution), TOLAK (reject), or
// INCOMPLETE (a required purchase failed, so no verdict may be issued).
//
// Rules are deliberately conservative and fully deterministic: the same
// answers always produce the same verdict, and every rule that fires is
// recorded in `reasons` so a reviewer can re-derive the verdict by hand.

export const VERDICTS = ["LAYAK", "WASPADA", "TOLAK", "INCOMPLETE"];

// High-severity phrases looked for in free-form audit answers
// (SMART_CONTRACT_AUDIT_GENERAL answers are judgment text, not typed fields).
const AUDIT_CRITICAL = [
  "reentrancy", "re-entrancy", "honeypot", "unlimited mint", "mint without limit",
  "owner can drain", "drain the contract", "rug pull", "hidden mint",
  "blacklist", "cannot sell", "unable to sell", "backdoor",
];
const AUDIT_WARNING = [
  "centraliz", "owner can pause", "pausable", "upgradeable", "proxy",
  "high tax", "sell tax", "mutable", "not renounced", "single owner",
];

function normText(x) {
  const s = x == null ? "" : typeof x === "string" ? x : JSON.stringify(x);
  return s.toLowerCase().replace(/[_-]+/g, " ");
}

// answers: [{ key, intent, ok, data, text }]
// keys used: "audit" | "wash" | "sanctions" | "social"
export function decideVerdict(answers) {
  const reasons = [];
  let score = 0; // >=3 reject, 1..2 caution, 0 list
  const byKey = Object.fromEntries(answers.map((a) => [a.key, a]));

  const required = ["audit", "wash"];
  const missing = required.filter((k) => !byKey[k] || !byKey[k].ok);
  if (missing.length > 0) {
    return {
      verdict: "INCOMPLETE",
      score: null,
      reasons: [`Required purchase(s) failed or missing: ${missing.join(", ")}. No verdict issued.`],
    };
  }

  // --- Sanctions: a confirmed match is a hard reject. ---
  const sanc = byKey.sanctions;
  if (sanc?.ok && sanc.data && typeof sanc.data === "object") {
    if (sanc.data.matched === true) {
      score += 3;
      reasons.push(`SANCTIONS: name matched a sanctions list (match_score=${sanc.data.match_score ?? "n/a"}). Hard reject.`);
    } else if (typeof sanc.data.match_score === "number" && sanc.data.match_score >= 0.85) {
      score += 1;
      reasons.push(`SANCTIONS: no confirmed match, but near-match score ${sanc.data.match_score} >= 0.85. Caution.`);
    } else {
      reasons.push("SANCTIONS: no match reported.");
    }
  }

  // --- Wash trading: typed verdict + wash volume share. ---
  const wash = byKey.wash;
  if (wash?.ok) {
    const d = wash.data && typeof wash.data === "object" ? wash.data : null;
    const pct = d && typeof d.wash_volume_pct === "number" ? d.wash_volume_pct : null;
    const wv = d ? normText(d.verdict) : normText(wash.text);
    if (pct !== null && pct >= 50) {
      score += 3;
      reasons.push(`WASH: ${pct}% of volume judged wash trading (>= 50%). Reject.`);
    } else if ((pct !== null && pct >= 20) || (/wash/.test(wv) && !/no wash|not wash|unlikely|clean|none/.test(wv))) {
      score += 1;
      reasons.push(`WASH: wash-trading signal present${pct !== null ? ` (${pct}% of volume)` : ""}. Caution.`);
    } else {
      reasons.push(`WASH: no material wash-trading signal${pct !== null ? ` (${pct}% of volume)` : ""}.`);
    }
  }

  // --- Contract audit: free-form judgment text, keyword severity scan. ---
  const audit = byKey.audit;
  if (audit?.ok) {
    const t = normText(audit.data ?? audit.text);
    const crit = AUDIT_CRITICAL.filter((p) => t.includes(p));
    const warn = AUDIT_WARNING.filter((p) => t.includes(p));
    if (crit.length > 0) {
      score += 3;
      reasons.push(`AUDIT: critical finding(s) in purchased audit answer: ${crit.join("; ")}. Reject.`);
    } else if (warn.length > 0) {
      score += 1;
      reasons.push(`AUDIT: centralisation/control warning(s): ${warn.join("; ")}. Caution.`);
    } else {
      reasons.push("AUDIT: no critical or centralisation keywords found in purchased audit answer.");
    }
  }

  // --- Social bot detection: typed bot_score. ---
  const social = byKey.social;
  if (social?.ok && social.data && typeof social.data === "object" && typeof social.data.bot_score === "number") {
    if (social.data.bot_score >= 0.8) {
      score += 1;
      reasons.push(`SOCIAL: bot_score ${social.data.bot_score} >= 0.8 — following looks largely inauthentic. Caution.`);
    } else {
      reasons.push(`SOCIAL: bot_score ${social.data.bot_score} below 0.8.`);
    }
  }

  const verdict = score >= 3 ? "TOLAK" : score >= 1 ? "WASPADA" : "LAYAK";
  return { verdict, score, reasons };
}
