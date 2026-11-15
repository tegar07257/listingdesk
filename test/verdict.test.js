// Unit tests for the deterministic verdict engine.
// The answer objects below are DEVELOPMENT FIXTURES that mimic the typed
// answer shapes published by telegraph_intent for each intent. They are
// used only to test this local decision logic — never as submission
// evidence (the hackathon entry uses live Telegraph answers only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVerdict } from "../src/verdict.js";
import { buildMemo, memoHash } from "../src/memo.js";
import { isValidAddress } from "../src/cli.js";

const cleanAudit = { key: "audit", intent: "SMART_CONTRACT_AUDIT_GENERAL", ok: true, data: null, text: "No major issues found. Standard ERC-20, fixed supply, no privileged functions identified." };
const cleanWash = { key: "wash", intent: "WASH_TRADING_DETECTION_GENERAL", ok: true, data: { subject: "0xabc", verdict: "NO_WASH_TRADING", wash_volume_pct: 2, signals: [], summary: "Organic flow." }, text: "" };

test("clean answers -> LAYAK", () => {
  const d = decideVerdict([cleanAudit, cleanWash]);
  assert.equal(d.verdict, "LAYAK");
  assert.equal(d.score, 0);
});

test("sanctions match -> TOLAK (hard reject)", () => {
  const sanc = { key: "sanctions", intent: "SANCTIONS_SCREENING_MATCH_GENERAL", ok: true, data: { name: "X", matched: true, matches: ["OFAC SDN"], lists: ["OFAC SDN"], match_score: 0.99 }, text: "" };
  const d = decideVerdict([cleanAudit, cleanWash, sanc]);
  assert.equal(d.verdict, "TOLAK");
});

test("wash volume >= 50% -> TOLAK", () => {
  const wash = { ...cleanWash, data: { ...cleanWash.data, verdict: "WASH_TRADING", wash_volume_pct: 63 } };
  assert.equal(decideVerdict([cleanAudit, wash]).verdict, "TOLAK");
});

test("wash volume 20-49% -> WASPADA", () => {
  const wash = { ...cleanWash, data: { ...cleanWash.data, wash_volume_pct: 30 } };
  assert.equal(decideVerdict([cleanAudit, wash]).verdict, "WASPADA");
});

test("audit critical keyword -> TOLAK", () => {
  const audit = { ...cleanAudit, text: "Critical: reentrancy in withdraw() allows draining the contract." };
  assert.equal(decideVerdict([audit, cleanWash]).verdict, "TOLAK");
});

test("audit centralisation warning -> WASPADA", () => {
  const audit = { ...cleanAudit, text: "Contract is upgradeable via a proxy controlled by a single owner." };
  assert.equal(decideVerdict([audit, cleanWash]).verdict, "WASPADA");
});

test("high bot score -> WASPADA", () => {
  const social = { key: "social", intent: "SOCIAL_BOT_DETECTION_GENERAL", ok: true, data: { account: "@x", verdict: "LIKELY_BOT", bot_score: 0.91, signals: [] }, text: "" };
  assert.equal(decideVerdict([cleanAudit, cleanWash, social]).verdict, "WASPADA");
});

test("failed required purchase -> INCOMPLETE, no verdict", () => {
  const failed = { key: "audit", intent: "SMART_CONTRACT_AUDIT_GENERAL", ok: false, data: null, text: "Escrow balance too low" };
  const d = decideVerdict([failed, cleanWash]);
  assert.equal(d.verdict, "INCOMPLETE");
});

test("address validation", () => {
  assert.equal(isValidAddress("0x865bd15C54B024239cFc1fC898E6ca08d44C3423"), true);
  assert.equal(isValidAddress("0x123"), false);
  assert.equal(isValidAddress("not-an-address"), false);
  assert.equal(isValidAddress(undefined), false);
});

test("memo hash is stable and tamper-evident", () => {
  const memo = buildMemo({
    input: { contract: "0x865bd15C54B024239cFc1fC898E6ca08d44C3423", name: null, social: null, chain: "BSC" },
    preflight: {}, purchases: [], decision: { verdict: "INCOMPLETE", score: null, reasons: ["x"] },
    startedAt: "2026-11-15T00:00:00.000Z", finishedAt: "2026-11-15T00:01:00.000Z",
  });
  const { verificationHash, ...body } = memo;
  assert.equal(memoHash(body), verificationHash);
  const tampered = { ...body, verdict: "LAYAK" };
  assert.notEqual(memoHash(tampered), verificationHash);
});
