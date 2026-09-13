import { readFile, writeFile } from "node:fs/promises";

const files = ["bun.lock", "server/package-lock.json"];
const officialRegistry = "https://registry.npmjs.org/";
const legacyCachePattern = /https:\/\/[a-z0-9-]+-npm\.pkg\.dev\/[^/\s"']+\/sandbox-npm-cache\//gi;
const forbiddenRegistryMarkers = ["npm.pkg.dev", "sandbox-npm-cache"];

let changed = 0;

for (const file of files) {
  const original = await readFile(file, "utf8");
  legacyCachePattern.lastIndex = 0;
  const normalized = original.replace(legacyCachePattern, officialRegistry);

  for (const marker of forbiddenRegistryMarkers) {
    if (normalized.toLowerCase().includes(marker)) {
      throw new Error(`Fonte de pacote externa não permitida ainda presente em ${file}`);
    }
  }

  if (file.endsWith("package-lock.json")) {
    const lock = JSON.parse(normalized);
    for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
      const resolved = metadata?.resolved;
      if (typeof resolved !== "string" || !resolved.startsWith("http")) continue;
      if (!resolved.startsWith(officialRegistry)) {
        throw new Error(`Pacote ${packagePath || "<root>"} aponta para registro não autorizado em ${file}`);
      }
    }
  }

  if (normalized !== original) {
    await writeFile(file, normalized, "utf8");
    changed += 1;
  }
}

console.log(`Registro oficial npm validado; ${changed} lockfile(s) normalizado(s) neste checkout.`);
