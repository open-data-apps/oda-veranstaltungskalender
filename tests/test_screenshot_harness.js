const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const script = path.join(__dirname, "screenshot.js");
const chrome = "/definitely/not/a/chrome-binary";
const env = { ...process.env, VK_CHROME: chrome };

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
}

const invalidViewport = run(["0", "812", "/tmp/screenshot.png"]);
assert.strictEqual(invalidViewport.status, 1, "zero viewport width must fail");
assert.match(invalidViewport.stderr + invalidViewport.stdout, /positive (integer|Ganzzahl)/i);
assert.doesNotMatch(invalidViewport.stderr + invalidViewport.stdout, /spawn .*ENOENT/i,
  "viewport validation must run before Chrome starts");

const protectedScreenshot = path.join(__dirname, "..", "assets", "Desktop_Screenshot_1.png");
const protectedTarget = run(["1280", "900", protectedScreenshot]);
assert.strictEqual(protectedTarget.status, 1, "assets screenshot target must be rejected");
assert.match(protectedTarget.stderr + protectedTarget.stdout, /assets/i);
assert.doesNotMatch(protectedTarget.stderr + protectedTarget.stdout, /spawn .*ENOENT/i,
  "target validation must run before Chrome starts");

console.log("[PASS] screenshot CLI validates viewport and protects shipped assets before Chrome startup");
