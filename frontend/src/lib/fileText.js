import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 50 * 1024 * 1024;
const GENERIC_TEXT_SAMPLE_BYTES = 8192;

const TEXT_FILE_EXTENSIONS = new Set([
  'bat',
  'c',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'env',
  'go',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'jsx',
  'json',
  'log',
  'md',
  'php',
  'ps1',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'ts',
  'tsx',
  'txt',
  'tsv',
  'toml',
  'xml',
  'yaml',
  'yml',
]);

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/markdown',
  'application/xml',
  'image/svg+xml',
]);

export function getFileExtension(fileName = '') {
  return fileName.split('.').pop()?.toLowerCase() || 'unknown';
}

function appendWithinLimit(parts, text) {
  if (!text) return false;
  const used = parts.reduce((total, part) => total + part.length, 0);
  const remaining = MAX_EXTRACTED_TEXT_CHARS - used;
  if (remaining <= 0) return false;
  parts.push(text.length > remaining ? text.slice(0, remaining) : text);
  return text.length <= remaining;
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function cleanText(text = '') {
  return String(text)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function zipText(zip, path) {
  const entry = zip.file(path);
  return entry ? entry.async('text') : '';
}

function columnIndexFromCellRef(cellRef = '') {
  const letters = String(cellRef).match(/[A-Z]+/i)?.[0];
  if (!letters) return null;

  return letters
    .toUpperCase()
    .split('')
    .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function readSharedStrings(zip) {
  const xml = await zipText(zip, 'xl/sharedStrings.xml');
  if (!xml) return [];

  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((node) => node.textContent || '')
      .join('')
  );
}

async function readSheetNames(zip) {
  const workbookXml = await zipText(zip, 'xl/workbook.xml');
  const relsXml = await zipText(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) return new Map();

  const relsDoc = parseXml(relsXml);
  const rels = new Map(
    Array.from(relsDoc.getElementsByTagName('Relationship')).map((rel) => [
      rel.getAttribute('Id'),
      `xl/${(rel.getAttribute('Target') || '').replace(/^\/?xl\//, '')}`,
    ])
  );

  const workbookDoc = parseXml(workbookXml);
  return new Map(
    Array.from(workbookDoc.getElementsByTagName('sheet')).map((sheet) => {
      const relId = sheet.getAttribute('r:id') || sheet.getAttribute('id');
      return [rels.get(relId), sheet.getAttribute('name') || 'Sheet'];
    })
  );
}

function cellText(cell, sharedStrings) {
  const type = cell.getAttribute('t');

  if (type === 's') {
    const index = Number(cell.getElementsByTagName('v')[0]?.textContent || -1);
    return sharedStrings[index] || '';
  }

  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t'))
      .map((node) => node.textContent || '')
      .join('');
  }

  const value = cell.getElementsByTagName('v')[0]?.textContent || '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  return value;
}

function readRowsFromSheetXml(xml, sharedStrings) {
  if (!xml) return [];
  const doc = parseXml(xml);
  const rawRows = Array.from(doc.getElementsByTagName('row'));

  return rawRows
    .map((row) => {
      const values = [];
      Array.from(row.getElementsByTagName('c')).forEach((cell, fallbackIndex) => {
        const cellIndex = columnIndexFromCellRef(cell.getAttribute('r')) ?? fallbackIndex;
        values[cellIndex] = cellText(cell, sharedStrings);
      });

      return values.map((value) => value ?? '');
    })
    .filter((row) => row.some((value) => String(value).trim() !== ''));
}

function sheetXmlPaths(zip) {
  return Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/[^/]+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function isReadableTextSample(text = '') {
  if (!text.trim()) return false;
  if (text.includes('\u0000')) return false;

  const sampleLength = Math.max(text.length, 1);
  const replacementChars = (text.match(/\uFFFD/g) || []).length;
  const controlChars = (text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;

  return replacementChars / sampleLength < 0.02 && controlChars / sampleLength < 0.02;
}

async function extractGenericText(file) {
  const type = String(file.type || '').toLowerCase();
  const ext = getFileExtension(file.name);
  const shouldTryText = type.startsWith('text/') || TEXT_MIME_TYPES.has(type) || TEXT_FILE_EXTENSIONS.has(ext) || !type;

  if (!shouldTryText) return '';

  const sample = await file.slice(0, Math.min(file.size, GENERIC_TEXT_SAMPLE_BYTES)).text();
  if (!isReadableTextSample(sample)) return '';

  const text = cleanText(await file.text());
  return text.length > MAX_EXTRACTED_TEXT_CHARS ? text.slice(0, MAX_EXTRACTED_TEXT_CHARS) : text;
}

export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          const text = item?.str || '';
          return item?.hasEOL ? `${text}\n` : `${text} `;
        })
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (pageText) {
        pages.push(`Page ${pageNumber}\n${pageText}`);
      }

      page.cleanup?.();
    }
  } finally {
    pdf.destroy?.();
  }

  return pages.join('\n\n').trim();
}

export async function extractXlsxText(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedStrings = await readSharedStrings(zip);
  const sheetNames = await readSheetNames(zip);
  const sheetPaths = sheetXmlPaths(zip);

  const sheets = [];
  for (const sheetPath of sheetPaths) {
    const xml = await zipText(zip, sheetPath);
    if (!xml) continue;

    const rows = readRowsFromSheetXml(xml, sharedStrings)
      .map((row) => row.join('\t').replace(/\t+$/g, ''))
      .filter(Boolean);

    if (rows.length) {
      const sheetName = sheetNames.get(sheetPath) || sheetPath.split('/').pop();
      sheets.push(`Sheet: ${sheetName}\n${rows.join('\n')}`);
    }
  }

  return sheets.join('\n\n').trim();
}

export async function extractZipText(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parts = [];
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const ext = getFileExtension(entry.name);
    if (ext === 'zip') continue;

    let text = '';
    if (TEXT_FILE_EXTENSIONS.has(ext)) {
      text = await entry.async('text');
    } else {
      const blob = await entry.async('blob');
      const nestedFile = new File([blob], entry.name);
      if (ext === 'pdf') text = await extractPdfText(nestedFile);
      if (ext === 'xlsx') text = await extractXlsxText(nestedFile);
      if (ext === 'docx') text = await extractDocxText(nestedFile);
      if (ext === 'pptx') text = await extractPptxText(nestedFile);
      if (!text) text = await extractGenericText(nestedFile);
    }

    const clean = cleanText(text);
    if (clean && !appendWithinLimit(parts, `--- File: ${entry.name} ---\n${clean}`)) {
      break;
    }
  }

  return parts.join('\n\n').trim();
}

export async function extractDocxText(file) {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const wordXmlPaths = Object.keys(zip.files)
      .filter((path) => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const parts = [];
    for (const path of wordXmlPaths) {
      const xml = await zipText(zip, path);
      if (!xml) continue;

      const doc = parseXml(xml);
      const paragraphs = Array.from(doc.getElementsByTagName('w:p'))
        .map((p) =>
          Array.from(p.getElementsByTagName('w:t'))
            .map((t) => t.textContent || '')
            .join('')
        )
        .filter(Boolean);

      if (paragraphs.length) parts.push(paragraphs.join('\n\n'));
    }

    return parts
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    console.error('Failed to extract Word text:', err);
    return '';
  }
}

export async function extractPptxText(file) {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const slides = [];
    for (const slidePath of slidePaths) {
      const xml = await zipText(zip, slidePath);
      if (!xml) continue;

      const doc = parseXml(xml);
      const text = Array.from(doc.getElementsByTagName('a:t'))
        .map((node) => node.textContent || '')
        .filter(Boolean)
        .join('\n')
        .trim();

      if (text) {
        const slideNumber = slidePath.match(/slide(\d+)\.xml$/i)?.[1] || slides.length + 1;
        slides.push(`Slide ${slideNumber}\n${text}`);
      }
    }

    return slides.join('\n\n').trim();
  } catch (err) {
    console.error('Failed to extract PowerPoint text:', err);
    return '';
  }
}

export async function parseXlsxToRowsAndColumns(file) {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const sharedStrings = await readSharedStrings(zip);
    const sheetPaths = sheetXmlPaths(zip);

    if (sheetPaths.length === 0) return { columns: [], rows: [] };

    const xml = await zipText(zip, sheetPaths[0]);
    if (!xml) return { columns: [], rows: [] };

    const parsedRows = readRowsFromSheetXml(xml, sharedStrings);
    if (parsedRows.length === 0) return { columns: [], rows: [] };

    const maxWidth = Math.max(...parsedRows.map((row) => row.length));
    const normalizedRows = parsedRows.map((row) =>
      Array.from({ length: maxWidth }, (_, index) => String(row[index] ?? '').trim())
    );
    const firstRow = normalizedRows[0] || [];
    const looksLikeHeader = firstRow.some((cell) => /[A-Za-z_ ]/.test(cell));
    const columns = looksLikeHeader
      ? firstRow.map((col, idx) => col || `Column ${idx + 1}`)
      : Array.from({ length: maxWidth }, (_, idx) => `Column ${idx + 1}`);
    const rows = (looksLikeHeader ? normalizedRows.slice(1) : normalizedRows)
      .filter((r) => r.some((cell) => String(cell).trim() !== ''))
      .slice(0, 1000);

    return { columns, rows };
  } catch (err) {
    console.error('Failed to parse Excel spreadsheet rows:', err);
    return { columns: [], rows: [] };
  }
}

export async function extractReadableFileText(file) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is larger than 50 MB.');
  }

  const ext = getFileExtension(file.name);

  if (ext === 'pdf') {
    return extractPdfText(file);
  }

  if (TEXT_FILE_EXTENSIONS.has(ext)) {
    return cleanText(await file.text());
  }

  if (ext === 'xlsx') {
    return extractXlsxText(file);
  }

  if (ext === 'docx') {
    return extractDocxText(file);
  }

  if (ext === 'pptx') {
    return extractPptxText(file);
  }

  if (ext === 'zip') {
    return extractZipText(file);
  }

  return extractGenericText(file);
}
