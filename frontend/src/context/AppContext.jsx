import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { api, HAS_BACKEND_API } from '../lib/api';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const WELCOME_MESSAGE = 'Welcome. Choose a file from the Datasets panel on the right, then start your chat.';
const LEGACY_WELCOME_MESSAGES = new Set([
  'Welcome. Upload files or ask a question to begin analysis.',
  'Welcome to your analysis chat. Upload files or ask a question to begin.',
  'Welcome to your new analysis chat inside workspace. Please upload files or enter questions to begin details-based extraction.'
]);

function normalizeWelcomeMessage(text = '') {
  const value = String(text || '').trim();
  return LEGACY_WELCOME_MESSAGES.has(value) ? WELCOME_MESSAGE : text;
}

const DEMO_USER = { email: 'akshay@shuroq.ai', name: 'Principal Analyst' };
const DEMO_PROJECTS = [
  {
    id: 'demo-workspace',
    title: 'Q3 Financial Audit',
    description: 'Cross-departmental anomaly detection for fiscal year closing.',
    status: 'Active',
    icon: 'finance',
    filesCount: 2,
    insightsCount: 24,
  },
];

const DEMO_FILES = {
  'demo-workspace': [
    {
      id: 'demo-file-csv',
      name: 'dataset.csv',
      size: '4.2 MB',
      time: '2h ago',
      type: 'csv',
      columns: ['Index', 'Timestamp', 'Segment', 'Volatility', 'Revenue_Delta'],
      rows: [
        [1, '2026-05-01', 'Retail', 0.82, 14200],
        [2, '2026-05-02', 'Enterprise', 0.12, 112000],
      ],
      insights: 'AI Insights: Retail volatility remains elevated.',
    },
    {
      id: 'demo-file-pdf',
      name: 'research_paper.pdf',
      size: '1.5 MB',
      time: '3 days ago',
      type: 'pdf',
      summary: 'Comprehensive framework for volatility-sensitive forecasting.',
      topics: ['Volatility', 'Monte Carlo'],
    },
  ],
};

const DEMO_CHATS = {
  'demo-workspace': [
    {
      id: 'demo-chat-1',
      title: 'Q3 Sensitivity Evaluation',
      snippet: 'Retail segment shows high sensitivity...',
      time: '2m ago',
      icon: 'auto_graph',
    },
  ],
};

const DEMO_MESSAGES = {
  'demo-chat-1': [
    {
      id: 'demo-msg-1',
      role: 'assistant',
      sender: 'Shuroq AI',
      version: 'v4.2.0',
      text: WELCOME_MESSAGE,
      time: '09:41 AM',
    },
  ],
};

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function toTimeLabel(isoString) {
  if (!isoString) return 'Just now';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function toSizeLabel(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function inferTypeFromName(name = '') {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'excel';
  if (n.endsWith('.docx') || n.endsWith('.doc')) return n.endsWith('.docx') ? 'docx' : 'doc';
  if (n.endsWith('.pptx') || n.endsWith('.ppt')) return n.endsWith('.pptx') ? 'pptx' : 'ppt';
  if (n.endsWith('.json')) return 'json';
  if (n.endsWith('.md')) return 'md';
  if (n.endsWith('.txt')) return 'txt';
  if (n.endsWith('.zip')) return 'zip';
  return 'file';
}

function mapWorkspaceToProject(workspace, fileCount = 0) {
  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description || 'Workspace for AI analytics.',
    status: 'Active',
    icon: 'folder',
    filesCount: fileCount,
    insightsCount: 0,
  };
}

function normalizeFileUrl(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url, window.location.origin);

    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname;
    }
  } catch {
    return url;
  }
  return url;
}

function parseSpreadsheetText(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return { columns: [], rows: [] };

  const firstSheet = text
    .split(/\n\s*\n(?=Sheet:|\S)/)[0]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith('sheet:'));

  if (firstSheet.length === 0) return { columns: [], rows: [] };

  const parsed = firstSheet
    .map((line) => line.split('\t').map((cell) => String(cell || '').trim()))
    .filter((row) => row.some(Boolean));

  if (parsed.length === 0) return { columns: [], rows: [] };

  const maxWidth = Math.max(...parsed.map((row) => row.length));
  const normalized = parsed.map((row) => Array.from({ length: maxWidth }, (_, index) => row[index] || ''));
  const firstRow = normalized[0] || [];
  const looksLikeHeader = firstRow.some((cell) => /[A-Za-z_ ]/.test(cell));
  const columns = looksLikeHeader
    ? firstRow.map((column, index) => column || `Column ${index + 1}`)
    : firstRow.map((_, index) => `Column ${index + 1}`);
  const rows = (looksLikeHeader ? normalized.slice(1) : normalized).slice(0, 1000);

  return { columns, rows };
}

function mapFileToDataset(file) {
  const metadata = file.metadata || {};
  const type = metadata.type || inferTypeFromName(file.name);
  const rawText = metadata.rawText || metadata.contentText || metadata.fullText || '';
  const storedColumns = Array.isArray(metadata.columns) ? metadata.columns : [];
  const storedRows = Array.isArray(metadata.rows) ? metadata.rows : [];
  const recoveredTable = type === 'excel' && storedRows.length === 0 && rawText
    ? parseSpreadsheetText(rawText)
    : { columns: [], rows: [] };
  const rawUrl = file.workspaceId && file.id
    ? `/workspaces/${file.workspaceId}/files/${encodeURIComponent(file.id)}/raw`
    : '';

  return {
    id: file.id,
    workspaceId: file.workspaceId,
    name: file.name,
    size: metadata.sizeLabel || toSizeLabel(file.size),
    kaggleSize: metadata.kaggleSize || "",
    time: metadata.timeLabel || toTimeLabel(file.createdAt),
    type,
    columns: storedColumns.length ? storedColumns : recoveredTable.columns,
    rows: storedRows.length ? storedRows : recoveredTable.rows,
    summary: metadata.summary || '',
    topics: metadata.topics || [],
    insights: metadata.insights || '',
    rawText,
    status: file.status || 'uploaded',
    url: normalizeFileUrl(metadata.url),
    rawUrl,
  };
}

function datasetToFilePayload(fileInfo) {
  return {
    name: fileInfo.name,
    mimeType: fileInfo.type || 'application/octet-stream',
    size: Number(fileInfo.rawSize || 0),
    status: 'uploaded',
    fileBase64: fileInfo.fileBase64 || undefined,
    metadata: {
      type: fileInfo.type || inferTypeFromName(fileInfo.name),
      url: fileInfo.url || '',
      columns: fileInfo.columns || [],
      rows: fileInfo.rows || [],
      summary: fileInfo.summary || '',
      topics: fileInfo.topics || [],
      insights: fileInfo.insights || '',
      rawText: fileInfo.rawText || fileInfo.contentText || fileInfo.fullText || '',
      sizeLabel: fileInfo.size || '',
      timeLabel: fileInfo.time || 'Just now',
    },
  };
}

function mapChatToUi(chat, latestMessage) {
  const latestContent = normalizeWelcomeMessage(latestMessage?.content || '');
  const snippet = latestContent
    ? `${latestContent.substring(0, 45)}${latestContent.length > 45 ? '...' : ''}`
    : 'New analysis chat';

  return {
    id: chat.id,
    title: chat.title,
    snippet,
    time: toTimeLabel(chat.updatedAt),
    icon: 'chat',
  };
}

function buildDatasetChatTitle(datasetName, fallback = 'Workspace Chat') {
  const raw = String(datasetName || '').trim();
  if (!raw) return fallback;
  const base = raw.replace(/\.[^/.]+$/, '').trim();
  return base || fallback;
}

function isGenericChatTitle(title = '') {
  const normalized = String(title).trim().toLowerCase();
  return (
    normalized.startsWith('analysis session') ||
    normalized.startsWith('workspace chat') ||
    normalized.startsWith('new analysis chat')
  );
}

function mapMessageToUi(message, userName) {
  const isAssistant = message.role === 'assistant';
  return {
    id: message.id,
    role: message.role,
    sender: isAssistant ? 'Shuroq AI' : userName || 'User',
    version: isAssistant ? 'v4.2.0' : undefined,
    text: normalizeWelcomeMessage(message.content),
    sources: message.sources || [],
    time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('authUser');
    if (stored) return safeParse(stored, null);
    return HAS_BACKEND_API ? null : DEMO_USER;
  });

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark';
  });

  const [projects, setProjects] = useState(HAS_BACKEND_API ? [] : DEMO_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState(HAS_BACKEND_API ? null : DEMO_PROJECTS[0]?.id || null);
  const [datasetsByProject, setDatasetsByProject] = useState(HAS_BACKEND_API ? {} : DEMO_FILES);
  const [chatsByProject, setChatsByProject] = useState(HAS_BACKEND_API ? {} : DEMO_CHATS);
  const [activeChatIdState, setActiveChatIdState] = useState(() => {
    if (!HAS_BACKEND_API) return DEMO_CHATS[DEMO_PROJECTS[0].id]?.[0]?.id || null;
    return localStorage.getItem('chatbActiveChatId') || null;
  });
  const [messagesByChat, setMessagesByChat] = useState(HAS_BACKEND_API ? {} : DEMO_MESSAGES);
  const [isBootstrapping, setIsBootstrapping] = useState(HAS_BACKEND_API);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);

  const [selectedEngine, setSelectedEngineState] = useState(() => localStorage.getItem('chatbDefaultModel') || 'glm-5');
  const [responseMode, setResponseModeState] = useState(() => localStorage.getItem('chatbResponseMode') || 'rag');
  const [temperature, setTemperatureState] = useState(() => Number(localStorage.getItem('chatbTemperature') || 0.2));

  const setActiveChatId = useCallback((idOrUpdater) => {
    setActiveChatIdState((prev) => {
      const nextId = typeof idOrUpdater === 'function' ? idOrUpdater(prev) : idOrUpdater;
      if (nextId) localStorage.setItem('chatbActiveChatId', nextId);
      else localStorage.removeItem('chatbActiveChatId');
      return nextId;
    });
  }, []);

  const setSelectedEngine = useCallback((val) => {
    setSelectedEngineState(val);
    localStorage.setItem('chatbDefaultModel', val);
  }, []);

  const setResponseMode = useCallback((val) => {
    setResponseModeState(val);
    localStorage.setItem('chatbResponseMode', val);
  }, []);

  const setTemperature = useCallback((val) => {
    setTemperatureState(val);
    localStorage.setItem('chatbTemperature', String(val));
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  const ensureWorkspaceData = useCallback(async (workspaceId) => {
    if (!HAS_BACKEND_API || !workspaceId || !user) return;

    setIsLoadingWorkspace(true);
    try {
      const [filesRes, chatsRes] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/files`),
        api.get(`/workspaces/${workspaceId}/chats`),
      ]);

      const fileList = (filesRes.data?.data || []).map(mapFileToDataset);
      let rawChats = chatsRes.data?.data || [];

      if (rawChats.length === 0) {
        const firstDatasetName = fileList[0]?.name;
        const createRes = await api.post(`/workspaces/${workspaceId}/chats`, {
          title: buildDatasetChatTitle(firstDatasetName, 'Workspace Chat 1')
        });
        rawChats = [createRes.data?.data].filter(Boolean);
      }

      const messagesEntries = [];
      const BATCH_SIZE = 5;
      for (let i = 0; i < rawChats.length; i += BATCH_SIZE) {
        const batch = rawChats.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (chat) => {
            try {
              const msgRes = await api.get(`/chats/${chat.id}/messages`);
              const rawMessages = msgRes.data?.data || [];
              return [chat.id, rawMessages.map((m) => mapMessageToUi(m, user?.name))];
            } catch (err) {
              console.error(`Failed to load messages for chat ${chat.id}`);
              return [chat.id, []];
            }
          })
        );
        messagesEntries.push(...results);
      }

      const nextMessages = Object.fromEntries(messagesEntries);
      const mappedChats = rawChats.map((chat) => {
        const msgList = nextMessages[chat.id] || [];
        const last = msgList[msgList.length - 1];
        return mapChatToUi(chat, last ? { content: last.text } : null);
      });

      setDatasetsByProject((prev) => ({ ...prev, [workspaceId]: fileList }));
      setChatsByProject((prev) => ({ ...prev, [workspaceId]: mappedChats }));
      setMessagesByChat((prev) => ({ ...prev, ...nextMessages }));

      setProjects((prev) => prev.map((p) => (p.id === workspaceId ? { ...p, filesCount: fileList.length } : p)));

      setActiveChatId((curr) => {
        if (!curr || !mappedChats.some((c) => c.id === curr)) {
          return mappedChats[0]?.id || null;
        }
        return curr;
      });

      return {
        fileCount: fileList.length,
        chatsCount: mappedChats.length
      };
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [user]);

  const bootstrapBackendData = async () => {
    if (!HAS_BACKEND_API || !user) return;
    setIsBootstrapping(true);
    try {
      let me;
      try {
        const meRes = await api.get('/auth/me');
        me = meRes.data?.data;
      } catch (error) {
        if (error?.response?.status !== 401 || !user?.email) {
          throw error;
        }

        const devRes = await api.post('/auth/dev-login', {
          email: user.email,
          name: user.name || user.email.split('@')[0]
        });
        const data = devRes.data?.data;
        if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
        if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        me = data?.user;
      }

      if (me?.email) {
        const normalized = {
          email: me.email,
          name: me.name || me.email.split('@')[0],
          picture: me.picture || '',
          api_key_openai: me.api_key_openai || '',
          api_key_gemini: me.api_key_gemini || '',
          api_key_groq: me.api_key_groq || '',
          kaggle_username: me.kaggle_username || '',
          kaggle_key: me.kaggle_key || ''
        };
        setUser(normalized);
        localStorage.setItem('authUser', JSON.stringify(normalized));
      }

      let wsRes = await api.get('/workspaces');
      let workspaces = wsRes.data?.data || [];

      if (workspaces.length === 0) {
        const createRes = await api.post('/workspaces', {
          title: 'My First Workspace',
          description: 'AI research and datasets analysis workspace.'
        });
        workspaces = [createRes.data?.data];
      }

      const rows = workspaces.filter(Boolean);

      const countsByWorkspace = new Map();
      for (const workspace of rows) {
        const info = await ensureWorkspaceData(workspace.id);
        countsByWorkspace.set(workspace.id, info?.fileCount || 0);
      }

      const mappedProjects = rows.map((workspace) => {
        const fileCount = countsByWorkspace.get(workspace.id) || 0;
        return mapWorkspaceToProject(workspace, fileCount);
      });

      setProjects(mappedProjects);

      const preferred = activeProjectId && mappedProjects.some((p) => p.id === activeProjectId)
        ? activeProjectId
        : mappedProjects[0]?.id || null;

      setActiveProjectId(preferred);
    } finally {
      setIsBootstrapping(false);
    }
  };

  useEffect(() => {
    if (!HAS_BACKEND_API || !user) return;
    bootstrapBackendData().catch((error) => {
      console.error('Failed to bootstrap backend data:', error?.response?.data || error.message);
    });

  }, [user?.email]);

  useEffect(() => {
    if (!HAS_BACKEND_API || !user || !activeProjectId) return;
    if (datasetsByProject[activeProjectId] && chatsByProject[activeProjectId]) return;

    ensureWorkspaceData(activeProjectId).catch((error) => {
      console.error('Failed to load workspace data:', error?.response?.data || error.message);
    });

  }, [activeProjectId, user?.email]);

  const addProject = async (title, description) => {
    if (!HAS_BACKEND_API) {
      const newProj = {
        id: `p${Date.now()}`,
        title,
        description: description || 'New AI analytics workspace.',
        status: 'Active',
        icon: 'folder',
        filesCount: 0,
        insightsCount: 0,
      };
      setProjects((prev) => [...prev, newProj]);
      setDatasetsByProject((prev) => ({ ...prev, [newProj.id]: [] }));
      setChatsByProject((prev) => ({ ...prev, [newProj.id]: [] }));
      setActiveProjectId(newProj.id);
      return newProj.id;
    }

    const res = await api.post('/workspaces', {
      title,
      description: description || 'New AI analytics workspace.'
    });
    const workspace = res.data?.data;
    if (!workspace?.id) return null;

    setProjects((prev) => [mapWorkspaceToProject(workspace, 0), ...prev]);
    setDatasetsByProject((prev) => ({ ...prev, [workspace.id]: [] }));
    setChatsByProject((prev) => ({ ...prev, [workspace.id]: [] }));
    setActiveProjectId(workspace.id);
    return workspace.id;
  };

  const renameWorkspace = async (projectId, newTitle) => {
    if (!HAS_BACKEND_API) {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: newTitle } : p));
      return;
    }

    try {
      await api.patch(`/workspaces/${projectId}`, { title: newTitle });
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: newTitle } : p));
    } catch (err) {
      console.error("Failed to rename workspace:", err);
    }
  };

  const deleteWorkspace = async (projectId) => {
    if (!HAS_BACKEND_API) {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) setActiveProjectId(null);
      return;
    }

    try {
      await api.delete(`/workspaces/${projectId}`);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) setActiveProjectId(null);
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    }
  };

  const renameChat = async (chatId, newTitle) => {
    if (!HAS_BACKEND_API) {
      setChatsByProject(prev => {
        const next = { ...prev };
        for (const pid in next) {
          next[pid] = next[pid].map(c => c.id === chatId ? { ...c, title: newTitle } : c);
        }
        return next;
      });
      return;
    }

    try {
      await api.patch(`/chats/${chatId}`, { title: newTitle });
      setChatsByProject(prev => {
        const next = { ...prev };
        for (const pid in next) {
          next[pid] = next[pid].map(c => c.id === chatId ? { ...c, title: newTitle } : c);
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to rename chat', err);
    }
  };

  const deleteChat = async (chatId) => {
    if (!HAS_BACKEND_API) {
      setChatsByProject(prev => {
        const next = { ...prev };
        for (const pid in next) {
          next[pid] = next[pid].filter(c => c.id !== chatId);
        }
        return next;
      });
      return;
    }

    try {
      await api.delete(`/chats/${chatId}`);
      setChatsByProject(prev => {
        const next = { ...prev };
        for (const pid in next) {
          next[pid] = next[pid].filter(c => c.id !== chatId);
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  const addChat = async (projectId, title) => {
    if (!projectId) return null;

    if (!HAS_BACKEND_API) {
      const newChat = {
        id: `c${Date.now()}`,
        title: title || 'Workspace Chat',
        snippet: 'Drafting new analysis query...',
        time: 'Just now',
        icon: 'chat',
      };

      setChatsByProject((prev) => ({
        ...prev,
        [projectId]: [newChat, ...(prev[projectId] || [])],
      }));

      setMessagesByChat((prev) => ({
        ...prev,
        [newChat.id]: [
          {
            id: `m${Date.now()}`,
            role: 'assistant',
            sender: 'Shuroq AI',
            version: 'v4.2.0',
            text: WELCOME_MESSAGE,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      }));

      setActiveChatId(newChat.id);
      return newChat.id;
    }

    const chatRes = await api.post(`/workspaces/${projectId}/chats`, { title: title || 'Workspace Chat' });
    const chat = chatRes.data?.data;
    if (!chat?.id) return null;

    const msgRes = await api.get(`/chats/${chat.id}/messages`);
    const rawMessages = msgRes.data?.data || [];
    const mappedMessages = rawMessages.map((m) => mapMessageToUi(m, user?.name));

    const uiChat = mapChatToUi(chat, rawMessages[rawMessages.length - 1]);

    setChatsByProject((prev) => ({
      ...prev,
      [projectId]: [uiChat, ...(prev[projectId] || [])],
    }));
    setMessagesByChat((prev) => ({ ...prev, [chat.id]: mappedMessages }));
    setActiveChatId(chat.id);
    return chat.id;
  };

  const uploadDataset = async (projectId, fileInfo) => {
    if (!projectId || !fileInfo?.name) return null;

    const optimistic = {
      ...fileInfo,
      id: fileInfo.id || `temp-${Date.now()}`,
      time: fileInfo.time || 'Just now',
      size: fileInfo.size || '0 B',
      type: fileInfo.type || inferTypeFromName(fileInfo.name),
    };

    setDatasetsByProject((prev) => ({
      ...prev,
      [projectId]: [optimistic, ...(prev[projectId] || [])],
    }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, filesCount: p.filesCount + 1 } : p)));

    if (!HAS_BACKEND_API) return optimistic;

    try {
      const res = await api.post(`/workspaces/${projectId}/files`, datasetToFilePayload(fileInfo));
      const persisted = mapFileToDataset(res.data?.data);

      setDatasetsByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map((f) => (f.id === optimistic.id ? persisted : f)),
      }));
      return persisted;
    } catch (error) {
      console.error('File upload metadata sync failed:', error?.response?.data || error.message);
      return optimistic;
    }
  };

  const processDataset = async (projectId, fileIdOrName) => {
    if (!projectId || !fileIdOrName) return null;

    const existing = datasetsByProject[projectId] || [];
    const target = existing.find((f) => f.id === fileIdOrName || f.name === fileIdOrName);
    const resolvedId = target?.id || fileIdOrName;

    setDatasetsByProject((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || []).map((file) =>
        file.id === resolvedId || file.name === fileIdOrName
          ? { ...file, status: 'processing' }
          : file
      ),
    }));

    if (!HAS_BACKEND_API) return target || null;

    try {
      const res = await api.post(`/workspaces/${projectId}/files/${encodeURIComponent(resolvedId)}/process`);
      const processed = mapFileToDataset(res.data?.data);
      setDatasetsByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map((file) =>
          file.id === processed.id || file.name === processed.name ? processed : file
        ),
      }));
      return processed;
    } catch (error) {
      console.error('File processing failed:', error?.response?.data || error.message);
      setDatasetsByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map((file) =>
          file.id === resolvedId || file.name === fileIdOrName
            ? { ...file, status: 'failed' }
            : file
        ),
      }));
      throw error;
    }
  };

  const removeDataset = async (projectId, fileIdOrName) => {
    const existing = datasetsByProject[projectId] || [];
    const target = existing.find((f) => f.id === fileIdOrName || f.name === fileIdOrName);

    setDatasetsByProject((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || []).filter((f) => f.id !== fileIdOrName && f.name !== fileIdOrName),
    }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, filesCount: Math.max(0, p.filesCount - 1) } : p)));

    if (!HAS_BACKEND_API || !target) return;

    try {
      await api.delete(`/workspaces/${projectId}/files/${encodeURIComponent(target.id || target.name)}`);
    } catch (error) {
      console.error('File delete sync failed:', error?.response?.data || error.message);
    }
  };

  const removeDatasetsBatch = async (projectId, fileIdsOrNames) => {
    if (!fileIdsOrNames || fileIdsOrNames.length === 0) return;

    setDatasetsByProject((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || []).filter(
        (f) => !fileIdsOrNames.includes(f.id) && !fileIdsOrNames.includes(f.name)
      ),
    }));

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, filesCount: Math.max(0, p.filesCount - fileIdsOrNames.length) }
          : p
      )
    );

    if (!HAS_BACKEND_API) return;

    try {
      const existing = datasetsByProject[projectId] || [];
      const resolvedList = fileIdsOrNames.map((item) => {
        const found = existing.find((f) => f.id === item || f.name === item);
        return found ? (found.id || found.name) : item;
      });

      await api.post(`/workspaces/${projectId}/files/batch-delete`, {
        fileIdsOrNames: resolvedList
      });
    } catch (error) {
      console.error('Batch file delete sync failed:', error?.response?.data || error.message);
    }
  };

  const addTransactionToDataset = async (projectId, fileName, rowData) => {
    let patchedFile = null;

    setDatasetsByProject((prev) => {
      const updatedFiles = (prev[projectId] || []).map((file) => {
        if (file.name !== fileName || file.type !== 'csv') return file;

        const newIndex = (file.rows?.length || 0) + 1;
        const completeRow = [newIndex, ...rowData];
        const rows = [...(file.rows || []), completeRow];

        const volatilityColIdx = 3;
        const volatilities = rows.map((r) => Number(r[volatilityColIdx]) || 0);
        const avgVol = (volatilities.reduce((sum, v) => sum + v, 0) / Math.max(volatilities.length, 1)).toFixed(3);

        const next = {
          ...file,
          rows,
          insights: `AI Insights: Dataset updated. Average Volatility is now ${avgVol}.`,
        };
        patchedFile = next;
        return next;
      });
      return { ...prev, [projectId]: updatedFiles };
    });

    if (!HAS_BACKEND_API || !patchedFile?.id) return;

    try {
      await api.patch(`/workspaces/${projectId}/files/${patchedFile.id}`, {
        metadata: {
          type: patchedFile.type,
          columns: patchedFile.columns || [],
          rows: patchedFile.rows || [],
          summary: patchedFile.summary || '',
          topics: patchedFile.topics || [],
          insights: patchedFile.insights || '',
          sizeLabel: patchedFile.size || '',
          timeLabel: patchedFile.time || 'Just now',
        }
      });
    } catch (error) {
      console.error('File metadata update sync failed:', error?.response?.data || error.message);
    }
  };

  const addMessageToChat = (chatId, msg) => {
    setMessagesByChat((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), msg]
    }));

    setChatsByProject((prev) => {
      const next = {};
      Object.keys(prev).forEach((workspaceId) => {
        next[workspaceId] = (prev[workspaceId] || []).map((ch) => {
          if (ch.id !== chatId) return ch;
          const snippetText = normalizeWelcomeMessage(msg.text);
          return {
            ...ch,
            snippet: snippetText.substring(0, 45) + (snippetText.length > 45 ? '...' : ''),
            time: 'Just now',
          };
        });
      });
      return next;
    });

    if (!HAS_BACKEND_API) return;

    api.post(`/chats/${chatId}/messages`, {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: normalizeWelcomeMessage(msg.text),
      sources: msg.sources || []
    }).catch((error) => {
      console.error('Message sync failed:', error?.response?.data || error.message);
    });
  };

  const setChatTitleById = (chatId, nextTitle, options = {}) => {
    if (!chatId || !nextTitle) return;
    const { onlyIfGeneric = false } = options;

    setChatsByProject((prev) => {
      const next = {};
      Object.keys(prev).forEach((workspaceId) => {
        next[workspaceId] = (prev[workspaceId] || []).map((chat) => {
          if (chat.id !== chatId) return chat;
          if (onlyIfGeneric && !isGenericChatTitle(chat.title)) return chat;
          return { ...chat, title: nextTitle };
        });
      });
      return next;
    });
  };

  const login = async (emailOrPayload) => {
    const payload = typeof emailOrPayload === 'string' ? { email: emailOrPayload } : (emailOrPayload || {});
    const email = payload.email;

    if (!email || typeof email !== 'string') return;

    const currentAuthUser = safeParse(localStorage.getItem('authUser'), null);
    const emailChanged = currentAuthUser?.email?.toLowerCase() !== email.toLowerCase();

    if (emailChanged) {
      localStorage.removeItem('authUser');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');

      if (HAS_BACKEND_API) {
        setProjects([]);
        setActiveProjectId(null);
        setDatasetsByProject({});
        setChatsByProject({});
        setActiveChatId(null);
        setMessagesByChat({});
      }
    }

    if (HAS_BACKEND_API) {
      let token = localStorage.getItem('accessToken');
      if (emailChanged || !token) {
        const devRes = await api.post('/auth/dev-login', {
          email,
          name: payload.name || email.split('@')[0]
        });
        const data = devRes.data?.data;
        if (data?.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          token = data.accessToken;
        }
        if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      }
    }

    const nextUser = {
      email,
      name: payload.name || email.split('@')[0],
      picture: payload.picture || ''
    };

    setUser(nextUser);
    localStorage.setItem('authUser', JSON.stringify(nextUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    if (HAS_BACKEND_API) {
      setProjects([]);
      setActiveProjectId(null);
      setDatasetsByProject({});
      setChatsByProject({});
      setActiveChatId(null);
      setMessagesByChat({});
    }
  };

  const updateUserProfile = async (profileData) => {
    const next = { ...user, ...profileData };
    setUser(next);
    localStorage.setItem('authUser', JSON.stringify(next));

    if (!HAS_BACKEND_API) return;

    try {
      await api.patch('/auth/me', profileData);
    } catch (error) {
      console.error('Profile update sync failed:', error?.response?.data || error.message);
    }
  };

  const datasets = useMemo(() => datasetsByProject[activeProjectId] || [], [datasetsByProject, activeProjectId]);
  const chats = useMemo(() => chatsByProject[activeProjectId] || [], [chatsByProject, activeProjectId]);
  const messages = useMemo(() => messagesByChat[activeChatIdState] || [], [messagesByChat, activeChatIdState]);

  return (
    <AppContext.Provider
      value={{
        user,
        projects,
        activeProjectId,
        setActiveProjectId,
        datasets,
        allDatasets: datasetsByProject,
        uploadDataset,
        processDataset,
        removeDataset,
        removeDatasetsBatch,
        addTransactionToDataset,
        chats,
        allChatsByProject: chatsByProject,
        activeChatId: activeChatIdState,
        setActiveChatId,
        messages,
        addMessageToChat,
        setChatTitleById,
        addProject,
        renameWorkspace,
        deleteWorkspace,
        renameChat,
        deleteChat,
        addChat,
        login,
        logout,
        updateUserProfile,
        reloadWorkspaceData: ensureWorkspaceData,
        isWorkspaceLoading: isBootstrapping || isLoadingWorkspace,
        theme,
        toggleTheme,
        selectedEngine,
        setSelectedEngine,
        responseMode,
        setResponseMode,
        temperature,
        setTemperature
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
