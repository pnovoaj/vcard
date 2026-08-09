import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, sha256Hex, tokenIsValid } from "../src/worker.js";

const token = "A".repeat(43);
const tokenHash = await sha256Hex(token);
const env = {
  NFC_TOKEN_HASHES: tokenHash,
  CONTACT_WORK_URL: "https://contacts.example/work.vcf",
  CONTACT_PERSONAL_URL: "https://contacts.example/personal.vcf",
  CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) }
};

test("accepts only configured token hashes", async () => {
  assert.equal(await tokenIsValid(token, tokenHash), true);
  assert.equal(await tokenIsValid("B".repeat(43), tokenHash), false);
  assert.equal(await tokenIsValid("short", tokenHash), false);
});

test("hides invalid tokens behind 404", async () => {
  const result = await handleRequest(new Request(`https://example.com/c/${"B".repeat(43)}`), env);
  assert.equal(result.status, 404);
  assert.equal(result.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(result.headers.get("x-robots-tag"), /noindex/);
});

test("serves page and redirects downloads only for valid tokens", async () => {
  const page = await handleRequest(new Request(`https://example.com/c/${token}`), env);
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /contacts\.example/);

  const download = await handleRequest(new Request(`https://example.com/c/${token}/download/work`), env);
  assert.equal(download.status, 302);
  assert.equal(download.headers.get("location"), env.CONTACT_WORK_URL);
});

test("rate limits before validating a token", async () => {
  const limitedEnv = { ...env, CONTACT_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const result = await handleRequest(new Request(`https://example.com/c/${token}`), limitedEnv);
  assert.equal(result.status, 429);
});
