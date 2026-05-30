import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { getWorkspaceForUser, listFiles } from "../services/store.js";

const router = Router();
const MAX_WORKSPACE_CONTEXT_CHARS = 3000;
const MAX_FILE_CONTEXT_CHARS = 700;
const MAX_DIRECT_DOCUMENT_CONTEXT_CHARS = Math.max(
  4000,
  Number.parseInt(process.env.RAG_DIRECT_DOCUMENT_CONTEXT_CHARS || "32000", 10) || 32000
);
const CONTEXT_ROW_SAMPLE_LIMIT = 2;

const querySchema = z.object({
  workspaceId: z.string().min(1),
  chatId: z.string().optional(),
  question: z.string().min(1),
  fileId: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  directContext: z.coerce.boolean().optional(),
  topK: z.coerce.number().optional(),
  model: z.string().min(1).optional(),
  temperature: z.coerce.number().optional()
});

function isGeminiModel(model) {
  return String(model || "").toLowerCase().startsWith("gemini");
}

function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  return `${text.slice(0, maxChars - 3)}...`;
}

function rowToContextText(row, columns = []) {
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

function buildFileContext(file, { directContext = false } = {}) {
  const metadata = file.metadata || {};
  const columns = Array.isArray(metadata.columns) ? metadata.columns : [];
  const storedRows = Array.isArray(metadata.rows) ? metadata.rows : [];
  const topics = Array.isArray(metadata.topics) ? metadata.topics.join(", ") : "";
  const rawText = metadata.rawText || metadata.contentText || metadata.fullText || "";
  const rows = !rawText && hasDemoPlaceholderRows(storedRows) ? [] : storedRows;

  if (directContext) {
    const rowText = !rawText && rows.length
      ? `Rows:\n${rows.map((row) => rowToContextText(row, columns)).join("\n")}`
      : "";

    return truncateText([
      `File: ${file.name}`,
      `Type: ${metadata.type || file.mimeType || "unknown"}`,
      rawText ? `Selected document text:\n${rawText}` : "",
      columns.length ? `Columns: ${columns.join(", ")}` : "",
      metadata.summary ? `Summary: ${metadata.summary}` : "",
      metadata.insights ? `Insights: ${metadata.insights}` : "",
      topics ? `Topics: ${topics}` : "",
      rowText,
      !rawText && !rows.length
        ? "No extractable document text is stored for this file. Re-upload the original document so text can be extracted for direct model chat."
        : ""
    ]
      .filter(Boolean)
      .join("\n"), MAX_DIRECT_DOCUMENT_CONTEXT_CHARS);
  }

  const sampledRows = rows.slice(0, CONTEXT_ROW_SAMPLE_LIMIT);
  const rowText = sampledRows.length ? `Rows sample:\n${JSON.stringify(sampledRows)}` : "";

  return truncateText([
    `File: ${file.name}`,
    `Type: ${metadata.type || file.mimeType || "unknown"}`,
    columns.length ? `Columns: ${columns.join(", ")}` : "",
    metadata.summary ? `Summary: ${metadata.summary}` : "",
    metadata.insights ? `Insights: ${metadata.insights}` : "",
    topics ? `Topics: ${topics}` : "",
    rowText
  ]
    .filter(Boolean)
    .join("\n"), MAX_FILE_CONTEXT_CHARS);
}

async function buildWorkspaceContext(userId, workspaceId, selectedFileId, selectedFileName, directContext = false) {
  const files = await listFiles(userId, workspaceId) || [];
  const scopedFiles = selectedFileId || selectedFileName
    ? files.filter((file) => file.id === selectedFileId || file.name === selectedFileName)
    : files;

  if (scopedFiles.length === 0) {
    return "No uploaded files are currently attached to this workspace.";
  }

  const context = scopedFiles
    .slice(0, 1)
    .map((file) => buildFileContext(file, { directContext }))
    .join("\n\n---\n\n");

  return truncateText(
    context,
    directContext ? MAX_DIRECT_DOCUMENT_CONTEXT_CHARS : MAX_WORKSPACE_CONTEXT_CHARS
  );
}

router.post("/query", async (req, res, next) => {
  try {
    const body = querySchema.parse(req.body);
    const workspace = await getWorkspaceForUser(req.user.id, body.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const model = body.model || env.CEREBRAS_MODEL || env.GEMINI_MODEL;
    const geminiKey = req.user.api_key_gemini || env.GEMINI_API_KEY;
    const cerebrasKey = env.CEREBRAS_API_KEY;
    if (isGeminiModel(model) && !geminiKey) {
      return next(new HttpError(503, "GEMINI_API_KEY is not configured"));
    }
    if (!isGeminiModel(model) && !cerebrasKey) {
      return next(new HttpError(503, "CEREBRAS_API_KEY is not configured"));
    }

    const directContext = Boolean(body.directContext && (body.fileId || body.fileName));
    console.log(
      `[RAG QUERY] workspace=${workspace.id} chat=${body.chatId || "n/a"} directContext=${directContext} model=${model} file=${body.fileName || body.fileId || "n/a"} question="${String(body.question || "").slice(0, 120)}"`
    );
    const context = await buildWorkspaceContext(
      req.user.id,
      workspace.id,
      body.fileId,
      body.fileName,
      directContext
    );

    const aiResponse = await axios.post(
      `${env.AI_SERVICE_URL}/query`,
      {
        workspace_id: workspace.id,
        question: body.question,
        file_id: body.fileId,
        file_name: body.fileName,
        direct_context: directContext,
        top_k: body.topK || 10,
        context: context,
        model,
        temperature: body.temperature ?? 0.2,
        gemini_api_key: geminiKey,
        cerebras_api_key: cerebrasKey
      },
      {
        timeout: 60000
      }
    );

    res.json({
      ok: true,
      data: aiResponse.data
    });
    console.log(
      `[RAG QUERY RESULT] directContext=${directContext} answerMode=${aiResponse.data?.retrieval?.mode || "unknown"}`
    );
  } catch (error) {
    if (error.response) {
      return next(new HttpError(error.response.status, "AI service error", error.response.data));
    }
    if (error.code === "ECONNREFUSED") {
      return next(new HttpError(503, "AI service is not reachable"));
    }
    return next(error);
  }
});

export default router;
