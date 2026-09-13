import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const contractDir = path.join(root, ".github", "contracts");

if (!fs.existsSync(contractDir)) {
  console.error("Diretório de contratos ausente: .github/contracts");
  process.exit(1);
}

const files = fs
  .readdirSync(contractDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error("Nenhum contrato YAML encontrado em .github/contracts");
  process.exit(1);
}

function leadingSpaces(value) {
  return value.match(/^\s*/)?.[0].length ?? 0;
}

function extractRunBlocks(source, filename) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^\s*working-directory\s*:/.test(line)) {
      throw new Error(`${filename}:${index + 1}: working-directory não é suportado pela suíte consolidada`);
    }
    if (/^\s*continue-on-error\s*:/.test(line)) {
      throw new Error(`${filename}:${index + 1}: continue-on-error não é suportado pela suíte consolidada`);
    }

    const uses = line.match(/^\s*uses:\s*(\S+)\s*$/);
    if (uses && !["actions/checkout@v4", "actions/setup-node@v4"].includes(uses[1])) {
      throw new Error(`${filename}:${index + 1}: action não suportada pela suíte consolidada: ${uses[1]}`);
    }

    if (/^\s*run:\s*[>|]/.test(line) && !/^\s*run:\s*\|\s*$/.test(line)) {
      throw new Error(`${filename}:${index + 1}: somente run: | é suportado para blocos multilinha`);
    }

    const multiline = line.match(/^(\s*)run:\s*\|\s*$/);
    if (multiline) {
      const keyIndent = multiline[1].length;
      const body = [];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const candidate = lines[cursor];

        if (candidate.trim() === "") {
          body.push("");
          cursor += 1;
          continue;
        }

        if (leadingSpaces(candidate) <= keyIndent) break;
        body.push(candidate);
        cursor += 1;
      }

      const nonEmpty = body.filter((item) => item.trim() !== "");
      if (nonEmpty.length === 0) {
        throw new Error(`${filename}:${index + 1}: bloco run vazio`);
      }

      const stripIndent = Math.min(...nonEmpty.map(leadingSpaces));
      const script = body
        .map((item) => (item.trim() === "" ? "" : item.slice(stripIndent)))
        .join("\n");

      blocks.push({ line: index + 1, script });
      index = cursor - 1;
      continue;
    }

    const inline = line.match(/^\s*run:\s+(.+?)\s*$/);
    if (inline) {
      const script = inline[1];
      if (script.startsWith("|") || script.startsWith(">")) continue;
      blocks.push({ line: index + 1, script });
    }
  }

  return blocks;
}

let failures = 0;
let executedBlocks = 0;

for (const filename of files) {
  const relativePath = path.posix.join(".github/contracts", filename);
  const source = fs.readFileSync(path.join(contractDir, filename), "utf8");
  let blocks;

  try {
    blocks = extractRunBlocks(source, relativePath);
  } catch (error) {
    console.error(`::error file=${relativePath}::${error.message}`);
    failures += 1;
    continue;
  }

  if (blocks.length === 0) {
    console.error(`::error file=${relativePath}::Nenhum passo run encontrado`);
    failures += 1;
    continue;
  }

  console.log(`::group::${filename}`);

  for (const block of blocks) {
    executedBlocks += 1;
    console.log(`Executando contrato ${relativePath}:${block.line}`);

    const result = spawnSync("bash", ["-c", `set -euo pipefail\n${block.script}`], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`::error file=${relativePath},line=${block.line}::Falha ao iniciar bash: ${result.error.message}`);
      failures += 1;
      continue;
    }

    if (result.status !== 0) {
      const detail = result.signal ? `sinal ${result.signal}` : `exit ${result.status}`;
      console.error(`::error file=${relativePath},line=${block.line}::Contrato falhou (${detail})`);
      failures += 1;
    }
  }

  console.log("::endgroup::");
}

if (failures > 0) {
  console.error(`SEGEMPAT Contract Suite: FALHOU (${failures} falha(s); ${executedBlocks} bloco(s) executado(s)).`);
  process.exit(1);
}

console.log(`SEGEMPAT Contract Suite: OK (${files.length} contrato(s); ${executedBlocks} bloco(s) executado(s)).`);
