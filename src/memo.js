// Listing memo assembly: canonical JSON + SHA-256 verification hash +
// human-readable rendering. The hash covers the canonical memo body
// (everything except the hash field itself), so any later edit to the
// memo is detectable — the "signed listing risk memo" of Mission 01.
import { createHash } from "node:crypto";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]),
    );
  }
  return value;
}

export function memoHash(memoBody) {
  const canonical = JSON.stringify(canonicalize(memoBody));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildMemo({ input, preflight, purchases, decision, startedAt, finishedAt }) {
  const totalCost = purchases.reduce((sum, p) => sum + (p.costUsd ?? 0), 0);
  const body = {
    app: "ListingDesk",
    version: "0.1.0",
    mission: "Telegraph H2 — Track 03 Apps & Agents, Mission 01 Exchange",
    network: "Telegraph beta 2 (Ethereum Sepolia testnet)",
    input,
    startedAt,
    finishedAt,
    preflight,
    purchases: purchases.map((p) => ({
      key: p.key,
      intent: p.intent,
      ok: p.ok,
      costUsd: p.costUsd ?? null,
      answer: p.data ?? p.text ?? null,
      error: p.ok ? null : (p.text || "ask failed"),
    })),
    totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
    verdict: decision.verdict,
    verdictScore: decision.score,
    reasons: decision.reasons,
  };
  return { ...body, verificationHash: memoHash(body) };
}

export function renderMemoText(memo) {
  const lines = [];
  lines.push("LISTINGDESK — LISTING RISK MEMO");
  lines.push("================================");
  lines.push(`Mission:        ${memo.mission}`);
  lines.push(`Network:        ${memo.network}`);
  lines.push(`Contract:       ${memo.input.contract}`);
  if (memo.input.name) lines.push(`Project name:   ${memo.input.name}`);
  if (memo.input.social) lines.push(`Social account: ${memo.input.social}`);
  lines.push(`Started:        ${memo.startedAt}`);
  lines.push(`Finished:       ${memo.finishedAt}`);
  lines.push("");
  lines.push("PURCHASED INTELLIGENCE (via Telegraph)");
  for (const p of memo.purchases) {
    lines.push(`- [${p.ok ? "OK" : "FAILED"}] ${p.intent} — cost: ${p.costUsd == null ? "n/a" : "$" + p.costUsd}`);
    if (!p.ok && p.error) lines.push(`    error: ${String(p.error).split("\n")[0]}`);
  }
  lines.push("");
  lines.push("VERDICT REASONS");
  for (const r of memo.reasons) lines.push(`- ${r}`);
  lines.push("");
  lines.push(`VERDICT: ${memo.verdict}`);
  lines.push(`TOTAL COST: $${memo.totalCostUsd} (testnet USDC)`);
  lines.push(`Verification hash (SHA-256 of canonical memo): ${memo.verificationHash}`);
  return lines.join("\n");
}
