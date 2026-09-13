import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("database/mysql/001_schema.sql");
const outDir = path.resolve("supabase/migrations");
const outPath = path.join(outDir, "20260913010000_api_owned_baseline.sql");

// O schema MySQL contém comentários de documentação entre comandos. Eles não
// participam da conversão e precisam ser retirados antes do split por ';' para
// que um comentário não seja confundido com o início de uma instrução SQL.
const source = fs
  .readFileSync(sourcePath, "utf8")
  .replace(/^\s*--.*$/gm, "")
  .replace(/\n{3,}/g, "\n\n");

function splitStatements(input) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const prev = input[i - 1];
    current += char;
    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === ";") {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function convertTypeSyntax(value) {
  return value
    .replace(/\bCHAR\(36\)\b/gi, "UUID")
    .replace(/\bDATETIME\(3\)\b/gi, "TIMESTAMPTZ(3)")
    .replace(/\bTINYINT\(1\)\b/gi, "SMALLINT")
    .replace(/\bBIGINT\s+UNSIGNED\b/gi, "BIGINT")
    .replace(/\bINT\s+UNSIGNED\b/gi, "BIGINT")
    .replace(/\bLONGTEXT\b/gi, "TEXT")
    .replace(/\bDECIMAL\(/gi, "NUMERIC(")
    .replace(/\bJSON\b/gi, "JSONB")
    .replace(/\bUTC_TIMESTAMP\(3\)/gi, "CURRENT_TIMESTAMP(3)")
    .replace(/\bUTC_TIMESTAMP\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bJSON_ARRAY\(\)/gi, "'[]'::jsonb")
    .replace(/\bJSON_OBJECT\(\)/gi, "'{}'::jsonb")
    .replace(/\bDATE\('1900-01-01'\)/gi, "DATE '1900-01-01'")
    .replace(/\s+CHARACTER\s+SET\s+ascii\s+COLLATE\s+ascii_bin/gi, "")
    .replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP\(3\)/gi, "");
}

function convertIndexColumns(raw) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const prefix = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\((\d+)\)$/);
      if (prefix) return `left(${prefix[1]}, ${prefix[2]})`;
      return part;
    })
    .join(", ");
}

const statements = splitStatements(source)
  .filter((statement) => statement && !/^SET\s+/i.test(statement));

const output = [];
const postTableStatements = [];
const updatedAtTables = new Set();
const seenTables = new Set();

output.push("-- SEGEMPAT · Supabase/PostgreSQL · baseline API-owned");
output.push("-- Gerado a partir de database/mysql/001_schema.sql para preservar a estrutura funcional atual.");
output.push("-- A edição Supabase mantém Frontend -> API SEGEMPAT -> PostgreSQL; o frontend não recebe credenciais de banco.");
output.push("SET TIME ZONE 'UTC';");
output.push("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
output.push("");

for (const original of statements) {
  if (!/^CREATE\s+TABLE\s+/i.test(original)) {
    const converted = convertTypeSyntax(original)
      .replace(/\s+ENGINE=InnoDB\s+DEFAULT\s+CHARSET=utf8mb4\s+COLLATE=utf8mb4_unicode_ci/gi, "");
    if (converted.trim()) output.push(`${converted.replace(/;$/, "")};`, "");
    continue;
  }

  const tableMatch = original.match(/^CREATE\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i);
  if (!tableMatch) throw new Error(`CREATE TABLE não reconhecido: ${original.slice(0, 120)}`);
  const table = tableMatch[1];
  seenTables.add(table);

  const open = original.indexOf("(");
  const engineIndex = original.search(/\)\s*ENGINE=/i);
  const close = engineIndex >= 0 ? engineIndex : original.lastIndexOf(")");
  if (open < 0 || close < open) throw new Error(`Bloco de tabela inválido: ${table}`);
  let body = original.slice(open + 1, close);

  // No PostgreSQL a regra do desafio diário fica melhor como índice único parcial,
  // evitando depender de uma coluna gerada com formatação de data específica do MySQL.
  body = body.replace(
    /,?\s*daily_challenge_guard\s+VARCHAR\(100\)\s+GENERATED\s+ALWAYS\s+AS\s*\([\s\S]*?\)\s*STORED\s*,?/i,
    ",",
  );

  const rawLines = body.split("\n");
  const kept = [];
  for (let rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;
    const hadComma = line.endsWith(",");
    if (hadComma) line = line.slice(0, -1).trim();

    const uniqueKey = line.match(/^UNIQUE\s+KEY\s+([A-Za-z0-9_]+)\s*\((.+)\)$/i);
    if (uniqueKey) {
      const [, name, colsRaw] = uniqueKey;
      if (name === "training_activity_daily_challenge_unique_idx") {
        postTableStatements.push(
          `CREATE UNIQUE INDEX ${name} ON ${table} (user_id, activity_day) WHERE activity_type = 'Desafio Diário' AND activity_day IS NOT NULL;`,
        );
      } else if (/\w+\(\d+\)/.test(colsRaw)) {
        postTableStatements.push(`CREATE UNIQUE INDEX ${name} ON ${table} (${convertIndexColumns(colsRaw)});`);
      } else {
        kept.push(`CONSTRAINT ${name} UNIQUE (${colsRaw})`);
      }
      continue;
    }

    const normalKey = line.match(/^KEY\s+([A-Za-z0-9_]+)\s*\((.+)\)$/i);
    if (normalKey) {
      const [, name, colsRaw] = normalKey;
      postTableStatements.push(`CREATE INDEX ${name} ON ${table} (${convertIndexColumns(colsRaw)});`);
      continue;
    }

    if (/^updated_at\s+/i.test(line) && /ON\s+UPDATE\s+CURRENT_TIMESTAMP/i.test(line)) {
      updatedAtTables.add(table);
    }

    line = convertTypeSyntax(line);
    kept.push(line);
  }

  output.push(`CREATE TABLE ${table} (`);
  output.push(kept.map((line) => `  ${line}`).join(",\n"));
  output.push(");", "");
}

output.push(...postTableStatements, "");

output.push(`CREATE OR REPLACE FUNCTION public.segempat_set_updated_at()\nRETURNS trigger\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NEW.updated_at = CURRENT_TIMESTAMP(3);\n  RETURN NEW;\nEND;\n$$;`, "");

for (const table of [...updatedAtTables].sort()) {
  output.push(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table};`);
  output.push(`CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();`, "");
}

output.push("-- Compatibilidade semântica com os flags 0/1 usados pela API atual.");
output.push("-- A migração para BOOLEAN pode ser feita depois da homologação sem alterar a interface da aplicação.");
output.push("");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${output.join("\n")}\n`, "utf8");
console.log(`Baseline PostgreSQL gerado em ${outPath}`);
console.log(`Tabelas convertidas: ${seenTables.size}`);
console.log(`Índices extraídos: ${postTableStatements.length}`);
console.log(`Triggers updated_at: ${updatedAtTables.size}`);
