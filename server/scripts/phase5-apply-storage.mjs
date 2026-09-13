import fs from "node:fs/promises";

async function read(file) {
  return fs.readFile(file, "utf8");
}

async function write(file, content) {
  await fs.writeFile(file, content, "utf8");
}

async function replaceExact(file, before, after) {
  const content = await read(file);
  const first = content.indexOf(before);
  if (first < 0) throw new Error(`Trecho não encontrado em ${file}`);
  if (content.indexOf(before, first + before.length) >= 0) throw new Error(`Trecho duplicado em ${file}`);
  await write(file, `${content.slice(0, first)}${after}${content.slice(first + before.length)}`);
}

const storageSource = `import fs from "node:fs/promises";
import { createHash, createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";

function safeObjectPath(value) {
  const text = String(value ?? "").trim().replaceAll("\\\\", "/");
  if (!text || text.startsWith("/") || text.includes("\\0")) throw new Error("Caminho de storage inválido");
  const segments = text.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Caminho de storage inválido");
  return segments.join("/");
}

function storageError(message, code, status = null) {
  const error = new Error(message);
  error.code = code;
  if (status != null) error.status = status;
  return error;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding = undefined) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\\.\\d{3}/g, "");
}

function encodePath(pathname) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) => \`%\${character.charCodeAt(0).toString(16).toUpperCase()}\`))
    .join("/");
}

async function signedS3Request(method, objectPath, { body = null, contentType = null } = {}) {
  const objectKey = safeObjectPath(objectPath);
  const endpoint = new URL(config.storage.s3Endpoint);
  const bucket = encodeURIComponent(config.storage.bucket);
  const key = encodePath(objectKey);
  const basePath = endpoint.pathname.replace(/\\/$/, "");
  const canonicalUri = \`\${basePath}/\${bucket}/\${key}\`;
  const requestUrl = new URL(endpoint.toString());
  requestUrl.pathname = canonicalUri;
  requestUrl.search = "";

  const payload = body == null ? Buffer.alloc(0) : Buffer.from(body);
  const payloadHash = sha256(payload);
  const timestamp = amzTimestamp();
  const dateStamp = timestamp.slice(0, 8);
  const host = requestUrl.host;
  const canonicalHeaders = \`host:\${host}\\nx-amz-content-sha256:\${payloadHash}\\nx-amz-date:\${timestamp}\\n\`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\\n");
  const scope = \`\${dateStamp}/\${config.storage.s3Region}/s3/aws4_request\`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonicalRequest)].join("\\n");
  const kDate = hmac(\`AWS4\${config.storage.s3SecretAccessKey}\`, dateStamp);
  const kRegion = hmac(kDate, config.storage.s3Region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");

  const headers = {
    Authorization: \`AWS4-HMAC-SHA256 Credential=\${config.storage.s3AccessKeyId}/\${scope}, SignedHeaders=\${signedHeaders}, Signature=\${signature}\`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp,
  };
  if (contentType) headers["Content-Type"] = contentType;

  const response = await fetch(requestUrl, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : payload,
  });
  if (response.status === 404) throw storageError("Objeto de storage não encontrado", "STORAGE_NOT_FOUND", 404);
  if (!response.ok) throw storageError(\`Supabase Storage respondeu HTTP \${response.status}\`, "STORAGE_REMOTE_ERROR", response.status);
  return response;
}

function filesystemPath(objectPath) {
  const objectKey = safeObjectPath(objectPath);
  const root = path.resolve(config.storage.path);
  const candidate = path.resolve(root, objectKey);
  if (!candidate.startsWith(\`\${root}\${path.sep}\`)) throw new Error("Caminho de storage inválido");
  return { root, candidate, objectKey };
}

async function filesystemPut(objectPath, bytes) {
  const { candidate } = filesystemPath(objectPath);
  await fs.mkdir(path.dirname(candidate), { recursive: true });
  await fs.writeFile(candidate, Buffer.from(bytes), { mode: 0o600, flag: "wx" });
}

async function filesystemGet(objectPath) {
  const { root, candidate } = filesystemPath(objectPath);
  try {
    const [realRoot, realCandidate] = await Promise.all([fs.realpath(root), fs.realpath(candidate)]);
    if (!realCandidate.startsWith(\`\${realRoot}\${path.sep}\`)) throw new Error("Caminho de storage inválido");
    const stat = await fs.stat(realCandidate);
    if (!stat.isFile()) throw storageError("Objeto de storage não encontrado", "STORAGE_NOT_FOUND", 404);
    return fs.readFile(realCandidate);
  } catch (error) {
    if (error?.code === "ENOENT") throw storageError("Objeto de storage não encontrado", "STORAGE_NOT_FOUND", 404);
    throw error;
  }
}

async function filesystemDelete(objectPath) {
  const { candidate } = filesystemPath(objectPath);
  await fs.rm(candidate, { force: true });
}

async function supabasePut(objectPath, bytes, { contentType = "application/octet-stream" } = {}) {
  await signedS3Request("PUT", objectPath, { body: bytes, contentType });
}

async function supabaseGet(objectPath) {
  const response = await signedS3Request("GET", objectPath);
  return Buffer.from(await response.arrayBuffer());
}

async function supabaseDelete(objectPath) {
  try {
    await signedS3Request("DELETE", objectPath);
  } catch (error) {
    if (error?.code !== "STORAGE_NOT_FOUND") throw error;
  }
}

const provider = config.storage.driver === "supabase"
  ? { put: supabasePut, get: supabaseGet, remove: supabaseDelete }
  : { put: filesystemPut, get: filesystemGet, remove: filesystemDelete };

export const storage = {
  driver: config.storage.driver,
  bucket: config.storage.bucket,
  async putPrivate(objectPath, bytes, options = {}) {
    return provider.put(safeObjectPath(objectPath), bytes, options);
  },
  async getPrivate(objectPath) {
    return provider.get(safeObjectPath(objectPath));
  },
  async deletePrivate(objectPath) {
    return provider.remove(safeObjectPath(objectPath));
  },
  async readinessProbe() {
    const objectPath = \`.segempat-readiness/\${randomUUID()}.txt\`;
    const expected = Buffer.from("segempat-storage-readiness", "utf8");
    try {
      await provider.put(objectPath, expected, { contentType: "text/plain" });
      const actual = await provider.get(objectPath);
      if (!Buffer.from(actual).equals(expected)) throw new Error("Storage de evidências falhou na verificação de leitura");
    } finally {
      await provider.remove(objectPath).catch(() => {});
    }
  },
};
`;

await write("server/src/storage.js", storageSource);

await replaceExact(
  "server/src/config.js",
  `const storageDriver = String(process.env["SEGEMPAT_STORAGE_DRIVER"] || "filesystem").trim().toLowerCase();
if (storageDriver !== "filesystem") {
  console.error(\`[segempat-api] SEGEMPAT_STORAGE_DRIVER não suportado nesta etapa: \${storageDriver || "vazio"}. Use filesystem\`);
  process.exit(1);
}

const storagePath = String(process.env["SEGEMPAT_STORAGE_PATH"] || "./storage").trim();
if (!storagePath) {
  console.error("[segempat-api] SEGEMPAT_STORAGE_PATH não pode ficar vazio");
  process.exit(1);
}
if (nodeEnv === "production" && !path.isAbsolute(storagePath)) {
  console.error("[segempat-api] SEGEMPAT_STORAGE_PATH deve ser absoluto em produção");
  process.exit(1);
}
`,
  `const storageDriver = String(process.env["SEGEMPAT_STORAGE_DRIVER"] || "filesystem").trim().toLowerCase();
if (!["filesystem", "supabase"].includes(storageDriver)) {
  console.error(\`[segempat-api] SEGEMPAT_STORAGE_DRIVER inválido: \${storageDriver || "vazio"}. Use filesystem ou supabase\`);
  process.exit(1);
}

const storagePath = String(process.env["SEGEMPAT_STORAGE_PATH"] || "./storage").trim();
const storageBucket = String(process.env["SEGEMPAT_STORAGE_BUCKET"] || "segempat-evidence").trim();
const s3Endpoint = String(process.env["SUPABASE_STORAGE_S3_ENDPOINT"] || "").trim();
const s3Region = String(process.env["SUPABASE_STORAGE_S3_REGION"] || "").trim();
const s3AccessKeyId = String(process.env["SUPABASE_STORAGE_S3_ACCESS_KEY_ID"] || "").trim();
const s3SecretAccessKey = String(process.env["SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY"] || "").trim();

if (storageDriver === "filesystem") {
  if (!storagePath) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_PATH não pode ficar vazio");
    process.exit(1);
  }
  if (nodeEnv === "production" && !path.isAbsolute(storagePath)) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_PATH deve ser absoluto em produção");
    process.exit(1);
  }
} else {
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(storageBucket)) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_BUCKET inválido");
    process.exit(1);
  }
  if (!s3Endpoint || !s3Region || !s3AccessKeyId || !s3SecretAccessKey) {
    console.error("[segempat-api] Storage Supabase exige endpoint, região e credenciais S3 server-side");
    process.exit(1);
  }
  try {
    const parsed = new URL(s3Endpoint);
    if (parsed.protocol !== "https:" || !parsed.hostname || !parsed.pathname.endsWith("/storage/v1/s3")) throw new Error("invalid endpoint");
  } catch {
    console.error("[segempat-api] SUPABASE_STORAGE_S3_ENDPOINT deve ser HTTPS e terminar com /storage/v1/s3");
    process.exit(1);
  }
  rejectProductionPlaceholder("SUPABASE_STORAGE_S3_ACCESS_KEY_ID", s3AccessKeyId, ["CHANGE_ME"]);
  rejectProductionPlaceholder("SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY", s3SecretAccessKey, ["CHANGE_ME"]);
}
`,
);

await replaceExact(
  "server/src/config.js",
  `  storage: {
    driver: storageDriver,
    path: storagePath,
  },`,
  `  storage: {
    driver: storageDriver,
    path: storagePath,
    bucket: storageBucket,
    s3Endpoint,
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
  },`,
);

await replaceExact(
  "server/src/app.js",
  `import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";`,
  `import { createHash } from "node:crypto";`,
);
await replaceExact(
  "server/src/app.js",
  `import { config } from "./config.js";
import { healthcheck, query, queryOne } from "./db.js";`,
  `import { config } from "./config.js";
import { healthcheck, query, queryOne } from "./db.js";
import { storage } from "./storage.js";`,
);
await replaceExact(
  "server/src/app.js",
  `async function verifyStorageReadiness() {
  const storageRoot = path.resolve(config.storage.path);
  const stat = await fs.stat(storageRoot);
  if (!stat.isDirectory()) throw new Error("Storage de evidências não é um diretório");
  await fs.access(storageRoot, fsConstants.R_OK | fsConstants.W_OK);

  const probePath = path.join(storageRoot, \`.segempat-readiness-\${randomUUID()}.tmp\`);
  try {
    await fs.writeFile(probePath, "segempat-readiness", { encoding: "utf8", flag: "wx", mode: 0o600 });
    const probe = await fs.readFile(probePath, "utf8");
    if (probe !== "segempat-readiness") throw new Error("Storage de evidências falhou na verificação de leitura");
  } finally {
    await fs.rm(probePath, { force: true }).catch(() => {});
  }
}`,
  `async function verifyStorageReadiness() {
  await storage.readinessProbe();
}`,
);

await replaceExact(
  "server/src/routes/exams.js",
  `import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";`,
  `import { Router } from "express";`,
);
await replaceExact(
  "server/src/routes/exams.js",
  `import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db.js";`,
  `import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db.js";
import { storage } from "../storage.js";`,
);
await replaceExact(
  "server/src/routes/exams.js",
  `  if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");
`,
  ``,
);
await replaceExact(
  "server/src/routes/exams.js",
  `  const absolutePath = path.resolve(config.storage.path, relativePath);
  const storageRoot = path.resolve(config.storage.path);
  if (!absolutePath.startsWith(\`\${storageRoot}\${path.sep}\`)) throw badRequest("Caminho de assinatura inválido");
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes, { mode: 0o600, flag: "wx" });`,
  `  await storage.putPrivate(relativePath, bytes, { contentType: "image/png" });`,
);
await replaceExact(
  "server/src/routes/exams.js",
  `    await fs.unlink(absolutePath).catch(() => {});`,
  `    await storage.deletePrivate(relativePath).catch(() => {});`,
);

await replaceExact(
  "server/src/routes/exam-evidence.js",
  `import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";`,
  `import { Router } from "express";
import { storage } from "../storage.js";`,
);
await replaceExact(
  "server/src/routes/exam-evidence.js",
  `    if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");
`,
  ``,
);
await replaceExact(
  "server/src/routes/exam-evidence.js",
  `    const storageRoot = path.resolve(config.storage.path);
    const candidatePath = path.resolve(storageRoot, requested);
    if (!candidatePath.startsWith(\`\${storageRoot}\${path.sep}\`)) throw badRequest("Caminho de assinatura inválido");

    try {
      const [storageRootReal, absolutePath] = await Promise.all([fs.realpath(storageRoot), fs.realpath(candidatePath)]);
      if (!absolutePath.startsWith(\`\${storageRootReal}\${path.sep}\`)) throw badRequest("Caminho de assinatura inválido");
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile() || stat.size < MIN_SIGNATURE_BYTES || stat.size > MAX_SIGNATURE_BYTES) throw notFound("Assinatura não encontrada");
      const bytes = await fs.readFile(absolutePath);
      if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw notFound("Assinatura não encontrada");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", "inline; filename=assinatura.png");
      res.send(bytes);
    } catch (error) {
      if (error?.code === "ENOENT") throw notFound("Assinatura não encontrada");
      throw error;
    }`,
  `    try {
      const bytes = await storage.getPrivate(requested);
      if (bytes.length < MIN_SIGNATURE_BYTES || bytes.length > MAX_SIGNATURE_BYTES) throw notFound("Assinatura não encontrada");
      if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw notFound("Assinatura não encontrada");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", "inline; filename=assinatura.png");
      res.send(bytes);
    } catch (error) {
      if (error?.code === "STORAGE_NOT_FOUND") throw notFound("Assinatura não encontrada");
      throw error;
    }`,
);

await replaceExact(
  "server/src/routes/occurrence-integrity.js",
  `import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";`,
  `import { Router } from "express";
import { storage } from "../storage.js";`,
);
for (let index = 0; index < 2; index += 1) {
  const file = "server/src/routes/occurrence-integrity.js";
  const content = await read(file);
  const needle = `    if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");\n`;
  if (!content.includes(needle)) throw new Error(`Trecho de driver não encontrado em ${file}`);
  await write(file, content.replace(needle, ""));
}
await replaceExact(
  "server/src/routes/occurrence-integrity.js",
  `    const storageRoot = path.resolve(config.storage.path);
    const absolutePath = path.resolve(storageRoot, relativePath);
    if (!absolutePath.startsWith(\`\${storageRoot}\${path.sep}\`)) throw badRequest("Caminho de evidência inválido");

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, decoded.bytes, { mode: 0o600, flag: "wx" });`,
  `    await storage.putPrivate(relativePath, decoded.bytes, { contentType: decoded.mimeType });`,
);
await replaceExact(
  "server/src/routes/occurrence-integrity.js",
  `      await fs.rm(absolutePath, { force: true }).catch(() => {});`,
  `      await storage.deletePrivate(relativePath).catch(() => {});`,
);
await replaceExact(
  "server/src/routes/occurrence-integrity.js",
  `    const storageRoot = path.resolve(config.storage.path);
    const candidatePath = path.resolve(storageRoot, requested);
    if (!candidatePath.startsWith(\`\${storageRoot}\${path.sep}\`)) throw badRequest("Caminho de evidência inválido");

    try {
      const [storageRootReal, absolutePath] = await Promise.all([fs.realpath(storageRoot), fs.realpath(candidatePath)]);
      if (!absolutePath.startsWith(\`\${storageRootReal}\${path.sep}\`)) throw badRequest("Caminho de evidência inválido");
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile() || stat.size < MIN_ATTACHMENT_BYTES || stat.size > MAX_ATTACHMENT_BYTES) throw notFound("Evidência fotográfica não encontrada");
      const bytes = await fs.readFile(absolutePath);
      const validPng = bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
      const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if ((attachment.mime_type === "image/png" && !validPng) || (attachment.mime_type === "image/jpeg" && !validJpeg)) {
        throw notFound("Evidência fotográfica não encontrada");
      }
      res.setHeader("Content-Type", attachment.mime_type);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", \`inline; filename=evidencia.\${attachment.mime_type === "image/png" ? "png" : "jpg"}\`);
      res.send(bytes);
    } catch (error) {
      if (error?.code === "ENOENT") throw notFound("Evidência fotográfica não encontrada");
      throw error;
    }`,
  `    try {
      const bytes = await storage.getPrivate(requested);
      if (bytes.length < MIN_ATTACHMENT_BYTES || bytes.length > MAX_ATTACHMENT_BYTES) throw notFound("Evidência fotográfica não encontrada");
      const validPng = bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
      const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if ((attachment.mime_type === "image/png" && !validPng) || (attachment.mime_type === "image/jpeg" && !validJpeg)) {
        throw notFound("Evidência fotográfica não encontrada");
      }
      res.setHeader("Content-Type", attachment.mime_type);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", \`inline; filename=evidencia.\${attachment.mime_type === "image/png" ? "png" : "jpg"}\`);
      res.send(bytes);
    } catch (error) {
      if (error?.code === "STORAGE_NOT_FOUND") throw notFound("Evidência fotográfica não encontrada");
      throw error;
    }`,
);

await replaceExact(
  "server/.env.example",
  `# Evidências continuam privadas e mediadas pela API nesta etapa.
# A migração para Supabase Storage será feita separadamente, sem tornar o bucket público.
SEGEMPAT_STORAGE_DRIVER=filesystem
SEGEMPAT_STORAGE_PATH=/var/lib/segempat/storage
`,
  `# Evidências são sempre privadas e mediadas pela API.
# Produção Supabase: use o driver supabase e credenciais S3 exclusivas do backend.
# Gere as credenciais em Storage > S3 Configuration; nunca use estas variáveis no frontend/VITE_*.
SEGEMPAT_STORAGE_DRIVER=supabase
SEGEMPAT_STORAGE_BUCKET=segempat-evidence
SUPABASE_STORAGE_S3_ENDPOINT=https://PROJECT_REF.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_S3_REGION=sa-east-1
SUPABASE_STORAGE_S3_ACCESS_KEY_ID=CHANGE_ME
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY=CHANGE_ME

# Desenvolvimento/CI pode continuar usando filesystem:
# SEGEMPAT_STORAGE_DRIVER=filesystem
# SEGEMPAT_STORAGE_PATH=/var/lib/segempat/storage
`,
);

const checklist = await read("SUPABASE_REAL_PROJECT_CHECKLIST.md");
if (!checklist.includes("## Fase 5 · Storage privado pela API")) {
  await write(
    "SUPABASE_REAL_PROJECT_CHECKLIST.md",
    `${checklist.trimEnd()}\n\n## Fase 5 · Storage privado pela API\n\n- [x] Bucket \`segempat-evidence\` criado como privado, com limite de 1,5 MB e MIME PNG/JPEG.\n- [x] API preparada para driver \`supabase\` via endpoint S3 compatível, sem expor credenciais ao frontend.\n- [x] Assinaturas e evidências de ocorrências passam pela abstração server-side; downloads continuam autorizados pela API e usam \`Cache-Control: private, no-store\`.\n- [x] Readiness do storage passa a executar escrita + leitura + remoção de probe no driver ativo.\n- [ ] Gerar credenciais S3 próprias do backend e armazená-las somente no secret manager do host da API.\n- [ ] Validar upload/download/rollback no bucket real com a API hospedada e credenciais reais.\n\n> Não inserir Access Key ID ou Secret Access Key em Git, chat, frontend ou variáveis \`VITE_*\`.\n`
  );
}

// Remove os artefatos temporários usados apenas para aplicar este patch no branch.
await fs.rm(".phase5-apply-storage", { force: true });
await fs.rm(".github/workflows/phase5-apply-storage.yml", { force: true });
await fs.rm("server/scripts/phase5-apply-storage.mjs", { force: true });

console.log("Phase 5 private storage patch applied.");
