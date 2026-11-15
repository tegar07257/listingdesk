// Live smoke check against the real Telegraph node (beta 2, Sepolia testnet).
// Default: free tools only (account, intents, ranking). With `--paid`, also
// performs ONE real paid ask (~$0.01 test USDC from escrow) and prints the
// raw result — the proof-of-purchase probe.
import { Telegraph } from "../src/telegraph.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".telegraph");
const paid = process.argv.includes("--paid");

const tg = new Telegraph(HOME);
await tg.start();
try {
  const account = await tg.account();
  console.log("ACCOUNT:", JSON.stringify(account.data ?? account.text, null, 2).slice(0, 1200));
  const intent = await tg.intent("SMART_CONTRACT_AUDIT_GENERAL");
  console.log("INTENT miners:", intent.data?.miners, "| top:", intent.data?.top_ranked?.[0]?.miner);
  const ranking = await tg.ranking("SMART_CONTRACT_AUDIT_GENERAL");
  console.log("RANKING epoch:", ranking.data?.epoch);
  if (paid) {
    const res = await tg.ask({
      intent: "WASH_TRADING_DETECTION_GENERAL",
      params: { subject: "0x865bd15C54B024239cFc1fC898E6ca08d44C3423" },
    });
    console.log("PAID ASK ok:", res.ok);
    console.log("PAID ASK result:", (res.text || "").slice(0, 2000));
  }
} finally {
  tg.close();
}
