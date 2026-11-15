# ListingDesk

**An autonomous listings desk for token-listing decisions — powered by
intelligence bought through Telegraph.**

Built for **Telegraph Hackathon Season II · Track 03 Apps & Agents ·
Mission 01: Exchange**.

## The problem

An exchange listing review burns weeks of analyst time: contract audits,
market-integrity checks, sanctions screening and social-authenticity
checks are bought per seat, from separate vendors, with no shared
receipts. ListingDesk collapses that into one agent run: give it a token
contract address, and it **buys ranked intelligence through Telegraph**,
then issues a signed listing-risk memo with a verdict and a cost line.

## What it does

```
node src/cli.js check --contract 0x... --name "Project" --social @handle --chain BSC
```

1. **Preflight (free):** reads the Telegraph account/escrow state, the
   live intent catalogue and the current ranking epoch from the real
   node (`devnode.telegraphprotocol.com`, beta 2).
2. **Purchases (paid, machine-to-machine, from escrow):**
   - `SMART_CONTRACT_AUDIT_GENERAL` — contract audit (18 miners live;
     top-ranked: `codewire-smart-contract-audit`, score 0.9938)
   - `WASH_TRADING_DETECTION_GENERAL` — market-integrity / wash-trading
     verdict with wash-volume share (17 miners live)
   - `SANCTIONS_SCREENING_MATCH_GENERAL` — OFAC/EU/UN sanctions screen
     of the project name (26 miners live; only when `--name` is given)
   - `SOCIAL_BOT_DETECTION_GENERAL` — bot/coordination score for the
     project's social account (16 miners live; only with `--social`)
   Each ask costs ~$0.01 test USDC, paid automatically from the local
   Telegraph escrow by the official MCP server.
3. **Verdict (deterministic):** a pure rule engine converts the purchased
   answers into **LAYAK** (list) / **WASPADA** (caution) / **TOLAK**
   (reject). A confirmed sanctions match or ≥50% wash volume is a hard
   reject; a failed required purchase yields **INCOMPLETE** — the desk
   never guesses a verdict it didn't pay to check.
4. **Memo:** a listing-risk memo (JSON + text) containing every
   purchased answer as evidence, the verdict reasons, the **total cost
   line**, and a **SHA-256 verification hash** over the canonical memo —
   any later edit is detectable.

## Network status — read this first

Telegraph beta 2 runs on **Ethereum Sepolia (testnet)**. All money in
this project is test USDC (Telegraph's own test token,
`0xcc194e1a843B658526D0D5C431f670028582Ae17`) — **no real funds are used
anywhere**. The hackathon rules expressly allow a supported testnet
implementation to qualify.

## Reproduce it

Prerequisites: Node ≥ 20. Nothing to install (zero dependencies; the
official Telegraph MCP server is fetched by `npx` on first run).

```bash
# 1. Unit tests (verdict engine, validation, memo hashing)
npm test

# 2. Create the dedicated Telegraph wallet (testnet only, interactive)
npm run setup            # creates ./.telegraph/wallet.json — back it up!

# 3. Fund it (needs tegar/account steps, see below), then deposit to escrow
npm run fund

# 4. Live smoke: free tools against the real node
npm run smoke

# 5. A real check (paid asks; ~$0.03 test USDC for the full panel)
node src/cli.js check --contract 0x865bd15C54B024239cFc1fC898E6ca08d44C3423 --name "BOME66" --chain "BSC"
```

### Funding the escrow (one-time, ~2 minutes)

The dedicated wallet created in step 2 is
`0xAe02FdefC1BCFAAbb62bC25fBE2fd18010d5718d` in this workspace. It needs:

1. **A little Sepolia ETH** for gas — any public Sepolia faucet.
2. **Test USDC** — claim at <https://anjoman.ai/dashboard/faucet>
   (sign in; 1 USDC per account every 24 hours) and send it to the
   wallet address.
3. `npm run fund` — moves USDC into the Telegraph escrow (two testnet
   transactions: approve + deposit), after confirmation.

Until the escrow is funded, every ask is refused by the node with a
clean HTTP 402 ("insufficient escrow … nothing was charged") and
ListingDesk issues an INCOMPLETE memo — that refusal is itself recorded
in `out/` from the 2026-11-15 live run.

### Failure cases (the "break it" step)

- Invalid contract address → structured `INVALID_CONTRACT_ADDRESS`
  error, exit code 2, no network calls.
- Escrow empty → all purchases refused with 402, verdict INCOMPLETE,
  exit code 3, $0 charged (a failed ask is never billed).
- Missing optional inputs (`--name`, `--social`) → those panels are
  skipped, the rest of the memo still completes.

## Layout

```
src/cli.js        CLI entry: check command, input validation, orchestration
src/telegraph.js  Telegraph access via the official MCP server (subprocess)
src/mcp-client.js Minimal MCP stdio client (JSON-RPC)
src/verdict.js    Deterministic verdict engine (pure, unit-tested)
src/memo.js       Memo assembly, canonical SHA-256 verification hash
scripts/smoke.mjs Live smoke against the real node (free; --paid for one ask)
test/             node:test unit tests (fixtures are dev-only, never evidence)
vendor-telegraph-mcp/  Upstream @telegraphprotocol/telegraph-protocol-mcp source, for reference
```

## Commercial summary (draft for the submission form)

- **Who is the buyer?** Listing/risk teams at spot exchanges and launch
  platforms; they face this problem for every listing application.
- **Problem → result:** weeks of per-seat analyst tooling → one agent
  run, ~$0.03 of purchased intelligence, a reproducible memo with
  receipts and a cost line.
- **Why Telegraph?** The intelligence is ranked by measured performance
  and bought machine-to-machine; the desk holds no vendor contracts and
  swaps in whichever miner currently ranks best per intent.
- **Honest status:** testnet (beta 2 / Sepolia), solo build, delivery
  award targeted; independent adoption evidence is still to be gathered
  during the remaining event window.

## Disclosure

Original code by tegar07 for this hackathon. The only reused component
is the official Telegraph MCP server
(`@telegraphprotocol/telegraph-protocol-mcp`, Telegraph Protocol),
driven as a subprocess — disclosed here as required by the rules.
