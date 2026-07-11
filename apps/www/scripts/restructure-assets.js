import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = join(import.meta.dirname, "../dist/client");
const basePathDir = join(clientDir, "openstory");

mkdirSync(basePathDir, { recursive: true });

for (const item of readdirSync(clientDir)) {
  if (item === "openstory") continue;

  const source = join(clientDir, item);
  const destination = join(basePathDir, item);
  cpSync(source, destination, { recursive: true });
  rmSync(source, { recursive: true, force: true });
}

const wranglerPath = join(import.meta.dirname, "../dist/server/wrangler.json");
const wranglerConfig = JSON.parse(readFileSync(wranglerPath, "utf8"));
wranglerConfig.routes = [
  { pattern: "eng.gobrand.app/openstory", zone_name: "gobrand.app" },
  { pattern: "eng.gobrand.app/openstory/*", zone_name: "gobrand.app" },
];
writeFileSync(wranglerPath, JSON.stringify(wranglerConfig));
