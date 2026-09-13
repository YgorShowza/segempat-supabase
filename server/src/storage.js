import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const READINESS_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function normalizeObjectPath(value) {
  const raw = String(value ?? "").trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/") || raw.includes("\0")) throw new Error("Caminho de storage inválido");
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Caminho de storage inválido");
  }
  return normalized;
}

function encodeObjectPath(value) {
  return normalizeObjectPath(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function filesystemAbsolutePath(rootPath, objectPath) {
  const storageRoot = path.resolve(rootPath);
  const candidate = path.resolve(storageRoot, normalizeObjectPath(objectPath));
  if (candidate !== storageRoot && !candidate.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Caminho de storage inválido");
  }
  return { storageRoot, candidate };
}

async function responseError(response, action) {
  let details = "";
  try {
    const payload = await response.json();
    details = String(payload?.message || payload?.error || payload?.code || "").trim();
  } catch {
    details = String(await response.text().catch(() => "")).trim();
  }
  const error = new Error(`${action} falhou no Supabase Storage (${response.status})${details ? `: ${details}` : ""}`);
  error.status = response.status;
  return error;
}

function supabaseHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    ...extra,
  };
}

function createFilesystemAdapter(storageConfig) {
  const rootPath = storageConfig.path;
  return {
    driver: "filesystem",
    async write(objectPath, bytes, { contentType: _contentType } = {}) {
      const { candidate } = filesystemAbsolutePath(rootPath, objectPath);
      await fs.mkdir(path.dirname(candidate), { recursive: true });
      await fs.writeFile(candidate, bytes, { mode: 0o600, flag: "wx" });
      return normalizeObjectPath(objectPath);
    },
    async read(objectPath) {
      const { storageRoot, candidate } = filesystemAbsolutePath(rootPath, objectPath);
      const [rootReal, objectReal] = await Promise.all([fs.realpath(storageRoot), fs.realpath(candidate)]);
      if (!objectReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Caminho de storage inválido");
      const stat = await fs.stat(objectReal);
      if (!stat.isFile()) throw Object.assign(new Error("Objeto de storage não encontrado"), { code: "ENOENT" });
      return fs.readFile(objectReal);
    },
    async remove(objectPath) {
      const { candidate } = filesystemAbsolutePath(rootPath, objectPath);
      await fs.rm(candidate, { force: true });
    },
    async probe() {
      const root = path.resolve(rootPath);
      await fs.mkdir(root, { recursive: true });
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) throw new Error("Storage de evidências não é um diretório");
      await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
      const probePath = `.segempat-readiness-${randomUUID()}.png`;
      try {
        await this.write(probePath, READINESS_PNG, { contentType: "image/png" });
        const bytes = await this.read(probePath);
        if (!Buffer.from(bytes).equals(READINESS_PNG)) throw new Error("Storage de evidências falhou na verificação de leitura");
      } finally {
        await this.remove(probePath).catch(() => {});
      }
    },
  };
}

function createSupabaseAdapter(storageConfig, fetchImpl) {
  const baseUrl = storageConfig.supabaseUrl.replace(/\/$/, "");
  const bucket = storageConfig.bucket;
  const secretKey = storageConfig.secretKey;
  const bucketPath = encodeURIComponent(bucket);

  return {
    driver: "supabase",
    async write(objectPath, bytes, { contentType = "application/octet-stream" } = {}) {
      const encoded = encodeObjectPath(objectPath);
      const response = await fetchImpl(`${baseUrl}/storage/v1/object/${bucketPath}/${encoded}`, {
        method: "POST",
        headers: supabaseHeaders(secretKey, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "x-upsert": "false",
        }),
        body: Buffer.from(bytes),
      });
      if (!response.ok) throw await responseError(response, "Upload de evidência");
      return normalizeObjectPath(objectPath);
    },
    async read(objectPath) {
      const encoded = encodeObjectPath(objectPath);
      const response = await fetchImpl(`${baseUrl}/storage/v1/object/authenticated/${bucketPath}/${encoded}`, {
        method: "GET",
        headers: supabaseHeaders(secretKey),
      });
      if (!response.ok) {
        const error = await responseError(response, "Leitura de evidência");
        if (response.status === 404) error.code = "ENOENT";
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(objectPath) {
      const normalized = normalizeObjectPath(objectPath);
      const response = await fetchImpl(`${baseUrl}/storage/v1/object/${bucketPath}`, {
        method: "DELETE",
        headers: supabaseHeaders(secretKey, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: [normalized] }),
      });
      if (!response.ok && response.status !== 404) throw await responseError(response, "Remoção de evidência");
    },
    async probe() {
      const probePath = `health/.segempat-readiness-${randomUUID()}.png`;
      try {
        await this.write(probePath, READINESS_PNG, { contentType: "image/png" });
        const bytes = await this.read(probePath);
        if (!Buffer.from(bytes).equals(READINESS_PNG)) throw new Error("Supabase Storage falhou na verificação de leitura");
      } finally {
        await this.remove(probePath).catch(() => {});
      }
    },
  };
}

export function createStorageAdapter(storageConfig, { fetchImpl = globalThis.fetch } = {}) {
  if (storageConfig.driver === "filesystem") return createFilesystemAdapter(storageConfig);
  if (storageConfig.driver === "supabase") {
    if (typeof fetchImpl !== "function") throw new Error("Fetch indisponível para Supabase Storage");
    return createSupabaseAdapter(storageConfig, fetchImpl);
  }
  throw new Error(`Driver de storage não suportado: ${storageConfig.driver}`);
}

export const storage = createStorageAdapter(config.storage);
