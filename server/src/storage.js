import fs from "node:fs/promises";
import { createHash, createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";

function safeObjectPath(value) {
  const text = String(value ?? "").trim().replaceAll("\\", "/");
  if (!text || text.startsWith("/") || text.includes("\0")) throw new Error("Caminho de storage inválido");
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
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodePath(pathname) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

async function signedS3Request(method, objectPath, { body = null, contentType = null } = {}) {
  const objectKey = safeObjectPath(objectPath);
  const endpoint = new URL(config.storage.s3Endpoint);
  const bucket = encodeURIComponent(config.storage.bucket);
  const key = encodePath(objectKey);
  const basePath = endpoint.pathname.replace(/\/$/, "");
  const canonicalUri = `${basePath}/${bucket}/${key}`;
  const requestUrl = new URL(endpoint.toString());
  requestUrl.pathname = canonicalUri;
  requestUrl.search = "";

  const payload = body == null ? Buffer.alloc(0) : Buffer.from(body);
  const payloadHash = sha256(payload);
  const timestamp = amzTimestamp();
  const dateStamp = timestamp.slice(0, 8);
  const host = requestUrl.host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.storage.s3Region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${config.storage.s3SecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.storage.s3Region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");

  const headers = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.storage.s3AccessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
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
  if (!response.ok) throw storageError(`Supabase Storage respondeu HTTP ${response.status}`, "STORAGE_REMOTE_ERROR", response.status);
  return response;
}

function filesystemPath(objectPath) {
  const objectKey = safeObjectPath(objectPath);
  const root = path.resolve(config.storage.path);
  const candidate = path.resolve(root, objectKey);
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error("Caminho de storage inválido");
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
    if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) throw new Error("Caminho de storage inválido");
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
    const objectPath = `.segempat-readiness/${randomUUID()}.txt`;
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
