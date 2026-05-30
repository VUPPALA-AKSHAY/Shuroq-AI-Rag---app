import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import TopHeader from '../components/TopHeader';
import ConfirmModal from '../components/ConfirmModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "../components/reui/number-field";

const getDatasetStatusClass = (value) => {
  const cell = String(value).toLowerCase();

  if (cell.includes('complete') || cell.includes('success') || cell.includes('done')) {
    return 'bg-[#12351f] text-[#2fc869]';
  }

  if (cell.includes('progress') || cell.includes('active')) {
    return 'bg-[#202f63] text-[#8f9cff]';
  }

  if (cell.includes('pending') || cell.includes('waiting')) {
    return 'bg-[#4a2c0c] text-[#ff8a28]';
  }

  if (cell.includes('block') || cell.includes('fail') || cell.includes('error')) {
    return 'bg-[#4a1d2a] text-[#ff5d73]';
  }

  return 'bg-[#2a2a2a] text-[#c4c7c8]';
};

const getDatasetColumnWidth = (columnCount, index) => {
  if (columnCount <= 2) {
    return index === 0 ? 180 : 560;
  }

  if (columnCount === 3) {
    if (index === 0) return 180;
    if (index === 2) return 150;
    return 560;
  }

  const widths = [290, 180, 136, 150, 380];
  return widths[index] || 240;
};

const modelDisplayName = (model = '') => {
  const normalized = String(model || '').toLowerCase();
  if (normalized === 'glm-5') return 'GLM-5';
  if (normalized === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
  return model || '';
};

const getPageIndexes = (totalPages, currentPage, maxVisible = 7) => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const half = Math.floor(maxVisible / 2);
  const start = Math.min(Math.max(0, currentPage - half), totalPages - maxVisible);
  return Array.from({ length: maxVisible }, (_, index) => start + index);
};

const DatasetPreviewTable = ({ file, rows, startIndex = 0, minTableWidth = 760 }) => {
  const columns = file.columns || [];
  const columnWidthTotal = columns.reduce(
    (total, _col, index) => total + getDatasetColumnWidth(columns.length, index),
    0
  );
  const tableWidth = Math.max(minTableWidth, columnWidthTotal);

  return (
    <div className="dataset-preview-table w-full overflow-hidden rounded-xl border border-[#343434] bg-[#191919]">
      <Table
        wrapperClassName="custom-scrollbar"
        className="table-fixed border-collapse bg-[#191919]"
        style={{ minWidth: tableWidth }}
      >
        <colgroup>
          {columns.map((col, index) => (
            <col key={`${col}-${index}`} style={{ width: getDatasetColumnWidth(columns.length, index) }} />
          ))}
        </colgroup>
        <TableHeader className="bg-[#191919]">
          <TableRow className="border-b border-[#343434] hover:bg-transparent">
            {columns.map((col, index) => (
              <TableHead
                key={`${col}-${index}`}
                className="px-5 py-5 text-[16px] font-bold normal-case tracking-normal text-[#f7f8fb]"
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y-0">
          {rows.map((row, rowIndex) => (
            <TableRow
              key={rowIndex + startIndex}
              className="border-b border-[#303030] last:border-b-0 hover:bg-transparent"
            >
              {columns.map((col, cellIndex) => {
                const value = row[cellIndex] ?? '';
                const isFirstColumn = cellIndex === 0;
                const isStatus = col.toLowerCase().includes('status') || col.toLowerCase().includes('state');

                if (isStatus) {
                  return (
                    <TableCell key={`${col}-${cellIndex}`} className="px-5 py-6 text-[16px] leading-6">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${getDatasetStatusClass(value)}`}>
                        {String(value)}
                      </span>
                    </TableCell>
                  );
                }

                return (
                  <TableCell
                    key={`${col}-${cellIndex}`}
                    className={`px-5 py-6 text-[16px] leading-6 ${
                      isFirstColumn
                        ? 'font-bold text-[#f7f8fb]'
                        : 'font-medium text-[#9da3ad]'
                    }`}
                    title={String(value)}
                  >
                    <span className="block truncate">{String(value)}</span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const fileReferencePattern = /(\[[^\]]+\])/g;

const cleanAssistantDisplayText = (text = '') => (
  String(text)
    .replace(/^\s*\*\s+/gm, '- ')
    // Clean assistant markdown noise.
    .replace(/\|/g, '')
    .replace(/\*/g, '')
);

const getPdfPreviewSource = (source = '') => {
  if (!source) return '';
  return `${source}${source.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
};

const getPreviewType = (file) => {
  const nameExt = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (nameExt && nameExt !== String(file?.name || '').toLowerCase()) return nameExt;
  return String(file?.type || '').toLowerCase();
};

const isOfficePreviewType = (type) => ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(type);

const isImagePreviewType = (type) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif'].includes(type);
const isAudioPreviewType = (type) => ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(type);
const isVideoPreviewType = (type) => ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'].includes(type);

const isRemoteHttpUrl = (url = '') => /^https?:\/\//i.test(url);

const getOfficePreviewSource = (url = '') => (
  isRemoteHttpUrl(url)
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : ''
);

const MessageText = ({ text, role, datasets, onPreviewFile }) => {
  const shouldClean = role === 'assistant';
  const displayText = shouldClean ? cleanAssistantDisplayText(text) : text;
  const lines = String(displayText || '').split('\n');
  const renderLineParts = (line, lineIndex) => (
    line.split(fileReferencePattern).map((part, partIndex) => {
      const match = part.match(/^\[(.*)\]$/);
      const fileName = match?.[1];
      const file = fileName ? datasets.find((dataset) => dataset.name === fileName) : null;

      if (file) {
        const isCsv = file.name.endsWith('.csv');
        return (
          <button
            key={`${lineIndex}-${partIndex}-${file.name}`}
            onClick={() => onPreviewFile(file.name)}
            className="mx-1 inline-flex cursor-pointer items-center gap-1 rounded bg-surface-container-low px-2 py-1 text-xs font-bold text-primary transition-all hover:scale-105 hover:border-primary/30 hover:text-primary border border-outline-variant/40"
          >
            <span className="material-symbols-outlined text-[14px]">
              {isCsv ? 'table_chart' : 'article'}
            </span>
            {file.name}
          </button>
        );
      }

      if (!part) return null;

      return part;
    })
  );

  return (
    <div className={role === 'assistant' ? 'space-y-2.5' : 'space-y-1'}>
      {lines.map((line, lineIndex) => {
        if (!line.trim()) {
          return <div key={`line-${lineIndex}`} className="h-3" />;
        }

        const numbered = role === 'assistant' ? line.match(/^\s*(\d+)[.)]\s+(.*)$/) : null;
        if (numbered) {
          return (
            <div key={`line-${lineIndex}`} className="grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-white/5 bg-white/[0.025] px-3.5 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.08] text-[11px] font-bold text-primary">
                {numbered[1]}
              </span>
              <div className="min-w-0 pt-0.5 text-[14px] font-medium leading-6 text-on-surface/90">
                {renderLineParts(numbered[2], lineIndex)}
              </div>
            </div>
          );
        }

        return (
          <div key={`line-${lineIndex}`} className="flex min-h-[1.5em] flex-wrap items-baseline text-[14px] leading-6">
            {renderLineParts(line, lineIndex)}
          </div>
        );
      })}
    </div>
  );
};

const DocumentTextPreview = ({ text, compact = false }) => (
  <div
    className={`document-preview-scrollbar w-full h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#161617] border border-white/10 shadow-inner text-on-surface-variant font-medium whitespace-pre-wrap break-words select-text selection:bg-primary/20 ${
      compact
        ? 'rounded-lg px-5 py-4 text-[13px] leading-6'
        : 'rounded-xl px-9 py-8 text-[14px] leading-7'
    }`}
  >
    {text}
  </div>
);

const OriginalPreviewFrame = ({ source, type, title, className = '', style }) => {
  if (isImagePreviewType(type)) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden bg-[#101113]`} style={style}>
        <img src={source} alt={title} className="h-full w-full object-contain" />
      </div>
    );
  }

  if (isVideoPreviewType(type)) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden bg-black`} style={style}>
        <video src={source} controls className="max-h-full w-full" title={title} />
      </div>
    );
  }

  if (isAudioPreviewType(type)) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#101113] p-6`} style={style}>
        <audio src={source} controls className="w-full" title={title} />
      </div>
    );
  }

  return (
    <iframe
      src={source}
      className={className}
      style={style}
      title={title}
    />
  );
};

const Chat = () => {
  const {
    activeProjectId,
    projects,
    datasets,
    uploadDataset,
    processDataset,
    removeDataset,
    addTransactionToDataset,
    chats,
    activeChatId,
    setActiveChatId,
    messages,
    addMessageToChat,
    setChatTitleById,
    addProject,
    addChat,
    reloadWorkspaceData,
    isWorkspaceLoading,
    selectedEngine,
    setSelectedEngine,
    responseMode,
    setResponseMode,
    temperature,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputVal, setInputVal] = useState('');

  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const [activePreviewName, setActivePreviewName] = useState(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth >= 1280
  ));
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [previewRecoveredFromText, setPreviewRecoveredFromText] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [processingNotice, setProcessingNotice] = useState(null);
  const [processingFileKey, setProcessingFileKey] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const activePreviewFile = datasets.find(d => d.name === activePreviewName);
  const hasReadablePreviewText = Boolean(activePreviewFile?.rawText?.trim());
  const isParsedTabularPreview = Boolean(
    activePreviewFile &&
    ['csv', 'excel'].includes(activePreviewFile.type) &&
    ((activePreviewFile.columns?.length || 0) > 0 || (activePreviewFile.rows?.length || 0) > 0)
  );
  const previewType = getPreviewType(activePreviewFile);
  const needsOriginalLayoutPreview = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(previewType);
  const remoteOfficePreviewSource = isOfficePreviewType(previewType)
    ? getOfficePreviewSource(activePreviewFile?.url)
    : '';
  const activePreviewSource = previewBlobUrl || (
    (previewLoadFailed || previewRecoveredFromText || !activePreviewFile?.rawUrl)
      ? activePreviewFile?.url || ''
      : ''
  );
  const originalPreviewSource = remoteOfficePreviewSource || activePreviewSource;
  const hasOriginalPreviewSource = Boolean(originalPreviewSource);
  const canRenderOriginalInline = Boolean(hasOriginalPreviewSource);
  const isDocumentPreviewLoading = Boolean(
    activePreviewFile &&
    !isParsedTabularPreview &&
    (activePreviewFile.rawUrl || activePreviewFile.url) &&
    !hasOriginalPreviewSource &&
    !previewLoadFailed &&
    !previewRecoveredFromText
  );
  const shouldRenderPdfPreview = previewType === 'pdf' && hasOriginalPreviewSource;
  const shouldRenderOfficePreview = isOfficePreviewType(previewType) && Boolean(remoteOfficePreviewSource);
  const shouldRenderGenericOriginalPreview = Boolean(
    hasOriginalPreviewSource &&
    !shouldRenderPdfPreview &&
    !shouldRenderOfficePreview
  );
  const shouldShowExtractedTextFallback = Boolean(
    hasReadablePreviewText &&
    !needsOriginalLayoutPreview &&
    (!canRenderOriginalInline || previewLoadFailed || previewRecoveredFromText)
  );
  const shouldShowOriginalMissingState = Boolean(
    activePreviewFile &&
    needsOriginalLayoutPreview &&
    !hasOriginalPreviewSource &&
    (previewRecoveredFromText || previewLoadFailed || hasReadablePreviewText)
  );

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    setPreviewBlobUrl(null);
    setPreviewLoadFailed(false);
    setPreviewRecoveredFromText(false);

    const shouldLoadPreviewBlob = activePreviewFile &&
      !isParsedTabularPreview &&
      !remoteOfficePreviewSource &&
      (activePreviewFile.rawUrl || activePreviewFile.url);

    if (shouldLoadPreviewBlob) {
      const loadPreviewBlob = async () => {
        try {
          let blob;

          if (activePreviewFile.rawUrl) {
            const response = await api.get(activePreviewFile.rawUrl, { responseType: 'blob' });
            blob = response.data;
            if (!cancelled) {
              setPreviewRecoveredFromText(response.headers?.['x-chatb-recovered-preview'] === 'metadata-text');
            }
          } else {
            const response = await fetch(activePreviewFile.url);
            if (!response.ok) throw new Error('Network response was not ok');
            blob = await response.blob();
          }

          if (!blob || blob.size === 0) {
            throw new Error('Preview file was empty');
          }

          const loadedContentType = blob.type || '';
          if (loadedContentType.startsWith('text/plain') && activePreviewFile.type !== 'txt') {
            throw new Error('Original preview resolved to extracted text instead of the stored file.');
          }

          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setPreviewBlobUrl(objectUrl);
          }
        } catch (err) {
          console.error("Failed to load document preview:", err);
          if (!cancelled) setPreviewLoadFailed(true);
        }
      };

      loadPreviewBlob();
    }

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activePreviewFile?.id, activePreviewFile?.rawText, activePreviewFile?.rawUrl, activePreviewFile?.url, activePreviewFile?.type, hasReadablePreviewText, isParsedTabularPreview, remoteOfficePreviewSource]);

  const [txTimestamp, setTxTimestamp] = useState('2026-05-26');
  const [txSegment, setTxSegment] = useState('Retail');
  const [txVolatility, setTxVolatility] = useState('0.85');
  const [txDelta, setTxDelta] = useState('12000');

  const [rowStartIndex, setRowStartIndex] = useState(0);
  const rowsPerPage = 15;

  const [modalRowStart, setModalRowStart] = useState(0);
  const modalRowsPerPage = 25;

  const [panelWidth, setPanelWidth] = useState(600);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(600);
  const [contextPanelWidth, setContextPanelWidth] = useState(320);
  const isContextDragging = useRef(false);
  const contextDragStartX = useRef(0);
  const contextDragStartWidth = useRef(320);
  const documentSelectionRunRef = useRef(0);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvt) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - moveEvt.clientX;
      const newWidth = Math.min(980, Math.max(420, dragStartWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  const handleContextDragStart = useCallback((e) => {
    e.preventDefault();
    isContextDragging.current = true;
    contextDragStartX.current = e.clientX;
    contextDragStartWidth.current = contextPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvt) => {
      if (!isContextDragging.current) return;
      const delta = contextDragStartX.current - moveEvt.clientX;
      const nextWidth = Math.min(560, Math.max(260, contextDragStartWidth.current + delta));
      setContextPanelWidth(nextWidth);
    };

    const onMouseUp = () => {
      isContextDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [contextPanelWidth]);

  useEffect(() => {
    setRowStartIndex(0);
  }, [activePreviewName]);

  const [contextSearch, setContextSearch] = useState('');
  const [visibleContextCount, setVisibleContextCount] = useState(25);
  const isEmbeddingInProgress = Boolean(
    responseMode === 'rag' &&
    processingFileKey &&
    processingNotice?.tone === 'working'
  );
  const responseModeRef = useRef(responseMode);

  useEffect(() => {
    responseModeRef.current = responseMode;
  }, [responseMode]);

  useEffect(() => {
    setVisibleContextCount(25);
    setContextSearch('');
    if (activeProjectId) {
      reloadWorkspaceData(activeProjectId).catch(err => {
        console.error("Failed to reload workspace data in Chat:", err);
      });
    }
  }, [activeProjectId, reloadWorkspaceData]);

  useEffect(() => {
    if (activeDocumentId && !datasets.some((file) => file.id === activeDocumentId || file.name === activeDocumentId)) {
      setActiveDocumentId(null);
    }
  }, [activeDocumentId, datasets]);

  const filteredContextFiles = datasets.filter(file => {
    const nameLower = file.name.toLowerCase();
    return nameLower.includes(contextSearch.toLowerCase());
  });

  const messagesEndRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  useEffect(() => {
    setModalRowStart(0);
  }, [modalSearchQuery]);

  const filteredModalRows = useMemo(() => {
    if (!activePreviewFile || !activePreviewFile.rows) return [];
    if (!modalSearchQuery.trim()) return activePreviewFile.rows;
    const query = modalSearchQuery.toLowerCase().trim();
    return activePreviewFile.rows.filter(row => {
      if (Array.isArray(row)) {
        return row.some(cell => String(cell ?? '').toLowerCase().includes(query));
      }
      if (row && typeof row === 'object') {
        return Object.values(row).some(cell => String(cell ?? '').toLowerCase().includes(query));
      }
      return String(row ?? '').toLowerCase().includes(query);
    });
  }, [activePreviewFile, modalSearchQuery]);
  const activeDocument = datasets.find(d => d.id === activeDocumentId || d.name === activeDocumentId) || null;
  const visibleContextFiles = useMemo(() => {
    const visibleFiles = filteredContextFiles.slice(0, visibleContextCount);
    if (activeDocument && !visibleFiles.some((file) => file.id === activeDocument.id || file.name === activeDocument.name)) {
      return [activeDocument, ...visibleFiles];
    }
    return visibleFiles;
  }, [activeDocument, filteredContextFiles, visibleContextCount]);
  const datasetBasedTitle = (activeDocument?.name || '').replace(/\.[^/.]+$/, '').trim() || `Workspace Chat ${Math.max(chats.length + 1, 1)}`;

  const handledNewChatRef = useRef(null);
  const syncedUrlFileRef = useRef(null);

  useEffect(() => {
    const fileIdParam = searchParams.get('fileId');
    const fileParam = searchParams.get('file');
    const isNewChat = searchParams.get('newChat') === 'true';
    const urlFileKey = fileIdParam || fileParam || '';

    if (!urlFileKey) {
      syncedUrlFileRef.current = null;
    }

    const requestedFile = datasets.find((file) =>
      (fileIdParam && file.id === fileIdParam) ||
      (fileParam && file.name === fileParam)
    );

    if (requestedFile) {
      if (syncedUrlFileRef.current !== urlFileKey) {
        syncedUrlFileRef.current = urlFileKey;
        setActiveDocumentId(requestedFile.id || requestedFile.name);
      }

      if (isNewChat && activeProjectId && handledNewChatRef.current !== (requestedFile.id || requestedFile.name)) {
        handledNewChatRef.current = requestedFile.id || requestedFile.name;
        const title = (requestedFile.name || '').replace(/\.[^/.]+$/, '').trim() || 'Workspace Chat';
        addChat(activeProjectId, title);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('newChat');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [searchParams, datasets, activeProjectId, addChat, setSearchParams]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom(isStreaming ? 'auto' : 'smooth');
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, streamingText, isRetrieving, isStreaming]);

  const ensureActiveChat = async () => {
    let projectId = activeProjectId;
    if (!projectId) {
      projectId = await addProject('My First Workspace', 'AI research and datasets analysis workspace.');
    }

    let chatId = activeChatId;
    if (!chatId || !chats.some((chat) => chat.id === chatId)) {
      chatId = await addChat(projectId, datasetBasedTitle);
    }

    return { projectId, chatId };
  };

  const parseCSVText = (text) => {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            row[row.length - 1] += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          row[row.length - 1] += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push("");
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') i++;
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }

    if (row.length > 1 || row[0] !== "") lines.push(row);
    return lines;
  };

  const selectDocumentForChat = useCallback((file) => {
    if (!file || !activeProjectId) return null;

    const runId = documentSelectionRunRef.current + 1;
    documentSelectionRunRef.current = runId;
    const isCurrentSelection = () => documentSelectionRunRef.current === runId;
    const fileKey = file.id || file.name;
    setActiveDocumentId(fileKey);
    setProcessingFileKey(fileKey);

    if (responseModeRef.current === 'direct') {
      setProcessingFileKey(null);
      setProcessingNotice({
        title: 'Direct model ready',
        detail: 'Chat is scoped to this document without chunking or embeddings.',
        tone: 'done',
      });
      setTimeout(() => {
        if (isCurrentSelection()) setProcessingNotice(null);
      }, 1400);
      return file;
    }

    setProcessingNotice({
      title: 'Chunking document',
      detail: file.name,
      tone: 'working',
    });

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isCurrentSelection()) return;

      setProcessingNotice({
        title: 'Creating embeddings',
        detail: file.name,
        tone: 'working',
      });

      try {
        const processed = await processDataset(activeProjectId, fileKey);
        if (!isCurrentSelection()) return;

        if (processed?.id) setActiveDocumentId(processed.id);
        setProcessingFileKey(null);
        setProcessingNotice({
          title: 'RAG retrieval ready',
          detail: 'Chunks and embeddings are ready for retrieval.',
          tone: 'done',
        });
        setTimeout(() => {
          if (isCurrentSelection()) setProcessingNotice(null);
        }, 2200);
      } catch (error) {
        if (!isCurrentSelection()) return;

        setProcessingFileKey(null);
        setProcessingNotice({
          title: 'Processing failed',
          detail: error?.response?.data?.error || error.message || 'Could not chunk and embed this document.',
          tone: 'error',
        });
      }
    })();

    return file;
  }, [activeProjectId, processDataset]);

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const { projectId } = await ensureActiveChat();
    if (!projectId) return;

    const {
      extractReadableFileText,
      getFileExtension,
      MAX_UPLOAD_BYTES,
      parseXlsxToRowsAndColumns,
    } = await import('../lib/fileText');

    const ext = getFileExtension(file.name);
    if (file.size > MAX_UPLOAD_BYTES) {
      setProcessingNotice({
        title: 'File is too large',
        detail: 'Upload files up to 50 MB each.',
        tone: 'error',
      });
      return;
    }

    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    let rawText = '';
    try {
      rawText = await extractReadableFileText(file);
    } catch (error) {
      console.error('Failed to extract uploaded document text:', error);
      setProcessingNotice({
        title: 'Original file uploaded',
        detail: `${file.name} will be available for preview/download, but text could not be extracted for chat.`,
        tone: 'error',
      });
    }

    let fileBase64 = null;
    try {
      fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (err) => reject(err);
      });
    } catch (base64Err) {
      console.error('Failed to convert file to base64:', base64Err);
    }

    let columns = [];
    let rows = [];
    let insights = 'Document uploaded. Select it to process chunks, embeddings, and direct model chat.';

    if (ext === 'csv' && rawText) {
      const parsed = parseCSVText(rawText);
      columns = (parsed[0] || []).map((column) => column.trim()).filter(Boolean);
      rows = parsed.slice(1).filter((row) => row.some((cell) => String(cell).trim() !== '')).slice(0, 1000);
      insights = `CSV uploaded. Total parsed rows available for preview: ${rows.length}. Columns: ${columns.join(', ')}`;
    } else if (ext === 'xlsx' && file) {
      try {
        const parsedXlsx = await parseXlsxToRowsAndColumns(file);
        columns = parsedXlsx.columns;
        rows = parsedXlsx.rows;
        insights = columns.length || rows.length
          ? `Excel uploaded. Sheet 1 parsed: ${rows.length} rows, ${columns.length} columns available for preview.`
          : rawText
            ? `Excel text extracted, but table preview parsing found no rows. ${rawText.length.toLocaleString()} characters are available for chat.`
            : 'Excel uploaded, but no readable sheet rows were found.';
      } catch (err) {
        console.error('Failed to parse Excel tabular structure:', err);
      }
    } else if (rawText) {
      insights = `Document uploaded. ${rawText.length.toLocaleString()} characters extracted for chunking and direct model context.`;
    } else if (ext === 'pdf') {
      insights = 'PDF uploaded, but no extractable text was found. Try an OCR/text PDF export before chatting.';
    } else {
      insights = 'Original file uploaded for preview/download. No extractable text was found for RAG or direct model context.';
    }

    const uploaded = await uploadDataset(projectId, {
      name: file.name,
      size: `${sizeMB} MB`,
      rawSize: file.size,
      time: 'Just now',
      type: ext === 'xlsx' || ext === 'xls' ? 'excel' : ext,
      columns,
      rows,
      rawText,
      insights,
      fileBase64,
    });

    await reloadWorkspaceData(projectId);
    await selectDocumentForChat(uploaded || { name: file.name });
  };

  const streamAssistantResponse = (responseText, reasoningPath, modelName, sources = [], targetChatId = activeChatId) => {
    setIsStreaming(true);
    setStreamingText('');

    let index = 0;
    const interval = setInterval(() => {
      if (index < responseText.length) {
        setStreamingText(prev => prev + responseText.charAt(index));
        index++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        addMessageToChat(targetChatId, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          sender: 'Shuroq AI',
          version: modelName || selectedEngine,
          text: responseText,
          reasoning: reasoningPath,
          sources: sources.map((source) => source.file_name).filter(Boolean),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        setStreamingText('');
      }
    }, 10);
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || isStreaming || isRetrieving) return;
    if (!activeDocument) {
      setProcessingNotice({
        title: 'Upload a document from the Datasets menu first.',
        tone: 'error',
      });
      return;
    }

    const question = inputVal.trim();
    const { projectId, chatId } = await ensureActiveChat();
    if (!projectId || !chatId) return;
    setChatTitleById(chatId, datasetBasedTitle, { onlyIfGeneric: true });

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      sender: 'Principal Analyst',
      text: question,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    addMessageToChat(chatId, userMsg);
    setInputVal('');
    setIsRetrieving(true);

    const useDirectContext = responseModeRef.current === 'direct';

    try {
      const response = await api.post('/rag/query', {
        workspaceId: projectId,
        chatId,
        question,
        fileId: activeDocument.id,
        fileName: activeDocument.name,
        directContext: useDirectContext,
        topK: 10,
        model: selectedEngine,
        temperature,
      });

      const payload = response.data?.data || {};
      const answer = payload.answer || 'AI model returned an empty answer.';
      const sources = payload.sources || [];
      const modelName = payload.model || selectedEngine;
      const retrieval = payload.retrieval || {};
      const sourceNames = [...new Set(sources.map((source) => source.file_name).filter(Boolean))];
      const reasoningPath = [
        `[Backend] POST /api/rag/query`,
        `[AI Service] Model: ${modelName}`,
        `[Active Document] ${activeDocument.name}`,
        useDirectContext
          ? `[Direct Context] Selected document text sent directly to GLM`
          : `[RAG] Retrieved document chunks sent to GLM`,
        `[Answer Mode] ${retrieval.mode || 'direct_selected_document_context'}`,
        sourceNames.length
          ? `[Context] Retrieved source files: ${sourceNames.join(', ')}`
          : useDirectContext
            ? `[Context] Direct selected-document text was used without vector retrieval.`
            : `[Context] No vector chunks matched; selected file metadata was included.`
      ].join('\n');

      setIsRetrieving(false);
      streamAssistantResponse(answer, reasoningPath, modelName, sources, chatId);
    } catch (error) {
      const details = error?.response?.data?.details || error?.response?.data || {};
      const message = details?.detail?.message || details?.detail || error?.response?.data?.error || error.message;
      const modelName = details?.detail?.model || selectedEngine;
      const errorText = `AI request failed: ${message}`;
      const reasoningPath = `[Backend] POST /api/rag/query\n[Error] ${JSON.stringify(details, null, 2)}`;

      setIsRetrieving(false);
      streamAssistantResponse(errorText, reasoningPath, modelName, [], chatId);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!txTimestamp || !txVolatility || !txDelta) return;

    const { projectId, chatId } = await ensureActiveChat();
    if (!projectId || !chatId) return;

    const vol = parseFloat(txVolatility);
    const delta = parseInt(txDelta);

    addTransactionToDataset(projectId, activePreviewName, [txTimestamp, txSegment, vol, delta]);
    setShowTransactionForm(false);

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      sender: 'Principal Analyst',
      text: `Added new transaction entry to ${activePreviewName}: Segment = ${txSegment}, Volatility = ${vol}, Delta = $${delta.toLocaleString()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    addMessageToChat(chatId, userMsg);

    setIsRetrieving(true);

    const useDirectContext = responseModeRef.current === 'direct';

    try {
      const question = [
        userMsg.text,
        `Analyze how this new transaction changes the active dataset and whether the volatility/revenue delta pattern is significant.`
      ].join('\n');
      const response = await api.post('/rag/query', {
        workspaceId: projectId,
        chatId,
        question,
        fileId: activeDocument?.id,
        fileName: activeDocument?.name || activePreviewName,
        directContext: useDirectContext,
        topK: 10,
        model: selectedEngine,
        temperature,
      });
      const payload = response.data?.data || {};
      const sources = payload.sources || [];
      const modelName = payload.model || selectedEngine;
      const retrieval = payload.retrieval || {};
      const reasoningPath = [
        `[Parser] Added row in UI for ${activePreviewName}`,
        `[Backend] POST /api/rag/query`,
        `[AI Service] Model: ${modelName}`,
        useDirectContext
          ? `[Direct Context] Selected document text sent directly to GLM`
          : `[RAG] Retrieved document chunks sent to GLM`,
        `[Answer Mode] ${retrieval.mode || 'direct_selected_document_context'}`
      ].join('\n');

      setIsRetrieving(false);
      streamAssistantResponse(payload.answer || 'AI model returned an empty answer.', reasoningPath, modelName, sources, chatId);
    } catch (error) {
      const details = error?.response?.data?.details || error?.response?.data || {};
      const message = details?.detail?.message || details?.detail || error?.response?.data?.error || error.message;
      const modelName = details?.detail?.model || selectedEngine;
      const errorText = `AI request failed after adding the transaction: ${message}`;
      const reasoningPath = `[Backend] POST /api/rag/query\n[Error] ${JSON.stringify(details, null, 2)}`;

      setIsRetrieving(false);
      streamAssistantResponse(errorText, reasoningPath, modelName, [], chatId);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      <AnimatePresence>
        {responseMode === 'rag' && processingNotice && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)] p-3 pointer-events-none"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${
                processingNotice.tone === 'done'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : processingNotice.tone === 'error'
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-white/10 text-primary'
              }`}>
                <span className={`material-symbols-outlined text-[18px] ${processingNotice.tone === 'working' ? 'animate-spin' : ''}`}>
                  {processingNotice.tone === 'done' ? 'check_circle' : processingNotice.tone === 'error' ? 'error' : 'progress_activity'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary">{processingNotice.title}</p>
                {processingNotice.detail && (
                  <p className="mt-1 truncate text-xs font-medium text-on-surface-variant/70" title={processingNotice.detail}>
                    {processingNotice.detail}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex-grow flex flex-col relative h-full min-w-0">

        <TopHeader
          title="Analysis Chat"
          subtitle={
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">chat</span>
              <span className="font-label-md text-xs sm:text-label-md max-w-[180px] sm:max-w-[360px] truncate" title={activeDocument?.name || activeChat?.title || 'No document selected'}>
                Active: {activeDocument?.name || activeChat?.title || 'No document selected'}
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse ml-2" title="Online" />
            </div>
          }
          actionButton={
            !activePreviewName && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(prev => !prev)}
                className="rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-bold text-primary transition-all hover:bg-white/5 xl:hidden"
              >
                Context
              </button>
            )
          }
        />

        <div className="chat-thread flex-grow overflow-y-auto custom-scrollbar px-4 pt-6 pb-80 space-y-8 sm:px-6 lg:px-12 lg:pt-10 lg:pb-80 lg:space-y-12 bg-gradient-to-b from-surface-container-low to-surface-container-lowest">
          <div className="flex items-center justify-center">
            <span className="chat-date-chip text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/30 font-bold bg-white/5 px-3 py-1 rounded-full border border-white/5">
              Today - {messages[0]?.time || '09:41 AM'}
            </span>
          </div>

          <div className="space-y-8">
            {messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key={msg.id}
                className={`flex items-start gap-3 sm:gap-6 max-w-4xl group ${msg.role === 'user' ? 'ml-auto flex-row-reverse text-right' : ''}`}
              >

                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 duration-200 shadow-md ${
                    msg.role === 'user'
                      ? 'bg-primary text-surface font-extrabold shadow-white/5'
                      : 'glass-panel border-white/20 text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {msg.role === 'user' ? 'person' : 'auto_awesome'}
                  </span>
                </div>

                <div className={`flex-1 space-y-2 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    <span className="font-label-md text-xs text-primary font-bold">{msg.sender}</span>
                    {msg.version && (
                      <span className="text-[9px] text-on-surface-variant/70 bg-surface-container-low border border-outline-variant/40 px-1.5 py-0.5 rounded font-bold">{modelDisplayName(msg.version)}</span>
                    )}
                  </div>

                  <div
                    className={`chat-message-bubble text-on-surface leading-relaxed font-body-md text-sm text-left border ${
                      msg.role === 'user'
                        ? 'chat-message-bubble-user rounded-xl p-3 sm:p-4 bg-surface border-outline-variant/30 w-fit max-w-[92%] sm:max-w-[85%] shadow-lg'
                        : 'chat-message-bubble-assistant rounded-xl p-4 sm:p-5 bg-[#1b1b1d]/95 border-white/[0.08] w-full space-y-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]'
                    }`}
                  >

                    <MessageText
                      text={msg.text}
                      role={msg.role}
                      datasets={datasets}
                      onPreviewFile={setActivePreviewName}
                    />

                    {msg.chart && (
                      <div className="h-64 w-full rounded border border-outline-variant/30 bg-surface overflow-hidden relative group/chart mt-6">
                        <img
                          alt="Analysis Chart"
                          className="w-full h-full object-cover opacity-85 group-hover/chart:opacity-100 transition-opacity"
                          src={msg.chart.src}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface/90 to-transparent"></div>
                        <div className="absolute bottom-4 left-4 flex gap-2">
                          <span className="px-2.5 py-1 rounded bg-surface/90 border border-outline-variant/40 text-[10px] uppercase tracking-wider text-primary font-bold">
                            Conf: {msg.chart.confidence}
                          </span>
                          <span className="px-2.5 py-1 rounded bg-surface/90 border border-outline-variant/40 text-[10px] uppercase tracking-wider text-primary font-bold">
                            Iter: {msg.chart.iterations}
                          </span>
                        </div>
                      </div>
                    )}

                    {msg.metrics && (
                      <div className="grid grid-cols-2 gap-4 mt-6">
                        {msg.metrics.map((metric, idx) => (
                          <div key={idx} className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col justify-between">
                            <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1 tracking-wider">{metric.label}</p>
                            <p className="text-xl font-bold text-primary">{metric.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {isRetrieving && (
              <div className="flex items-start gap-3 sm:gap-6 max-w-4xl animate-pulse">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl glass-panel border-white/10 text-primary flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] animate-pulse">auto_awesome</span>
                </div>
                <div className="flex-grow space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-primary font-bold">Shuroq AI</span>
                    <span className="text-[9px] text-on-surface-variant/40 bg-white/5 px-2 py-0.5 rounded border border-white/10">Searching Database...</span>
                  </div>
                  <div className="p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low space-y-4">
                    <div className="h-4 bg-white/10 rounded w-1/3"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-white/5 rounded w-full"></div>
                      <div className="h-3 bg-white/5 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isStreaming && streamingText && (
              <div className="flex items-start gap-3 sm:gap-6 max-w-4xl group">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl glass-panel border-white/20 text-primary flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] animate-pulse">auto_awesome</span>
                </div>
                <div className="flex-grow space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-label-md text-xs text-primary font-bold">Shuroq AI</span>
                    <span className="text-[10px] text-on-surface-variant/40 animate-pulse">Typing...</span>
                  </div>
                  <div className="chat-message-bubble chat-message-bubble-assistant rounded-xl p-5 bg-[#1b1b1d]/95 border border-white/[0.08] text-on-surface leading-relaxed font-body-md text-sm text-left shadow-[0_18px_50px_rgba(0,0,0,0.24)] space-y-4">
                    <div>
                      <MessageText
                        text={streamingText}
                        role="assistant"
                        datasets={datasets}
                        onPreviewFile={setActivePreviewName}
                      />
                      <span className="inline-block w-1.5 h-4 bg-primary ml-1 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-composer-wrap absolute bottom-0 left-0 right-0 px-4 pb-4 pt-4 sm:px-6 sm:pb-6 lg:px-12 lg:pb-10 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/95 to-transparent z-10">
          <form onSubmit={handleSend} className="chat-composer max-w-4xl mx-auto glass-panel border-white/10 rounded-2xl p-2 flex items-end gap-2 sm:p-2.5 sm:gap-3 focus-within:border-primary/30 transition-all shadow-2xl">
            <div className="flex flex-col flex-1">
              <textarea
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border-none focus:ring-0 text-on-surface font-body-md text-sm p-3 resize-none min-h-[56px] max-h-48 custom-scrollbar focus:outline-none placeholder:text-on-surface-variant/30 text-sm"
                placeholder={isRetrieving || isStreaming ? "Shuroq AI is computing responses..." : "Command Shuroq AI to analyze, parse, or run simulations..."}
                rows={1}
                disabled={isRetrieving || isStreaming}
              />
              <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4 px-3 pb-2">
                {activeDocument && (
                  <span className="max-w-[150px] sm:max-w-[240px] truncate text-[9px] font-bold text-primary/70" title={activeDocument.name}>
                    DOC: {activeDocument.name}
                  </span>
                )}
                <span className="hidden sm:inline text-[9px] font-bold text-on-surface-variant/30 tracking-wider">ENTER TO SEND</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={isRetrieving || isStreaming}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined font-bold">send</span>
            </button>
          </form>
        </div>

      </section>

      <AnimatePresence>
        {!activePreviewName && isSidebarOpen && (
          <>
          <button
            type="button"
            aria-label="Close context panel"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm xl:hidden"
          />

          <div
            onMouseDown={handleContextDragStart}
            className="relative hidden xl:block h-full w-1.5 cursor-col-resize group hover:bg-primary/20 transition-colors"
            title="Drag to resize"
          >
            <div className="h-full w-full relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/60 transition-all" />
            </div>
          </div>

          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ width: `min(${contextPanelWidth}px, calc(100vw - 88px))` }}
            className="chat-context-panel fixed inset-y-0 right-0 z-[70] border-l border-outline-variant/30 flex flex-col bg-surface flex-shrink-0 overflow-hidden xl:relative xl:z-20"
          >

            <div className="p-5 sm:p-6 xl:p-8 border-b border-outline-variant/30">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Model Configuration</h3>
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-1">Engine selection</label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEngine('glm-5')}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        selectedEngine === 'glm-5'
                          ? 'border-primary bg-primary/5 text-primary shadow-inner'
                          : 'border-white/10 text-on-surface-variant hover:border-white/20 hover:text-primary'
                        }`}
                    >
                      <span className="font-extrabold tracking-wide">GLM-5</span>
                      {selectedEngine === 'glm-5' && (
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEngine('gemini-2.5-flash')}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        selectedEngine === 'gemini-2.5-flash'
                          ? 'border-primary bg-primary/5 text-primary shadow-inner'
                          : 'border-white/10 text-on-surface-variant hover:border-white/20 hover:text-primary'
                        }`}
                    >
                      <span className="font-semibold">Gemini 2.5 Flash</span>
                      {selectedEngine === 'gemini-2.5-flash' && (
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-1">Response type</label>
                  <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant/40">
                    <button
                      type="button"
                      onClick={async () => {
                        responseModeRef.current = 'rag';
                        setResponseMode('rag');
                        if (activeDocument) {
                          const activeKey = activeDocument.id || activeDocument.name;
                          setProcessingFileKey(activeKey);
                          setProcessingNotice({ title: 'Chunking document', detail: activeDocument.name, tone: 'working' });
                          await new Promise((resolve) => setTimeout(resolve, 500));
                          setProcessingNotice({ title: 'Creating embeddings', detail: activeDocument.name, tone: 'working' });

                          try {
                            await processDataset(activeProjectId, activeDocument.id);
                            setProcessingFileKey(null);
                            setProcessingNotice({ title: 'RAG retrieval ready', detail: 'Chunks and embeddings are ready.', tone: 'done' });
                            setTimeout(() => setProcessingNotice(null), 2200);
                          } catch (err) {
                            console.error('RAG processing failed:', err);
                            setProcessingFileKey(null);
                            setProcessingNotice({ title: 'RAG setup warning', detail: 'Could not chunk and embed this document yet.', tone: 'error' });
                            setTimeout(() => setProcessingNotice(null), 3500);
                          }
                        }
                      }}
                      className={`py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        responseMode === 'rag'
                          ? 'bg-primary text-black shadow-md'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      RAG retrieval
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        responseModeRef.current = 'direct';
                        setResponseMode('direct');
                        setProcessingFileKey(null);
                      }}
                      className={`py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        responseMode === 'direct'
                          ? 'bg-primary text-black shadow-md'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Direct model
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 xl:p-8 flex-grow flex flex-col overflow-hidden">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Datasets</h3>

              <div className="mt-4 relative flex-shrink-0">
                <input
                  type="text"
                  placeholder="Search files..."
                  value={contextSearch}
                  onChange={(e) => {
                    setContextSearch(e.target.value);
                    setVisibleContextCount(25);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg py-2 pl-8 pr-12 text-xs text-on-surface focus:outline-none focus:border-primary/30 transition-all placeholder:text-on-surface-variant/40 text-sm"
                />
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
                {contextSearch && (
                  <button
                    onClick={() => setContextSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-6 space-y-4 flex-grow overflow-y-auto custom-scrollbar pr-2">
                {isWorkspaceLoading ? (
                  <>

                    <div className="flex flex-col items-center justify-center gap-3 py-4">
                      <div className="relative w-7 h-7">
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"></div>
                      </div>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider animate-pulse">Loading files...</p>
                    </div>

                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low animate-pulse space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-[18px] h-[18px] bg-white/5 rounded"></div>
                          <div className="h-3.5 bg-white/10 rounded w-24"></div>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full"></div>
                        <div className="h-2 bg-white/5 rounded w-16"></div>
                      </div>
                    ))}
                  </>
                ) : filteredContextFiles.length > 0 ? (
                  visibleContextFiles.map((file) => {
                    const isActiveDoc = activeDocument?.id === file.id || activeDocument?.name === file.name;
                    const fileKey = file.id || file.name;
                    const isProcessing = processingFileKey === fileKey || (file.status === 'processing' && isActiveDoc);
                    const isSelectionLocked = isEmbeddingInProgress && !isProcessing;

                    return (
                      <div
                         key={file.id || file.name}
                         onClick={() => {
                           if (isSelectionLocked) return;
                           selectDocumentForChat(file);
                         }}
                        className={`context-file-card p-4 rounded-xl border bg-surface-container-low transition-all cursor-pointer hover:shadow-lg ${
                          isActiveDoc
                            ? 'is-active border-primary/80 shadow-[0_0_0_1px_rgba(255,255,255,0.20)]'
                            : 'border-outline-variant/40 hover:border-primary/50'
                        } ${isSelectionLocked ? 'opacity-55 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="material-symbols-outlined text-primary text-[18px]">
                            {file.type === 'pdf' ? 'article' : (file.type === 'csv' || file.type === 'excel' ? 'table_chart' : 'description')}
                          </span>
                          <span className="text-xs font-semibold text-on-surface truncate flex-1 min-w-0" title={file.name}>{file.name}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActivePreviewName(file.name);
                            }}
                            className="ml-2 rounded-md p-1 text-on-surface-variant/60 hover:bg-white/10 hover:text-primary flex-shrink-0"
                            title="Preview document"
                          >
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                          </button>
                          {!isProcessing && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFileToDelete(file);
                              }}
                              className="ml-1 rounded-md p-1 text-on-surface-variant/60 hover:bg-red-500/10 hover:text-red-400 flex-shrink-0 cursor-pointer"
                              title="Delete dataset"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${isProcessing ? 'w-2/3 animate-pulse bg-primary/70' : 'w-full bg-primary/45'}`}></div>
                        </div>
                        {(() => {
                          // Keep the card clean: processing status is already shown via the popup.
                          if (isProcessing) return null;

                          // Direct mode: always show a simple label under the card.
                          if (responseMode !== 'rag') {
                            return (
                              <p className="mt-2 text-[9px] text-on-surface-variant/60 font-medium select-none">
                                {isActiveDoc ? 'Direct chat' : 'Select for direct chat'}
                              </p>
                            );
                          }

                          // RAG mode: keep text short and non-selectable (no big selectable blue highlight).
                          if (isSelectionLocked && !isActiveDoc) {
                            return (
                              <p className="mt-2 text-[9px] text-on-surface-variant/60 font-medium select-none">
                                Processing another file…
                              </p>
                            );
                          }

                          if (file.type === 'csv') {
                            return (
                              <p className="mt-2 text-[9px] text-on-surface-variant/60 font-medium select-none">
                                {`Parsed: ${file.rows?.length || 0} rows`}
                              </p>
                            );
                          }

                          return (
                            <p className="mt-2 text-[9px] text-on-surface-variant/60 font-medium select-none">
                              {isActiveDoc ? 'Active for RAG' : 'Select for RAG'}
                            </p>
                          );
                        })()}
                      </div>
                    );
                  })
                ) : datasets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low p-5 text-center">
                    <p className="text-sm font-bold text-primary">No documents yet. Upload one from Datasets to begin.</p>
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => navigate('/kaggle')}
                        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-black transition-all hover:opacity-90 active:scale-[0.98]"
                      >
                        <span className="material-symbols-outlined text-[16px]">upload_file</span>
                        Upload dataset
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/kaggle')}
                        className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 px-3 py-2.5 text-xs font-bold text-primary transition-all hover:border-primary/50 hover:bg-white/5 active:scale-[0.98]"
                      >
                        <span className="material-symbols-outlined text-[16px]">database</span>
                        Import dataset
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant/50 text-center py-4">No files found matching search.</p>
                )}

                {!isWorkspaceLoading && visibleContextCount < filteredContextFiles.length && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setVisibleContextCount(prev => prev + 25)}
                      className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-bold text-primary transition-all cursor-pointer"
                    >
                      Load More ({filteredContextFiles.length - visibleContextCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activePreviewName && activePreviewFile && (
          <motion.aside
            initial={{ x: 600, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 600, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ width: `min(${panelWidth}px, calc(100vw - 88px))` }}
            className="fixed inset-y-0 right-0 z-[70] border-l border-outline-variant/30 flex flex-col bg-surface flex-shrink-0 xl:relative xl:z-20"
          >

            <div
              onMouseDown={handleDragStart}
              className="absolute left-0 top-0 bottom-0 hidden w-1.5 cursor-col-resize z-30 group hover:bg-primary/20 transition-colors xl:block"
              title="Drag to resize"
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/60 transition-all" />
            </div>

            <div className="p-4 sm:p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-primary">
                  {isParsedTabularPreview ? 'table_chart' : 'article'}
                </span>
                <span className="text-base font-bold text-primary truncate">{activePreviewFile.name}</span>
              </div>
              <button
                onClick={() => {
                  setActivePreviewName(null);
                  setShowTransactionForm(false);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer text-on-surface-variant hover:text-primary"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6">

              {isParsedTabularPreview && (
                <div className="space-y-6">

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 tracking-wider">Dataset size</h4>
                      <p className="text-base text-primary font-bold">{activePreviewFile.rows.length} Rows parsed</p>
                    </div>
                    <button
                      onClick={() => { setModalRowStart(0); setModalSearchQuery(''); setShowPreviewModal(true); }}
                      className="bg-primary text-black font-bold px-4 py-2 rounded-lg text-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer hover:shadow-lg flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      Preview
                    </button>
                  </div>

                  <AnimatePresence>
                    {showTransactionForm && (
                      <motion.form
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onSubmit={handleAddTransaction}
                        className="p-4 sm:p-5 border border-primary/20 bg-white/5 rounded-xl space-y-4 shadow-inner"
                      >
                        <h5 className="text-[10px] font-bold text-primary uppercase tracking-wider">Add Transaction Entry</h5>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-bold text-on-surface-variant block mb-1">Timestamp</label>
                            <input
                              type="text"
                              value={txTimestamp}
                              onChange={(e) => setTxTimestamp(e.target.value)}
                              className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-2.5 text-xs text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-on-surface-variant block mb-1">Segment</label>
                            <select
                              value={txSegment}
                              onChange={(e) => setTxSegment(e.target.value)}
                              className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-2.5 text-xs text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                            >
                              <option value="Retail">Retail</option>
                              <option value="Enterprise">Enterprise</option>
                              <option value="SMB">SMB</option>
                            </select>
                          </div>
                          <div>
                            <NumberField
                              value={parseFloat(txVolatility) || 0}
                              onValueChange={(v) => setTxVolatility(v.toString())}
                              min={0}
                              max={2}
                              step={0.01}
                              size="sm"
                            >
                              <NumberFieldScrubArea label="Volatility Coefficient" />
                              <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput />
                                <NumberFieldIncrement />
                              </NumberFieldGroup>
                            </NumberField>
                          </div>
                          <div>
                            <NumberField
                              value={parseInt(txDelta) || 0}
                              onValueChange={(v) => setTxDelta(v.toString())}
                              min={-1000000}
                              max={1000000}
                              step={1000}
                              size="sm"
                            >
                              <NumberFieldScrubArea label="Revenue Delta ($)" />
                              <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput />
                                <NumberFieldIncrement />
                              </NumberFieldGroup>
                            </NumberField>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-primary text-black font-bold py-2.5 rounded-lg text-xs hover:opacity-90 transition-all shadow"
                        >
                          Record Transaction & Update Context
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {(() => {
                    const totalRowsCount = activePreviewFile.rows.length;
                    const totalPages = Math.ceil(totalRowsCount / rowsPerPage);
                    const currentPage = Math.floor(rowStartIndex / rowsPerPage);
                    const goToPage = (pageIndex) => {
                      const clampedPage = Math.min(Math.max(pageIndex, 0), totalPages - 1);
                      setRowStartIndex(clampedPage * rowsPerPage);
                    };
                    const visibleRows = activePreviewFile.rows.slice(rowStartIndex, rowStartIndex + rowsPerPage);
                    return (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                          <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Live Dataset Table View</h4>
                          {totalRowsCount > rowsPerPage && (
                            <span className="text-[10px] text-primary/75 font-semibold">
                              Showing rows {rowStartIndex + 1} - {Math.min(totalRowsCount, rowStartIndex + rowsPerPage)} of {totalRowsCount}
                            </span>
                          )}
                        </div>

                        <DatasetPreviewTable
                          file={activePreviewFile}
                          rows={visibleRows}
                          startIndex={rowStartIndex}
                          minTableWidth={760}
                        />

                        {totalRowsCount > rowsPerPage && (
                          <div className="dataset-pagination flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                              type="button"
                              onClick={() => goToPage(currentPage - 1)}
                              disabled={currentPage === 0}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                              Previous
                            </button>
                            <div className="flex max-w-full items-center justify-center gap-2 overflow-x-auto custom-scrollbar">
                              {getPageIndexes(totalPages, currentPage, 5).map((pageIndex) => (
                                <button
                                  key={pageIndex}
                                  type="button"
                                  onClick={() => goToPage(pageIndex)}
                                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-all cursor-pointer ${
                                    pageIndex === currentPage
                                      ? 'bg-primary text-black'
                                      : 'bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-primary'
                                  }`}
                                >
                                  {pageIndex + 1}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => goToPage(currentPage + 1)}
                              disabled={currentPage >= totalPages - 1}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Next
                              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {!isParsedTabularPreview && (
                <div className="space-y-6 flex flex-col h-full min-h-0">

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 tracking-wider">Document Details</h4>
                      <p className="text-base text-primary font-bold">{activePreviewFile.type?.toUpperCase() || 'FILE'} · {activePreviewFile.size || 'Unknown size'}</p>
                    </div>
                    {(activePreviewFile.rawUrl || activePreviewFile.url || activePreviewFile.rawText) && (
                      <button
                        onClick={() => { setShowPreviewModal(true); }}
                        className="bg-primary text-black font-bold px-4 py-2 rounded-lg text-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">fullscreen</span>
                        Full Preview
                      </button>
                    )}
                  </div>

                  {isDocumentPreviewLoading ? (
                    <div className="flex-grow flex items-center justify-center rounded-xl border border-white/10 bg-[#161618] min-h-[360px] lg:min-h-[520px]">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary/75">Loading preview...</p>
                      </div>
                    </div>
                  ) : shouldRenderPdfPreview ? (
                    <div className="flex-grow flex flex-col min-h-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Original PDF Preview</h4>
                        {(previewBlobUrl || activePreviewFile.url) && (
                          <a
                            href={previewBlobUrl || activePreviewFile.url}
                            download={activePreviewFile.name}
                            className="flex items-center gap-1 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            Download
                          </a>
                        )}
                      </div>
                      <embed
                        src={getPdfPreviewSource(originalPreviewSource)}
                        type="application/pdf"
                        className="w-full flex-grow rounded-xl border border-white/10 bg-[#2a2a2a]"
                        style={{ height: 'min(520px, calc(100dvh - 260px))' }}
                        title={activePreviewFile.name}
                      />
                    </div>
                  ) : shouldRenderOfficePreview ? (
                    <div className="flex-grow flex flex-col min-h-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Original Office Preview</h4>
                        <a
                          href={activePreviewFile.url}
                          download={activePreviewFile.name}
                          className="flex items-center gap-1 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">download</span>
                          Download
                        </a>
                      </div>
                      <iframe
                        src={remoteOfficePreviewSource}
                        className="w-full flex-grow rounded-xl border border-white/10 bg-[#161618]"
                        style={{ height: 'min(520px, calc(100dvh - 260px))' }}
                        title={activePreviewFile.name}
                      />
                    </div>
                  ) : shouldRenderGenericOriginalPreview ? (
                    <div className="flex-grow flex flex-col min-h-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Original File Preview</h4>
                        {(previewBlobUrl || activePreviewFile.url) && (
                          <a
                            href={previewBlobUrl || activePreviewFile.url}
                            download={activePreviewFile.name}
                            className="flex items-center gap-1 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            Download
                          </a>
                        )}
                      </div>
                      <OriginalPreviewFrame
                        source={originalPreviewSource}
                        type={previewType}
                        className="w-full flex-grow rounded-xl border border-white/10 bg-[#161618]"
                        style={{ height: 'min(520px, calc(100dvh - 260px))' }}
                        title={activePreviewFile.name}
                      />
                    </div>
                  ) : shouldShowOriginalMissingState ? (
                    <div className="p-5 sm:p-8 rounded-xl bg-white/5 border border-white/10 text-center space-y-4 flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-2">
                        <span className="material-symbols-outlined text-[36px]">draft</span>
                      </div>
                      <h5 className="text-sm font-bold text-on-surface">Original file preview is unavailable</h5>
                      <p className="text-xs text-on-surface-variant leading-relaxed max-w-sm mx-auto">
                        This record only has extracted text available right now. Re-upload the original file to restore the exact PDF/Word layout preview.
                      </p>
                      {activePreviewFile.rawText && (
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(true)}
                          className="bg-primary text-black font-bold px-4 py-2 rounded-lg text-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
                        >
                          View extracted text
                        </button>
                      )}
                    </div>
                  ) : shouldShowExtractedTextFallback ? (
                    <div className="flex-grow flex flex-col min-h-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Extracted Text Fallback</h4>
                        <span className="text-[9px] text-primary/70 font-bold">
                          {activePreviewFile.rawText.length.toLocaleString()} Chars
                        </span>
                      </div>
                      <div className="min-h-0 flex-grow" style={{ height: 'min(520px, calc(100dvh - 260px))' }}>
                        <DocumentTextPreview text={activePreviewFile.rawText} compact />
                      </div>
                    </div>
                  ) : (

                    <div className="p-5 sm:p-8 rounded-xl bg-white/5 border border-white/10 text-center space-y-4 flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-2">
                        <span className="material-symbols-outlined text-[36px]">
                          {activePreviewFile.type === 'zip' ? 'folder_zip' : 'draft'}
                        </span>
                      </div>
                      <h5 className="text-sm font-bold text-on-surface">{activePreviewFile.name}</h5>
                      <div className="space-y-1">
                        <p className="text-[11px] text-on-surface-variant/60 font-semibold uppercase">
                          Type: {activePreviewFile.type || 'Unknown Binary'}
                        </p>
                        <p className="text-[11px] text-on-surface-variant/60 font-semibold">
                          Size: {activePreviewFile.size || 'Unknown Size'}
                        </p>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed max-w-xs mx-auto italic pt-2">
                        {previewLoadFailed
                          ? 'The stored file could not be loaded. Re-upload this document to refresh the preview copy.'
                          : 'No binary file stored. Re-upload this document to enable direct preview.'}
                      </p>
                    </div>
                  )}

                </div>
              )}

            </div>

            <div className="p-4 sm:p-6 border-t border-outline-variant/30 bg-surface-container-low">
              <button
                onClick={() => {
                  setActivePreviewName(null);
                  setShowTransactionForm(false);
                }}
                className="w-full bg-primary text-black py-3 rounded-lg font-bold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer text-xs"
              >
                Close and Resume Chat
              </button>
            </div>

          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreviewModal && activePreviewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          >

            <div
              className="preview-modal-overlay absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setShowPreviewModal(false)}
            />

            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="preview-modal relative bg-[#111214] border border-white/12 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{
                width: 'min(1120px, calc(100vw - 24px))',
                height: 'min(840px, calc(100dvh - 24px))',
              }}
            >

              {isParsedTabularPreview ? (
                <>

                  <div className="preview-modal-header flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 border-b border-white/10 bg-[#151619] gap-4">
                    <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[24px]">table_chart</span>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-primary truncate" title={activePreviewFile.name}>{activePreviewFile.name}</h2>
                        <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                          {activePreviewFile.rows.length} rows - {activePreviewFile.columns.length} columns
                        </p>
                      </div>
                    </div>

                    <div className="preview-search-wrap w-full sm:flex-1 sm:max-w-xl lg:max-w-2xl relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant/50">search</span>
                      <input
                        type="text"
                        placeholder="Search rows..."
                        value={modalSearchQuery}
                        onChange={(e) => setModalSearchQuery(e.target.value)}
                        className="preview-search-input w-full pl-10 pr-9 py-2.5 bg-[#121315] border border-white/10 rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/45 transition-all"
                      />
                      {modalSearchQuery && (
                        <button
                          onClick={() => setModalSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 flex-shrink-0 sm:justify-end">
                      <span className="text-[10px] text-primary/75 font-semibold">
                        Showing rows {filteredModalRows.length === 0 ? 0 : modalRowStart + 1} - {Math.min(filteredModalRows.length, modalRowStart + modalRowsPerPage)} of {filteredModalRows.length}
                        {modalSearchQuery && <span className="text-on-surface-variant/50 ml-1">(filtered)</span>}
                      </span>
                      <button
                        onClick={() => setShowPreviewModal(false)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-on-surface-variant hover:text-primary"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto custom-scrollbar p-4 sm:p-6">
                    {filteredModalRows.length === 0 ? (
                      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 bg-[#121315]/30 rounded-xl border border-white/5">
                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-3 animate-pulse">search_off</span>
                        <h3 className="text-sm font-bold text-on-surface/90">No matching rows found</h3>
                        <p className="text-xs text-on-surface-variant/60 mt-1 max-w-xs">
                          We couldn't find any rows matching "{modalSearchQuery}". Try checking your spelling or searching for a different value.
                        </p>
                        <button
                          onClick={() => setModalSearchQuery('')}
                          className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-bold text-primary rounded-lg border border-primary/20 hover:border-primary/45 transition-all cursor-pointer"
                        >
                          Clear Search
                        </button>
                      </div>
                    ) : (
                      <DatasetPreviewTable
                        file={activePreviewFile}
                        rows={filteredModalRows.slice(modalRowStart, modalRowStart + modalRowsPerPage)}
                        startIndex={modalRowStart}
                        minTableWidth={980}
                      />
                    )}
                  </div>

                  {filteredModalRows.length > modalRowsPerPage && (
                    <div className="preview-modal-footer p-4 border-t border-white/10 bg-[#151619] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={() => setModalRowStart(prev => Math.max(0, prev - modalRowsPerPage))}
                        disabled={modalRowStart === 0}
                        className="preview-page-nav flex items-center gap-1 px-4 py-2 rounded-lg border border-white/12 bg-[#121315] text-xs font-bold text-[#a7abb3] hover:border-white/25 hover:text-[#f1f2f4] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                        Previous
                      </button>
                      <div className="flex max-w-full items-center gap-2 overflow-x-auto custom-scrollbar">
                        {Array.from({ length: Math.min(7, Math.ceil(filteredModalRows.length / modalRowsPerPage)) }).map((_, i) => {
                          const totalPages = Math.ceil(filteredModalRows.length / modalRowsPerPage);
                          const currentPage = Math.floor(modalRowStart / modalRowsPerPage);
                          let pageIdx;
                          if (totalPages <= 7) {
                            pageIdx = i;
                          } else if (currentPage < 4) {
                            pageIdx = i;
                          } else if (currentPage > totalPages - 5) {
                            pageIdx = totalPages - 7 + i;
                          } else {
                            pageIdx = currentPage - 3 + i;
                          }
                          const isActive = pageIdx === currentPage;
                          return (
                            <button
                              key={pageIdx}
                              onClick={() => setModalRowStart(pageIdx * modalRowsPerPage)}
                              className={`preview-page-button w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isActive
                                  ? 'is-active bg-[#f2f3f5] text-[#101113] shadow-lg'
                                  : 'bg-white/5 text-[#a7abb3] hover:bg-white/10 hover:text-[#f1f2f4]'
                              }`}
                            >
                              {pageIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setModalRowStart(prev => Math.min(filteredModalRows.length - modalRowsPerPage, prev + modalRowsPerPage))}
                        disabled={modalRowStart + modalRowsPerPage >= filteredModalRows.length}
                        className="preview-page-nav flex items-center gap-1 px-4 py-2 rounded-lg border border-white/12 bg-[#121315] text-xs font-bold text-[#a7abb3] hover:border-white/25 hover:text-[#f1f2f4] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Next
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="preview-modal-header flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-white/10 bg-[#151619]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-[24px]">
                        {activePreviewFile.type === 'pdf' ? 'picture_as_pdf' : 'description'}
                      </span>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-primary truncate" title={activePreviewFile.name}>{activePreviewFile.name}</h2>
                        <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                          {activePreviewFile.type?.toUpperCase()} · {activePreviewFile.size || 'Unknown size'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      {(previewBlobUrl || activePreviewFile.url) && (
                        <a
                          href={previewBlobUrl || activePreviewFile.url}
                          download={activePreviewFile.name}
                          className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/12 bg-[#121315] text-xs font-bold text-[#a7abb3] hover:border-white/25 hover:text-[#f1f2f4] transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">download</span>
                          Download
                        </a>
                      )}
                      <button
                        onClick={() => setShowPreviewModal(false)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-on-surface-variant hover:text-primary"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-5">
                    {isDocumentPreviewLoading ? (
                      <div className="h-full min-h-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#161618]">
                        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary/75">Loading preview...</p>
                      </div>
                    ) : shouldRenderPdfPreview ? (
                      <embed
                        src={getPdfPreviewSource(originalPreviewSource)}
                        type="application/pdf"
                        className="w-full h-full min-h-0 rounded-xl border border-white/10 bg-[#2a2a2a]"
                        title={activePreviewFile.name}
                      />
                    ) : shouldRenderOfficePreview ? (
                      <iframe
                        src={remoteOfficePreviewSource}
                        className="w-full h-full min-h-0 rounded-xl border border-white/10 bg-[#161618]"
                        title={activePreviewFile.name}
                      />
                    ) : shouldRenderGenericOriginalPreview ? (
                      <OriginalPreviewFrame
                        source={originalPreviewSource}
                        type={previewType}
                        className="w-full h-full min-h-0 rounded-xl border border-white/10 bg-[#161618]"
                        title={activePreviewFile.name}
                      />
                    ) : shouldShowOriginalMissingState ? (
                      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-3">draft</span>
                        <h3 className="text-sm font-bold text-on-surface/90">Original file preview is unavailable</h3>
                        <p className="text-xs text-on-surface-variant/60 mt-1 max-w-sm">
                          This record only has extracted text available. Re-upload the original file to restore the exact PDF/Word layout preview.
                        </p>
                      </div>
                    ) : shouldShowExtractedTextFallback ? (
                      <DocumentTextPreview text={activePreviewFile.rawText} />
                    ) : (
                      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-3">draft</span>
                        <h3 className="text-sm font-bold text-on-surface/90">No preview available</h3>
                        <p className="text-xs text-on-surface-variant/60 mt-1 max-w-xs">
                          {previewLoadFailed
                            ? 'The stored file could not be loaded. Re-upload the document to refresh the preview copy.'
                            : 'This file has no stored binary or extracted text. Re-upload the document to enable preview.'}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!fileToDelete}
        title="Delete Dataset"
        message={`Are you sure you want to delete "${fileToDelete?.name}"?`}
        confirmText="Yes, delete it"
        onConfirm={async () => {
          if (fileToDelete) {
            if (activePreviewName === fileToDelete.name) {
              setActivePreviewName(null);
            }
            await removeDataset?.(activeProjectId, fileToDelete.name);
            setFileToDelete(null);
          }
        }}
        onCancel={() => setFileToDelete(null)}
      />

    </div>
  );
};

export default Chat;



