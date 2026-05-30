import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { getWorkspaceForUser, listFiles, addFile, updateFile, deleteFile, deleteFilesBatch } from "../services/store.js";

const router = Router();
const ROUTES_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(ROUTES_DIR, "../..");
const UPLOADS_DIR = path.join(BACKEND_ROOT, "uploads");
const hasSupabaseStorageConfig = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_BUCKET);
const supabase = hasSupabaseStorageConfig
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const MIME_BY_EXT = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  log: "text/plain",
  conf: "text/plain",
  ini: "text/plain",
  env: "text/plain",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "text/plain",
  sql: "text/plain",
  py: "text/x-python",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  css: "text/css",
  scss: "text/plain",
  sh: "text/x-shellscript",
  bat: "text/plain",
  ps1: "text/plain",
  java: "text/x-java-source",
  c: "text/x-c",
  cpp: "text/x-c",
  cs: "text/plain",
  go: "text/plain",
  rs: "text/plain",
  php: "text/x-php",
  rb: "text/x-ruby",
  json: "application/json",
  html: "text/html",
  xml: "application/xml",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function fileExtension(name = "") {
  return String(name).split(".").pop().toLowerCase();
}

function contentTypeForFile(file) {
  return MIME_BY_EXT[fileExtension(file.name)] || file.mimeType || "application/octet-stream";
}

function safeUploadName(name = "uploaded-file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function supabaseObjectPath(workspaceId, name) {
  return `workspaces/${workspaceId}/${Date.now()}-${safeUploadName(name)}`;
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function saveBufferToUploads(name, buffer) {
  ensureUploadsDir();
  const filename = `${Date.now()}-${safeUploadName(name)}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  return {
    filePath,
    url: `/uploads/${filename}`,
  };
}

async function uploadBufferToSupabase({ workspaceId, name, mimeType, buffer }) {
  if (!supabase) {
    throw new HttpError(503, "Supabase Storage is not configured on backend");
  }

  const objectPath = supabaseObjectPath(workspaceId, name);
  const { error: uploadError } = await supabase.storage
    .from(env.SUPABASE_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data: signed, error: signedError } = await supabase.storage
    .from(env.SUPABASE_BUCKET)
    .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
  if (signedError) throw signedError;

  return {
    objectPath,
    signedUrl: signed?.signedUrl || ""
  };
}

async function deleteSupabaseObject(objectPath) {
  if (!supabase || !objectPath) return;
  const { error } = await supabase.storage
    .from(env.SUPABASE_BUCKET)
    .remove([objectPath]);
  if (error) {
    console.error("Failed to delete Supabase object:", error.message);
  }
}

async function getSignedUrlForObjectPath(objectPath) {
  if (!supabase || !objectPath) return "";
  const { data, error } = await supabase.storage
    .from(env.SUPABASE_BUCKET)
    .createSignedUrl(objectPath, 60 * 10);
  if (error) {
    console.error("Failed to create Supabase signed URL:", error.message);
    return "";
  }
  return data?.signedUrl || "";
}

function storedTextForFile(file) {
  const metadata = file.metadata || {};
  return metadata.rawText || metadata.contentText || metadata.fullText || "";
}

function sendDiskFile(res, file, filePath) {
  res.setHeader("Content-Type", contentTypeForFile(file));
  res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  return fs.createReadStream(filePath).pipe(res);
}

function localPathFromMetadataUrl(metaUrl) {
  if (!metaUrl || typeof metaUrl !== "string") return "";

  try {
    const parsed = new URL(metaUrl, "http://local.invalid");
    if (parsed.pathname.startsWith("/uploads/")) {
      const filename = path.basename(parsed.pathname);
      return filename ? path.join(UPLOADS_DIR, filename) : "";
    }
  } catch {
    if (metaUrl.startsWith("/uploads/")) {
      const filename = path.basename(metaUrl);
      return filename ? path.join(UPLOADS_DIR, filename) : "";
    }
  }

  return "";
}

function remoteUrlForFile(file) {
  const metadata = file.metadata || {};
  const candidates = [metadata.remoteUrl, metadata.originalUrl, metadata.url];
  return candidates.find((url) => {
    if (!url || typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }) || "";
}

async function restoreRemoteFileCopy({ userId, workspaceId, file }) {
  const remoteUrl = remoteUrlForFile(file);
  if (!remoteUrl) return null;

  try {
    const upstream = await axios.get(remoteUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const buffer = Buffer.from(upstream.data);
    if (!buffer.byteLength) return null;

    const saved = saveBufferToUploads(file.name, buffer);

    const metadata = {
      ...(file.metadata || {}),
      url: saved.url,
      remoteUrl,
      restoredFromRemoteAt: new Date().toISOString(),
    };

    return await updateFile(userId, workspaceId, file.id, {
      storagePath: saved.filePath,
      metadata,
      size: buffer.byteLength,
    });
  } catch (error) {
    console.error("Failed to restore remote file copy:", error.message);
    return null;
  }
}

function rowToText(row, columns = []) {
  if (Array.isArray(row)) {
    if (columns.length > 0) {
      return columns.map((column, index) => `${column}: ${row[index] ?? ""}`).join(", ");
    }
    return row.join(", ");
  }

  if (row && typeof row === "object") {
    return Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(", ");
  }

  return String(row ?? "");
}

function hasDemoPlaceholderRows(rows) {
  const flatValues = rows.flat().map((value) => String(value).toLowerCase());
  return (
    rows.length === 2 &&
    flatValues.includes("variable_a") &&
    flatValues.includes("variable_b") &&
    flatValues.includes("10.4") &&
    flatValues.includes("22.8")
  );
}

function buildIngestContent(file) {
  const metadata = file.metadata || {};
  const columns = Array.isArray(metadata.columns) ? metadata.columns : [];
  const storedRows = Array.isArray(metadata.rows) ? metadata.rows : [];
  const topics = Array.isArray(metadata.topics) ? metadata.topics : [];
  const rawText = metadata.rawText || metadata.contentText || metadata.fullText || "";
  const rows = !rawText && hasDemoPlaceholderRows(storedRows) ? [] : storedRows;
  const parts = [
    `File: ${file.name}`,
    `Type: ${metadata.type || file.mimeType || "unknown"}`
  ];

  if (rawText) parts.push(`Full document content:\n${rawText}`);
  if (columns.length) parts.push(`Columns: ${columns.join(", ")}`);
  if (metadata.summary) parts.push(`Summary: ${metadata.summary}`);
  if (metadata.insights) parts.push(`Insights: ${metadata.insights}`);
  if (topics.length) parts.push(`Topics: ${topics.join(", ")}`);
  if (rows.length) parts.push(`Rows:\n${rows.map((row) => rowToText(row, columns)).join("\n")}`);

  if (parts.length <= 2) {
    parts.push(`Metadata: ${JSON.stringify(metadata)}`);
  }

  return parts.filter(Boolean).join("\n");
}

async function ingestFileForRag({ user, workspaceId, file }) {
  await axios.post(
    `${env.AI_SERVICE_URL}/ingest`,
    {
      workspace_id: workspaceId,
      file_id: file.id,
      file_name: file.name,
      content: buildIngestContent(file),
      metadata: file.metadata || {},
      gemini_api_key: user.api_key_gemini || env.GEMINI_API_KEY || null
    },
    {
      timeout: 300000
    }
  );
}

async function deleteFilesFromRag(workspaceId, fileIdsOrNames) {
  try {
    await axios.post(
      `${env.AI_SERVICE_URL}/delete-files`,
      {
        workspace_id: workspaceId,
        file_ids_or_names: fileIdsOrNames
      },
      {
        timeout: 30000
      }
    );
  } catch (error) {
    console.error("AI Service vector delete error:", error.message);
  }
}

async function generateSummaryAndTopics(rawText) {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return { summary: "", topics: [] };
  }

  try {
    const response = await axios.post(`${env.AI_SERVICE_URL}/summary`, {
      text: rawText.substring(0, 50000)
    });

    if (response.data?.ok && response.data?.summary) {
      const summary = response.data.summary;
      const sentences = summary.split(/[.\n-]/);
      const stopWords = new Set([
        "the", "and", "a", "of", "to", "in", "is", "that", "it", "for", "on", "with",
        "as", "this", "by", "an", "be", "are", "from", "at", "document", "user",
        "manual", "patient", "consent", "about", "your", "will", "this", "have"
      ]);
      const candidateTopics = [];
      for (const sentence of sentences) {
        const words = sentence.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [];
        for (const word of words) {
          const cleanWord = word.replace(/[^a-zA-Z]/g, "");
          if (cleanWord && !stopWords.has(cleanWord.toLowerCase()) && !candidateTopics.includes(cleanWord)) {
            candidateTopics.push(cleanWord);
          }
        }
      }

      if (candidateTopics.length < 2) {
        for (const sentence of sentences) {
          const words = sentence.match(/\b[a-zA-Z]{5,}\b/g) || [];
          for (const word of words) {
            const lower = word.toLowerCase();
            if (!stopWords.has(lower)) {
              const cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
              if (!candidateTopics.includes(cap)) {
                candidateTopics.push(cap);
              }
            }
          }
        }
      }

      return {
        summary,
        topics: candidateTopics.slice(0, 5)
      };
    }
  } catch (error) {
    console.error("AI service summarization error:", error.message);
  }

  return { summary: "", topics: [] };
}

router.get("/workspaces/:workspaceId/files", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const data = await listFiles(req.user.id, workspace.id);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

const addFileSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().optional(),
  size: z.coerce.number().optional(),
  status: z.enum(["uploaded", "processing", "indexed", "failed"]).optional(),
  storagePath: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  fileBase64: z.string().optional()
});

router.post("/workspaces/:workspaceId/files", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const body = addFileSchema.parse(req.body);
    const metadata = body.metadata || {};
    const ext = (body.name || "").split(".").pop().toLowerCase();
    const isCsvOrExcel = ["csv", "tsv", "xlsx", "xls"].includes(ext);

    if (body.fileBase64) {
      try {
        const binary = Buffer.from(body.fileBase64, "base64");
        const { objectPath, signedUrl } = await uploadBufferToSupabase({
          workspaceId: workspace.id,
          name: body.name,
          mimeType: body.mimeType || MIME_BY_EXT[ext] || "application/octet-stream",
          buffer: binary
        });

        body.storagePath = objectPath;
        body.size = body.size || binary.byteLength;
        metadata.url = signedUrl;
        metadata.remoteUrl = signedUrl;
        metadata.storageProvider = "supabase";
        metadata.storageBucket = env.SUPABASE_BUCKET;
        metadata.storageObjectPath = objectPath;
      } catch (saveErr) {
        console.error("Failed to upload file to Supabase Storage:", saveErr.message);
        const binary = Buffer.from(body.fileBase64, "base64");
        const saved = saveBufferToUploads(body.name, binary);
        body.storagePath = saved.filePath;
        body.size = body.size || binary.byteLength;
        metadata.url = saved.url;
        metadata.storageProvider = "local";
        metadata.storageStatus = "local-fallback";
        metadata.storageWarning = "Supabase Storage upload failed; saved the original file on the backend local uploads folder instead.";
        metadata.storageError = saveErr.message;
      }
    }

    if (!isCsvOrExcel && metadata.rawText && (!metadata.summary || !metadata.topics || metadata.topics.length === 0)) {
      console.log(`Generating AI summary and topics for uploaded file: ${body.name}`);
      const aiMeta = await generateSummaryAndTopics(metadata.rawText);
      metadata.summary = aiMeta.summary;
      metadata.topics = aiMeta.topics;
    }

    body.metadata = metadata;

    const file = await addFile(req.user.id, workspace.id, body);

    try {
      await ingestFileForRag({ user: req.user, workspaceId: workspace.id, file });
      const updated = await updateFile(req.user.id, workspace.id, file.id, { status: "indexed" });
      res.status(201).json({ ok: true, data: updated });
    } catch (ingestErr) {
      console.error("AI Service ingest error:", ingestErr.message);
      res.status(201).json({ ok: true, data: file });
    }
  } catch (error) {
    next(error);
  }
});

const patchFileSchema = z.object({
  name: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  size: z.coerce.number().optional(),
  status: z.enum(["uploaded", "processing", "indexed", "failed"]).optional(),
  storagePath: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

router.patch("/workspaces/:workspaceId/files/:fileId", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const body = patchFileSchema.parse(req.body);
    const file = await updateFile(req.user.id, workspace.id, req.params.fileId, body);
    if (!file) return next(new HttpError(404, "File not found"));

    if (body.metadata !== undefined || body.name !== undefined || body.mimeType !== undefined) {
      try {
        await ingestFileForRag({ user: req.user, workspaceId: workspace.id, file });
        const indexed = await updateFile(req.user.id, workspace.id, file.id, { status: "indexed" });
        return res.json({ ok: true, data: indexed });
      } catch (ingestErr) {
        console.error("AI Service re-index error:", ingestErr.message);
      }
    }

    res.json({ ok: true, data: file });
  } catch (error) {
    next(error);
  }
});

router.post("/workspaces/:workspaceId/files/:fileId/process", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const files = await listFiles(req.user.id, workspace.id);
    const file = files.find((item) => item.id === req.params.fileId || item.name === req.params.fileId);
    if (!file) return next(new HttpError(404, "File not found"));

    console.log("\n" + "=".repeat(96));
    console.log("THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | SELECTED DOCUMENT PROCESS STARTED");
    console.log(`THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | workspace_id: ${workspace.id}`);
    console.log(`THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | file_id: ${file.id}`);
    console.log(`THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | file_name: ${file.name}`);
    console.log("THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | backend is sending document content to AI service for chunking, embeddings, and vector storage");

    await updateFile(req.user.id, workspace.id, file.id, { status: "processing" });

    const metadata = file.metadata || {};
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const isCsvOrExcel = ["csv", "tsv", "xlsx", "xls"].includes(ext);

    if (!isCsvOrExcel && metadata.rawText && (!metadata.summary || !metadata.topics || metadata.topics.length === 0)) {
      console.log(`Generating AI summary and topics for processed file: ${file.name}`);
      const aiMeta = await generateSummaryAndTopics(metadata.rawText);
      metadata.summary = aiMeta.summary;
      metadata.topics = aiMeta.topics;
      await updateFile(req.user.id, workspace.id, file.id, { metadata });
      file.metadata = metadata;
    }

    await ingestFileForRag({ user: req.user, workspaceId: workspace.id, file });
    const indexed = await updateFile(req.user.id, workspace.id, file.id, { status: "indexed" });

    console.log("THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | SELECTED DOCUMENT PROCESS COMPLETED");
    console.log("=".repeat(96) + "\n");

    res.json({ ok: true, data: indexed });
  } catch (error) {
    next(error);
  }
});

router.delete("/workspaces/:workspaceId/files/:fileId", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const files = await listFiles(req.user.id, workspace.id);
    const target = files.find((f) => f.id === req.params.fileId || f.name === req.params.fileId);
    const removed = await deleteFile(req.user.id, workspace.id, req.params.fileId);
    if (!removed) return next(new HttpError(404, "File not found"));
    const objectPath = target?.metadata?.storageObjectPath || "";
    await deleteSupabaseObject(objectPath);

    await deleteFilesFromRag(workspace.id, [req.params.fileId]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const batchDeleteSchema = z.object({
  fileIdsOrNames: z.array(z.string())
});

router.post("/workspaces/:workspaceId/files/batch-delete", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const body = batchDeleteSchema.parse(req.body);
    const allFiles = await listFiles(req.user.id, workspace.id);
    const objectPaths = allFiles
      .filter((file) => body.fileIdsOrNames.includes(file.id) || body.fileIdsOrNames.includes(file.name))
      .map((file) => file?.metadata?.storageObjectPath)
      .filter(Boolean);
    await deleteFilesBatch(req.user.id, workspace.id, body.fileIdsOrNames);
    for (const objectPath of objectPaths) {
      await deleteSupabaseObject(objectPath);
    }
    await deleteFilesFromRag(workspace.id, body.fileIdsOrNames);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/workspaces/:workspaceId/files/:fileId/raw", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const files = await listFiles(req.user.id, workspace.id);
    const file = files.find((f) => f.id === req.params.fileId || f.name === req.params.fileId);
    if (!file) return next(new HttpError(404, "File not found"));

    const candidates = [
      file.storagePath,
      file.storagePath ? path.join(UPLOADS_DIR, path.basename(file.storagePath)) : "",
      localPathFromMetadataUrl(file.metadata?.url),
    ].filter(Boolean);

    for (const candidatePath of [...new Set(candidates)]) {
      if (fs.existsSync(candidatePath)) {
        return sendDiskFile(res, file, candidatePath);
      }
    }

    const metadataPath = file.metadata?.storageObjectPath || "";
    const generatedSignedUrl = metadataPath ? await getSignedUrlForObjectPath(metadataPath) : "";
    if (generatedSignedUrl) {
      file.metadata = {
        ...(file.metadata || {}),
        remoteUrl: generatedSignedUrl
      };
    }

    const restored = await restoreRemoteFileCopy({
      userId: req.user.id,
      workspaceId: workspace.id,
      file,
    });

    if (restored?.storagePath && fs.existsSync(restored.storagePath)) {
      return sendDiskFile(res, restored, restored.storagePath);
    }

    const metaUrl = file.metadata?.url;
    if (metaUrl) {
      const fallbackPath = localPathFromMetadataUrl(metaUrl);
      if (fallbackPath && fs.existsSync(fallbackPath)) {
        return sendDiskFile(res, file, fallbackPath);
      }
    }

    const rawText = storedTextForFile(file);
    if (rawText && rawText.trim()) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${file.name}.txt"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-CHATB-Recovered-Preview", "metadata-text");
      return res.send(rawText);
    }

    return next(new HttpError(404, "Original file copy is missing and no extracted text is stored. Re-upload the document once to repair this file."));
  } catch (error) {
    next(error);
  }
});

export default router;
