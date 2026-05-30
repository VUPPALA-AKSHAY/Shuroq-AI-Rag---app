import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { motion } from 'framer-motion';
import TopHeader from '../components/TopHeader';
import ConfirmModal from '../components/ConfirmModal';
import { FileUploadUploadThingDemo } from '../components/FileUploadUploadThingDemo';
import { Trash2, Search, ArrowRight, Database, Download, Star } from 'lucide-react';
import { api } from '../lib/api';

const KaggleImport = () => {
  const navigate = useNavigate();
  const { activeProjectId, datasets, allDatasets = {}, uploadDataset, removeDataset, removeDatasetsBatch, reloadWorkspaceData, addProject, isWorkspaceLoading } = useApp();

  const [globalSearch, setGlobalSearch] = useState('');
  const [kaggleUrl, setKaggleUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [importStatus, setImportStatus] = useState('');
  const [uploadDone, setUploadDone] = useState(false);
  const [recentUploads, setRecentUploads] = useState([]);
  const [displayWorkspaceId, setDisplayWorkspaceId] = useState(activeProjectId);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [batchDeleteRequested, setBatchDeleteRequested] = useState(false);

  const [visibleCount, setVisibleCount] = useState(25);
  const [localSearch, setLocalSearch] = useState('');

  useEffect(() => {
    setSelectedFiles([]);
    setDisplayWorkspaceId(activeProjectId);
    setVisibleCount(25);
    setLocalSearch('');
    if (activeProjectId) {
      reloadWorkspaceData(activeProjectId).catch(err => {
        console.error("Failed to reload workspace datasets on mount:", err);
      });
    }
  }, [activeProjectId, reloadWorkspaceData]);

  const currentWorkspaceId = displayWorkspaceId || activeProjectId;
  const workspaceDatasets = currentWorkspaceId
    ? (allDatasets[currentWorkspaceId] || (currentWorkspaceId === activeProjectId ? datasets : []))
    : datasets;
  const workspaceRecentUploads = recentUploads.filter((file) => !currentWorkspaceId || file.workspaceId === currentWorkspaceId);
  const visibleDatasets = [...workspaceRecentUploads, ...workspaceDatasets].filter((file, index, list) => (
    index === list.findIndex((item) => (
      (item.id && file.id && item.id === file.id) || item.name === file.name
    ))
  ));
  const filteredDatasets = visibleDatasets.filter(d =>
    d.name.toLowerCase().includes(localSearch.toLowerCase())
  );
  const hasDatasets = visibleDatasets.length > 0;

  const handleToggleSelect = (fileName) => {
    setSelectedFiles(prev =>
      prev.includes(fileName)
        ? prev.filter(name => name !== fileName)
        : [...prev, fileName]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === filteredDatasets.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredDatasets.map(d => d.name));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    setBatchDeleteRequested(true);
  };

  const confirmBatchDelete = async () => {
    setIsFetching(true);
    setImportStatus(`Deleting ${selectedFiles.length} selected dataset(s)...`);
    try {
      await removeDatasetsBatch(currentWorkspaceId, selectedFiles);
      setSelectedFiles([]);
      setImportStatus('Successfully deleted selected datasets.');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setImportStatus('Failed to delete some datasets.');
    } finally {
      setIsFetching(false);
      setBatchDeleteRequested(false);
    }
  };

  const ensureActiveWorkspace = useCallback(async () => {
    if (activeProjectId) return activeProjectId;
    const createdId = await addProject('My First Workspace', 'AI research and datasets analysis workspace.');
    return createdId;
  }, [activeProjectId, addProject]);

  const handleKaggleSearch = async (queryStr = globalSearch) => {
    if (!queryStr.trim()) return;
    setIsSearching(true);
    setImportStatus('Searching Kaggle registry...');
    try {
      const res = await api.get(`/kaggle/search?q=${encodeURIComponent(queryStr)}`);
      setSearchResults(res.data?.data || []);
      setImportStatus('');
    } catch (err) {
      console.error(err);
      setImportStatus(err.response?.data?.error || 'Failed to search Kaggle datasets. Check your credentials in Settings.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleHashtagClick = (tag) => {
    setGlobalSearch(tag);
    handleKaggleSearch(tag);
  };

  const handleKaggleFetch = async (targetUrl = kaggleUrl) => {
    const url = targetUrl || kaggleUrl;
    if (!url) return;
    setIsFetching(true);
    setImportStatus('Connecting to Kaggle API...');

    try {
      const workspaceId = await ensureActiveWorkspace();
      if (!workspaceId) {
        throw new Error('No active workspace available for import');
      }

      setImportStatus('Downloading dataset zip archive...');
      const response = await api.post('/kaggle/import', {
        workspaceId,
        datasetUrl: url
      });

      setImportStatus('Extracting archive and parsing CSV streams...');
      await reloadWorkspaceData(workspaceId);

      setImportStatus(response.data?.message || 'Successfully imported and indexed in Qdrant Vector database!');
      setKaggleUrl('');
      setTimeout(() => setImportStatus(''), 5000);
    } catch (err) {
      console.error(err);
      const details = err.response?.data?.details;
      const detailText = typeof details === 'string' ? details : (details ? JSON.stringify(details) : '');
      setImportStatus(err.response?.data?.error || detailText || err.message || 'Kaggle import failed. Check credentials/URL and try again.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleSelectDataset = (ref) => {
    const fullUrl = `https://www.kaggle.com/datasets/${ref}`;
    setKaggleUrl(fullUrl);
    handleKaggleFetch(fullUrl);
  };

  const handleFilesUploaded = useCallback(async (files) => {
    const workspaceId = await ensureActiveWorkspace();
    if (!workspaceId) {
      setImportStatus('No active workspace available for upload.');
      return;
    }
    setDisplayWorkspaceId(workspaceId);
    const pendingUploads = files.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'file';
      return {
        id: `local-${workspaceId}-${file.name}-${file.lastModified || Date.now()}`,
        workspaceId,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        rawSize: file.size,
        time: 'Just now',
        type: ext === 'xlsx' || ext === 'xls' ? 'excel' : ext,
        columns: [],
        rows: [],
        rawText: '',
        url: file.url || '',
        status: 'uploading',
        insights: 'AI Insights: File upload is being saved to this workspace.'
      };
    });
    setRecentUploads((prev) => [...pendingUploads, ...prev]);

    const { extractReadableFileText, getFileExtension, parseXlsxToRowsAndColumns } = await import('../lib/fileText');

    const parseCSV = (text) => {
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
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === ',') {
            row.push("");
          } else if (char === '\r' || char === '\n') {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            lines.push(row);
            row = [""];
          } else {
            row[row.length - 1] += char;
          }
        }
      }
      if (row.length > 1 || row[0] !== "") {
        lines.push(row);
      }
      return lines;
    };

    const uploadedFiles = [];

    for (const file of files) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const ext = getFileExtension(file.name);

      let columns = [];
      let rows = [];
      let rawText = '';
      let fileBase64 = null;
      let insights = 'AI Insights: File uploaded and ready for processing.';

      try {
        rawText = await extractReadableFileText(file);
      } catch (err) {
        console.error("Failed to extract uploaded file text:", err);
        insights = 'AI Insights: File uploaded, but readable text could not be extracted.';
      }

      try {
        fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
          reader.onerror = (err) => reject(err);
        });
      } catch (base64Err) {
        console.error('Failed to prepare uploaded file for local preview:', base64Err);
      }

      if (ext === 'csv' && rawText) {
        try {
          const parsed = parseCSV(rawText);
          if (parsed && parsed.length > 0) {
            columns = parsed[0].map(c => c.trim()).filter(Boolean);
            const allRows = parsed.slice(1).filter(r => r.length > 0 && r.some(cell => cell.trim() !== ""));
            rows = allRows.slice(0, 1000);
            insights = `AI Insights: CSV file uploaded. Total rows: ${allRows.length}. Columns: ${columns.join(", ")}`;
          }
        } catch (err) {
          console.error("Failed to parse uploaded CSV file:", err);
        }
      } else if (ext === 'xlsx') {
        try {
          const parsedXlsx = await parseXlsxToRowsAndColumns(file);
          columns = parsedXlsx.columns;
          rows = parsedXlsx.rows;
          insights = columns.length || rows.length
            ? `AI Insights: Excel file uploaded. Sheet 1 parsed: ${rows.length} rows, ${columns.length} columns.`
            : rawText
              ? `AI Insights: Excel text extracted, but table preview parsing found no rows. Characters available: ${rawText.length.toLocaleString()}.`
              : 'AI Insights: Excel uploaded, but no readable sheet rows were found.';
        } catch (err) {
          console.error("Failed to parse uploaded Excel file:", err);
          insights = rawText
            ? `AI Insights: Excel text extracted, but table preview parsing failed. Characters available: ${rawText.length.toLocaleString()}.`
            : 'AI Insights: Excel uploaded, but table preview parsing failed.';
        }
      } else if (rawText) {
        insights = `AI Insights: Document text extracted. Characters available for direct model chat: ${rawText.length.toLocaleString()}.`;
      } else if (ext === 'pdf') {
        insights = 'AI Insights: PDF uploaded, but no extractable text was found. Use an OCR/text PDF export for chat.';
      } else {
        insights = 'AI Insights: Original file uploaded for preview/download. No extractable text was found for RAG or direct model chat.';
      }

      const uploaded = await uploadDataset(workspaceId, {
        name: file.name,
        size: `${sizeMB} MB`,
        rawSize: file.size,
        time: 'Just now',
        type: ext === 'xlsx' || ext === 'xls' ? 'excel' : ext,
        columns,
        rows,
        rawText,
        url: file.url,
        fileBase64,
        insights
      });

      uploadedFiles.push({
        ...(uploaded || {
        name: file.name,
        size: `${sizeMB} MB`,
        rawSize: file.size,
        time: 'Just now',
        type: ext === 'xlsx' || ext === 'xls' ? 'excel' : ext,
        columns,
        rows,
        rawText,
        url: file.url,
        fileBase64,
        insights
        }),
        workspaceId
      });
    }

    setRecentUploads((prev) => {
      const withoutPending = prev.filter((item) => (
        item.workspaceId !== workspaceId || !uploadedFiles.some((file) => file.name === item.name)
      ));
      return [...uploadedFiles, ...withoutPending];
    });
    await reloadWorkspaceData(workspaceId);
    setUploadDone(true);
  }, [ensureActiveWorkspace, uploadDataset, reloadWorkspaceData]);

  return (
    <>
      <TopHeader
        title="Datasets"
        showSearch={false}
        actionButton={
          <button
            onClick={() => navigate('/chat')}
            className="bg-primary text-black font-bold px-4 py-2 rounded-lg text-xs hover:opacity-90 transition-opacity cursor-pointer sm:px-6"
          >
            New Analysis
          </button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-12 w-full space-y-8 lg:space-y-12"
        style={{ background: 'radial-gradient(circle at 1471px 47px, rgba(255, 255, 255, 0.02) 0%, transparent 40%)' }}
      >

        <section className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-primary font-display">Import Kaggle Datasets</h2>
          </div>

          {importStatus && (
            <div className="p-4 rounded-lg bg-white/5 border border-primary/20 text-primary font-label-md text-sm animate-pulse">
              {importStatus}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Search className="text-primary w-5 h-5" />
                <h3 className="text-xl font-bold font-headline-md">Global Search</h3>
              </div>
              <div className="relative">
                <input
                  className="w-full bg-surface-container-lowest border border-transparent rounded-lg py-4 pl-4 pr-16 text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200 text-body-md placeholder:text-on-surface-variant/40 text-sm"
                  placeholder="Search Kaggle Datasets"
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKaggleSearch()}
                />
                <button
                  onClick={() => handleKaggleSearch()}
                  disabled={isSearching}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-container-high p-2 rounded-md hover:bg-primary hover:text-surface transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleHashtagClick('nlp')} className="text-xs px-3 py-1 border border-outline-variant/30 rounded-full text-on-surface-variant hover:text-primary hover:border-primary transition-all cursor-pointer">#nlp</button>
                <button onClick={() => handleHashtagClick('computer-vision')} className="text-xs px-3 py-1 border border-outline-variant/30 rounded-full text-on-surface-variant hover:text-primary hover:border-primary transition-all cursor-pointer">#computer-vision</button>
                <button onClick={() => handleHashtagClick('financial-forecasting')} className="text-xs px-3 py-1 border border-outline-variant/30 rounded-full text-on-surface-variant hover:text-primary hover:border-primary transition-all cursor-pointer">#financial-forecasting</button>
              </div>
            </div>

            <div className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Database className="text-primary w-5 h-5" />
                <h3 className="text-xl font-bold font-headline-md">Direct Import</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  className="flex-1 bg-surface-container-lowest border border-transparent rounded-lg py-4 px-4 text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200 text-body-md placeholder:text-on-surface-variant/40 text-sm"
                  placeholder="Paste Kaggle URL"
                  type="text"
                  value={kaggleUrl}
                  onChange={(e) => setKaggleUrl(e.target.value)}
                />
                <button
                  onClick={() => handleKaggleFetch()}
                  disabled={isFetching}
                  className="bg-primary text-black font-bold px-6 py-3 sm:px-8 rounded-lg text-label-md hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer disabled:opacity-50 text-xs"
                >
                  {isFetching ? 'Fetching...' : 'Fetch'}
                </button>
              </div>
              <p className="text-xs text-on-surface-variant/60">Example: kaggle.com/datasets/username/dataset-name</p>
            </div>

          </div>
        </section>

        {searchResults.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-xl font-bold text-primary font-headline-md">Search Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((dataset) => (
                <div
                  key={dataset.ref}
                  className="glass-panel search-result-card group p-6 rounded-xl flex flex-col justify-between space-y-4 border border-white/10 transition-all duration-200"
                >
                  <div>
                    <h4 className="text-sm font-bold text-primary truncate" title={dataset.title}>{dataset.title}</h4>
                    <p className="text-xs text-on-surface-variant/70 truncate">{dataset.ref}</p>
                  </div>
                  <div className="grid grid-cols-3 items-center text-xs text-on-surface-variant/60">
                    <span className="text-left">{dataset.sizeLabel || dataset.size || '0 B'}</span>
                    <span className="flex items-center justify-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                      <span>{dataset.voteCount}</span>
                    </span>
                    <span className="flex items-center justify-end gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      <span>{dataset.downloadCount}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => handleSelectDataset(dataset.ref)}
                    className="w-full py-2 bg-white/5 border border-white/20 hover:border-white/40 rounded-lg text-xs font-bold text-primary transition-all hover:bg-primary/5 cursor-pointer"
                  >
                    Select & Import
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-6">
          <div>
            <h3 className="text-xl font-bold text-primary font-headline-md">Upload Local Files</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              Secure upload with real-time progress tracking - powered by UploadThing.
            </p>
          </div>

          <div className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow">
            <FileUploadUploadThingDemo
              onFilesUploaded={handleFilesUploaded}
              disabled={uploadDone}
              uploadDone={uploadDone}
              onReset={() => setUploadDone(false)}
            />
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-primary font-headline-lg">Active Workspace Datasets</h3>
              <p className="text-sm text-on-surface-variant">Quickly access and chat with files in this workspace.</p>
            </div>
            {hasDatasets && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-bold text-primary transition-all cursor-pointer"
                >
                  {selectedFiles.length === filteredDatasets.length ? 'Deselect All' : 'Select All'}
                </button>
                {selectedFiles.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={isFetching}
                    className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedFiles.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {hasDatasets && (
            <div className="relative max-w-md">
              <input
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg py-2.5 pl-9 pr-12 text-xs text-on-surface focus:outline-none focus:border-primary/30 transition-all placeholder:text-on-surface-variant/40 text-sm"
                placeholder="Search downloaded datasets in this workspace..."
                type="text"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  setVisibleCount(25);
                }}
              />
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50 absolute left-3 top-1/2 -translate-y-1/2">search</span>
              {localSearch && (
                <button
                  onClick={() => setLocalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-xs"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {isWorkspaceLoading ? (
              <>

                <div className="p-5 sm:p-8 rounded-xl border border-primary/20 bg-primary/[0.03] flex flex-col items-center justify-center gap-4">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"></div>
                  </div>
                  <p className="text-sm font-bold text-primary animate-pulse">Loading datasets...</p>
                  <p className="text-xs text-on-surface-variant/50">Fetching your workspace files from the database</p>
                </div>

                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="glass-panel rounded-xl p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-pulse border border-white/5 bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-5 h-5 rounded border border-white/5 bg-white/5"></div>
                      <div className="w-12 h-12 bg-white/5 rounded-lg border border-white/5"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-white/10 rounded w-1/3"></div>
                        <div className="h-3 bg-white/5 rounded w-1/4"></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-9 bg-white/5 rounded-lg border border-white/5"></div>
                      <div className="w-9 h-9 bg-white/5 rounded-lg border border-white/5"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : filteredDatasets.length > 0 ? (
              filteredDatasets.slice(0, visibleCount).map((file, index) => {
                let icon = 'description';
                if (file.type === 'pdf') icon = 'picture_as_pdf';
                else if (file.type === 'csv' || file.type === 'excel' || file.type === 'zip') icon = 'table_chart';

                const isSelected = selectedFiles.includes(file.name);

                return (
                  <div
                    key={index}
                    className={`glass-panel rounded-xl p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between group transition-all hover:border-white/10 ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}
                  >
                    <div className="flex min-w-0 items-center gap-4">

                      <div
                        onClick={() => handleToggleSelect(file.name)}
                        className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-primary border-primary text-black' : 'border-white/10 hover:border-primary/50 bg-white/5'}`}
                      >
                        {isSelected && (
                          <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>

                      <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center border border-white/5 group-hover:border-white/10 transition-colors">
                        <span className="material-symbols-outlined text-primary text-2xl">{icon}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-bold text-primary" title={file.name}>{file.name}</h4>
                        <p className="text-xs text-on-surface-variant">
                          {file.size} {file.kaggleSize ? `(Kaggle Archive: ${file.kaggleSize})` : ''} | {file.time}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        onClick={() => navigate(`/chat?fileId=${encodeURIComponent(file.id || '')}&file=${encodeURIComponent(file.name)}&newChat=true`)}
                        className="flex-1 sm:flex-none border border-outline-variant/40 px-5 sm:px-6 py-2 rounded-lg text-sm font-bold text-primary hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        Chat with File
                      </button>

                      <button
                        onClick={() => {
                          setFileToDelete(file);
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 transition-all cursor-pointer"
                        title="Delete dataset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 sm:p-8 text-center text-sm text-on-surface-variant border border-dashed border-white/10 rounded-xl bg-surface-container-low">
                {hasDatasets
                  ? "No downloaded datasets match your search query."
                  : "No datasets in this workspace yet. Upload files or import from Kaggle to start analysis."}
              </div>
            )}
            {!isWorkspaceLoading && visibleCount < filteredDatasets.length && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleCount(prev => prev + 25)}
                  className="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-bold text-primary transition-all cursor-pointer"
                >
                  Load More Files ({filteredDatasets.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        </section>

      </motion.div>

      <ConfirmModal
        isOpen={!!fileToDelete}
        title="Delete Dataset"
        message={`Are you sure you want to delete "${fileToDelete?.name}"?`}
        confirmText="Yes, delete it"
        onConfirm={async () => {
          if (fileToDelete) {
            await removeDataset?.(currentWorkspaceId, fileToDelete.name);
            setFileToDelete(null);
          }
        }}
        onCancel={() => setFileToDelete(null)}
      />

      <ConfirmModal
        isOpen={batchDeleteRequested}
        title="Delete Selected Datasets"
        message={`Are you sure you want to delete ${selectedFiles.length} selected dataset(s)?`}
        confirmText="Yes, delete them"
        onConfirm={confirmBatchDelete}
        onCancel={() => setBatchDeleteRequested(false)}
      />
    </>
  );
};

export default KaggleImport;
