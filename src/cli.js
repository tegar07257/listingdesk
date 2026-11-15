#!/usr/bin/env node
// ListingDesk CLI — Mission 01 Exchange (Telegraph Hackathon Season II,
// Track 03 Apps & Agents).
//
//   node src/cli.js check --contract 0x... [--name "Project"] [--social @handle]
//                         [--chain "BSC"] [--out ./out] [--skip-paid]
//
// Exit codes: 0 verdict issued · 2 invalid input · 3 INCOMPLETE (a required
// Telegraph purchase failed — e.g. escrow not funded yet).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telegraph, NETWORK_NOTE } from "./telegraph.js";
import { decideVerdict } from "./verdict.js";
import { buildMemo, renderMemoText } from "./memo.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = resolve(HERE, "..", ".telegraph");

export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export function isValidAddress(a) { return typeof a === "string" && EVM_ADDRESS.test(a); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (key === "skip-paid") out.skipPaid = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

function extractCost(res) {
  const d = res?.data;
  if (!d || typeof d !== "object") return null;
  for (const k of ["cost_usd", "costUsd", "cost", "price_usd", "charged_usd", "amount_usd"]) {
    if (typeof d[k] === "number") return d[k];
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args._[0] !== "check") {
    console.error("Usage: node src/cli.js check --contract 0x... [--name X] [--social @h] [--chain BSC] [--out DIR] [--skip-paid]");
    process.exit(2);
  }
  const contract = args.contract;
  if (!isValidAddress(contract)) {
    console.error(JSON.stringify({ error: "INVALID_CONTRACT_ADDRESS", detail: `--contract must be a 0x-prefixed 40-hex address, got: ${contract ?? "(missing)"}` }));
    process.exit(2);
  }
  const input = {
    contract,
    name: args.name ?? null,
    social: args.social ?? null,
    chain: args.chain ?? "EVM",
  };

  const startedAt = new Date().toISOString();
  const tg = new Telegraph(HOME);
  await tg.start();
  try {
    // ---- Free preflight: account + intent metadata + ranking snapshot ----
    const account = await tg.account();
    const intents = {};
    for (const name of ["SMART_CONTRACT_AUDIT_GENERAL", "WASH_TRADING_DETECTION_GENERAL", "SANCTIONS_SCREENING_MATCH_GENERAL", "SOCIAL_BOT_DETECTION_GENERAL"]) {
      const r = await tg.intent(name);
      intents[name] = r.data ?? r.text;
    }
    const ranking = await tg.ranking("SMART_CONTRACT_AUDIT_GENERAL");
    const preflight = {
      node: process.env.TELEGRAPH_URL || "https://devnode.telegraphprotocol.com",
      networkNote: NETWORK_NOTE,
      accountOk: account.ok,
      account: account.data ?? account.text,
      intentMiners: Object.fromEntries(Object.entries(intents).map(([k, v]) => [k, v?.miners ?? null])),
      rankingEpoch: ranking.data?.epoch ?? null,
    };

    // ---- Paid purchases through Telegraph (escrow, testnet USDC) ----
    const purchases = [];
    if (!args.skipPaid) {
      const auditQ =
        `Audit the smart contract at address ${contract} (${input.chain}) as a candidate for an exchange listing. ` +
        `Inspect for reentrancy, access control and mint authority, transfer restrictions or honeypot behaviour, and upgradeability. ` +
        `Summarise findings by severity.`;
      const plan = [
        { key: "audit", intent: "SMART_CONTRACT_AUDIT_GENERAL", ask: { intent: "SMART_CONTRACT_AUDIT_GENERAL", question: auditQ } },
        { key: "wash", intent: "WASH_TRADING_DETECTION_GENERAL", ask: { intent: "WASH_TRADING_DETECTION_GENERAL", params: { subject: contract } } },
        ...(input.name ? [{ key: "sanctions", intent: "SANCTIONS_SCREENING_MATCH_GENERAL", ask: { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", params: { name: input.name } } }] : []),
        ...(input.social ? [{ key: "social", intent: "SOCIAL_BOT_DETECTION_GENERAL", ask: { intent: "SOCIAL_BOT_DETECTION_GENERAL", params: { account: input.social } } }] : []),
      ];
      for (const step of plan) {
        const res = await tg.ask(step.ask);
        purchases.push({ key: step.key, intent: step.intent, ok: res.ok, data: res.data, text: res.text, costUsd: extractCost(res) });
      }
    }

    const decision = decideVerdict(purchases);
    const finishedAt = new Date().toISOString();
    const memo = buildMemo({ input, preflight, purchases, decision, startedAt, finishedAt });

    const outDir = resolve(args.out ?? join(HERE, "..", "out"));
    await mkdir(outDir, { recursive: true });
    const stamp = startedAt.replace(/[:.]/g, "-");
    await writeFile(join(outDir, `memo-${contract.slice(0, 10)}-${stamp}.json`), JSON.stringify(memo, null, 2) + "\n");
    const text = renderMemoText(memo);
    await writeFile(join(outDir, `memo-${contract.slice(0, 10)}-${stamp}.txt`), text + "\n");
    console.log(text);
    process.exit(decision.verdict === "INCOMPLETE" ? 3 : 0);
  } finally {
    tg.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(JSON.stringify({ error: "LISTINGDESK_FAILED", detail: String(e?.message ?? e) })); process.exit(1); });
}
