import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import AdmZip from "adm-zip";
import Papa from "papaparse";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { addFile, addFilesBatch, getWorkspaceForUser, updateFile } from "../services/store.js";

const router = Router();

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = n;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function parseOwnerAndDataset(ref = "") {
  const [owner, dataset] = String(ref).split("/");
  return { owner, dataset };
}

async function getFileCount(ownerSlug, datasetSlug, authHeader) {
  try {
    const url = 'https://api.kaggle.com/v1/datasets.DatasetApiService/ListDatasetFiles';
    const res = await axios.post(url, {
      ownerSlug,
      datasetSlug,
      pageSize: 200
    }, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      timeout: 3000
    });
    const files = res.data?.datasetFiles || [];
    if (res.data?.nextPageToken) {
      return `${files.length}+`;
    }
    return files.length;
  } catch (err) {
    console.error(`Failed to get file count for ${ownerSlug}/${datasetSlug}:`, err.message);
    return "N/A";
  }
}

router.get("/search", async (req, res, next) => {
  try {
    const q = req.query.q || "";
    const kaggleUser = req.user.kaggle_username || env.KAGGLE_USERNAME;
    const kaggleToken = req.user.kaggle_key || env.KAGGLE_API_TOKEN;

    if (!kaggleUser || !kaggleToken) {
      return next(new HttpError(400, "Kaggle credentials are not configured on the server"));
    }

    const authHeader = 'Basic ' + Buffer.from(`${kaggleUser}:${kaggleToken}`).toString('base64');

    const searchUrl = `https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(q)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        Authorization: authHeader
      }
    });

    const datasets = Array.isArray(response.data) ? response.data : [];

    function formatBytes(bytes) {
      const n = Number(bytes || 0);
      if (n <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let val = n;
      let i = 0;
      while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
      }
      return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    }

    const enrichedResults = await Promise.all(
      datasets.map(async (dataset) => {
        const sizeLabel = formatBytes(dataset?.totalBytes || 0);
        let fileCount = "N/A";

        if (dataset?.ref && dataset.ref.includes("/")) {
          const [owner, name] = dataset.ref.split("/");
          fileCount = await getFileCount(owner, name, authHeader);
        }

        return {
          ...dataset,
          sizeLabel,
          fileCount
        };
      })
    );

    res.json({
      ok: true,
      data: enrichedResults
    });
  } catch (error) {
    if (error.response) {
      return next(new HttpError(error.response.status, "Kaggle Search API Error", error.response.data));
    }
    next(error);
  }
});

const importSchema = z.object({
  workspaceId: z.string().min(1),
  datasetUrl: z.string().min(1)
});

async function ingestFilesAsync(userId, workspaceId, filesWithText, geminiKey) {
  if (!filesWithText || filesWithText.length === 0) return;

  const CONCURRENCY_LIMIT = 5;
  let index = 0;

  async function worker() {
    while (index < filesWithText.length) {
      const currentIdx = index++;
      if (currentIdx >= filesWithText.length) break;

      const item = filesWithText[currentIdx];
      const { fileRecord, text, metadata } = item;

      try {
        await axios.post(`${env.AI_SERVICE_URL}/ingest`, {
          workspace_id: workspaceId,
          file_id: fileRecord.id,
          file_name: fileRecord.name,
          content: text.slice(0, 200000),
          metadata,
          gemini_api_key: geminiKey
        }, {
          proxy: false,
          timeout: 300000
        });

        await updateFile(userId, workspaceId, fileRecord.id, { status: "indexed" });
      } catch (ingestError) {
        console.error(`Background AI Ingestion failed for ${fileRecord.name}:`, ingestError.message);
        await updateFile(userId, workspaceId, fileRecord.id, { status: "uploaded" });
      }
    }
  }

  const workers = [];
  const numWorkers = Math.min(CONCURRENCY_LIMIT, filesWithText.length);
  for (let w = 0; w < numWorkers; w++) {
    workers.push(worker());
  }

  Promise.all(workers).catch(err => {
    console.error("Error in background ingest workers:", err);
  });
}

router.post("/import", async (req, res, next) => {
  try {
    const body = importSchema.parse(req.body);
    const workspace = await getWorkspaceForUser(req.user.id, body.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    let owner = "";
    let datasetName = "";

    const cleanUrl = body.datasetUrl.replace(/^(https?:\/\/)?(www\.)?/, "");
    const parts = cleanUrl.split("/").filter(Boolean);

    if (parts[0] === "kaggle.com") {
      if (parts[1] === "datasets") {
        owner = parts[2];
        datasetName = parts[3];
      } else {
        owner = parts[1];
        datasetName = parts[2];
      }
    } else if (parts.length >= 2) {
      owner = parts[0];
      datasetName = parts[1];
    } else {
      return next(new HttpError(400, "Invalid Kaggle dataset URL format"));
    }

    if (datasetName && datasetName.includes("?")) {
      datasetName = datasetName.split("?")[0];
    }

    if (!owner || !datasetName) {
      return next(new HttpError(400, "Failed to parse dataset owner or name"));
    }

    const kaggleUser = req.user.kaggle_username || env.KAGGLE_USERNAME;
    const kaggleToken = req.user.kaggle_key || env.KAGGLE_API_TOKEN;
    const geminiKey = req.user.api_key_gemini || env.GEMINI_API_KEY || null;

    if (!kaggleUser || !kaggleToken) {
      return next(new HttpError(400, "Kaggle credentials are not configured on the server"));
    }

    const authHeader = 'Basic ' + Buffer.from(`${kaggleUser}:${kaggleToken}`).toString('base64');
    const downloadUrl = `https://www.kaggle.com/api/v1/datasets/download/${owner}/${datasetName}`;

    console.log(`Downloading Kaggle dataset zip: ${downloadUrl}`);

    const downloadRes = await axios.get(downloadUrl, {
      headers: {
        Authorization: authHeader
      },
      responseType: "arraybuffer",
      timeout: 120000,
      proxy: false
    });

    function formatBytes(bytes) {
      const n = Number(bytes || 0);
      if (n <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let val = n;
      let i = 0;
      while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
      }
      return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    }

    const zip = new AdmZip(Buffer.from(downloadRes.data));
    const zipEntries = zip.getEntries();

    const kaggleSize = formatBytes(downloadRes.data.byteLength);
    const payloads = [];
    const textFilesData = [];

    const BINARY_EXTENSIONS = [
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp",
      ".zip", ".tar", ".gz", ".rar", ".7z",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".bin", ".exe", ".dll", ".so", ".dylib",
      ".h5", ".pkl", ".npy", ".npz", ".pb", ".onnx", ".model", ".pt", ".pth"
    ];

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const nameLower = entry.entryName.toLowerCase();
      const isBinary = BINARY_EXTENSIONS.some(ext => nameLower.endsWith(ext));

      let text = "";
      if (!isBinary) {
        try {
          text = entry.getData().toString("utf8").replace(/\u0000/g, "");
        } catch (err) {
          console.error(`Failed to decode entry ${entry.entryName} as UTF-8:`, err.message);
          text = "";
        }
      }

      const isCsv = nameLower.endsWith(".csv");

      let columns = [];
      let rows = [];
      let totalRows = 0;
      let metadata = {
        type: isCsv ? "csv" : (isBinary ? "binary" : "text"),
        sizeLabel: formatBytes(entry.header.size),
        kaggleSize,
        timeLabel: "Just now"
      };

      if (isCsv && text) {
        const parsed = Papa.parse(text, { skipEmptyLines: true });
        if (parsed.data && parsed.data.length > 0) {
          columns = parsed.data[0];
          rows = parsed.data.slice(1, 1001);
          totalRows = parsed.data.length - 1;
        }
        metadata = {
          ...metadata,
          columns,
          rows,
          totalRows,
          insights: `AI Insights: Kaggle dataset imported. Total rows: ${totalRows}. Columns: ${columns.join(", ")}`
        };
      } else if (isBinary) {
        metadata = {
          ...metadata,
          summary: "Binary file data (visualizations or computed tensors)"
        };
      } else {
        metadata = {
          ...metadata,
          summary: text.slice(0, 500) + (text.length > 500 ? "..." : "")
        };
      }

      const isTextToIngest = text && text.trim().length > 0;

      payloads.push({
        name: entry.entryName,
        mimeType: isCsv ? "text/csv" : (isBinary ? "application/octet-stream" : "text/plain"),
        size: entry.header.size,
        status: isTextToIngest ? "processing" : "uploaded",
        metadata
      });

      if (isTextToIngest) {
        textFilesData.push({
          name: entry.entryName,
          text,
          metadata
        });
      }
    }

    const dbFiles = await addFilesBatch(req.user.id, workspace.id, payloads);

    const filesWithText = [];
    for (const fileRecord of dbFiles) {
      const match = textFilesData.find(t => t.name === fileRecord.name);
      if (match) {
        filesWithText.push({
          fileRecord,
          text: match.text,
          metadata: match.metadata
        });
      }
    }

    ingestFilesAsync(req.user.id, workspace.id, filesWithText, geminiKey);

    res.json({
      ok: true,
      message: `Successfully imported ${dbFiles.length} files from Kaggle.`,
      files: dbFiles
    });

  } catch (error) {
    if (error.response) {
      return next(new HttpError(error.response.status, "Kaggle Import API Error", error.response.data));
    }
    next(error);
  }
});

export default router;
