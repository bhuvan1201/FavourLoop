import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

// Only explicitly selected server settings are sent. Never print their values.
loadEnvFile(".env.local");
const settings = {
  ALLOW_DEMO: "true",
  COOKIE_SECURE: "true",
  OPENAI_MATCHING_ENABLED: "true",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
if (!settings.OPENAI_API_KEY)
  throw new Error("Set OPENAI_API_KEY locally first.");
for (const [name, value] of Object.entries(settings)) {
  const result = spawnSync(
    "npx",
    ["--yes", "vercel@65.12.1", "env", "add", name, "production", "--force"],
    {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0)
    throw new Error(`Failed to configure ${name}; check Vercel access.`);
  console.log(`Configured ${name} for production (value hidden).`);
}
