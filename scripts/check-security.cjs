const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: [path.join(rootDir, ".env.local"), path.join(rootDir, ".env")], quiet: true });

const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function expect(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

const secret = String(process.env.JWT_SECRET || "").trim();
const sessionSource = read("src/lib/security/session.ts");
const middlewareSource = read("src/middleware.ts");
const loginSource = read("src/app/api/auth/login/route.ts");
const nextConfigSource = read("next.config.js");
const gitignoreSource = read(".gitignore");

expect("JWT_SECRET is configured", secret.length >= 32 && secret !== "zxgj-dev-secret-key-2026");
expect("Session cookie is HTTP-only", /httpOnly:\s*true/.test(sessionSource));
expect("Session cookie is secure in production", /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/.test(sessionSource));
expect("Session cookie uses SameSite", /sameSite:\s*["']lax["']/.test(sessionSource));
expect("Middleware verifies JWT", /jwtVerify\(/.test(middlewareSource));
expect("Middleware checks mutation origin", /isSameOriginMutation\(req\)/.test(middlewareSource));
expect("Login has rate limiting", /MAX_LOGIN_ATTEMPTS/.test(loginSource) && /status:\s*429/.test(loginSource));
expect("Security response headers are configured", /Content-Security-Policy/.test(nextConfigSource) && /X-Content-Type-Options/.test(nextConfigSource));
expect("Environment files are ignored", /^\.env\*/m.test(gitignoreSource));
expect("Local database is ignored", /^\/prisma\/\*\.db$/m.test(gitignoreSource));
expect("Uploaded business files are ignored", /^\/public\/uploads\/$/m.test(gitignoreSource));
expect("Public registration endpoint is absent", !fs.existsSync(path.join(rootDir, "src/app/api/auth/register/route.ts")));

const failed = checks.filter((check) => !check.passed);
if (failed.length > 0) {
  failed.forEach((check) => console.error(`[security-check] FAILED: ${check.name}`));
  process.exitCode = 1;
} else {
  console.log(`[security-check] ${checks.length} local security regression checks passed.`);
}
