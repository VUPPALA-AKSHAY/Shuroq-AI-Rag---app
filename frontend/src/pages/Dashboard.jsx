import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import TopHeader from '../components/TopHeader';
import ConfirmModal from '../components/ConfirmModal';

const quotes = [
  "\"Without data, you're just another person with an opinion.\" — W. Edwards Deming",
  "\"The goal is to turn data into information, and information into insight.\" — Carly Fiorina",
  "\"Information is the oil of the 21st century, and analytics is the combustion engine.\" — Peter Sondergaard",
  "\"Torture the data, and it will confess to anything.\" — Ronald Coase",
  "\"Data are just summaries of thousands of stories.\" — Chip & Dan Heath"
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning,';
  if (hour < 17) return 'Good Afternoon,';
  return 'Good Evening,';
};

const Dashboard = () => {
  const randomQuote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], []);
  const navigate = useNavigate();
  const {
    user,
    projects,
    activeProjectId,
    setActiveProjectId,
    chats,
    allChatsByProject,
    activeChatId,
    addChat,
    renameWorkspace,
    deleteWorkspace,
    renameChat,
    setActiveChatId,
    isWorkspaceLoading,
    datasets,
    deleteChat
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAllChatsModal, setShowAllChatsModal] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingWorkspaceTitle, setEditingWorkspaceTitle] = useState('');
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [chatToDelete, setChatToDelete] = useState(null);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const defaultChatTitle = (datasets[0]?.name || '').replace(/\.[^/.]+$/, '').trim() || `Workspace Chat ${chats.length + 1}`;

  const handleStartNewChat = async () => {
    const newChatId = await addChat(activeProjectId, defaultChatTitle);
    if (newChatId) {
      setActiveChatId(newChatId);
      navigate('/chat');
    }
  };

  const handleRenameWorkspaceSubmit = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingWorkspaceTitle.trim()) {
      await renameWorkspace(id, editingWorkspaceTitle.trim());
    }
    setEditingWorkspaceId(null);
  };

  const handleRenameChatSubmit = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingChatTitle.trim()) {
      await renameChat(id, editingChatTitle.trim());
    }
    setEditingChatId(null);
  };

  const filteredProjects = projects.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredModalChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    chat.snippet.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  return (
    <>
      <TopHeader
        title="Dashboard"
        showSearch={true}
        onSearchChange={setSearchQuery}
        actionButton={
          <button
            onClick={handleStartNewChat}
            className="px-4 py-2 border border-primary/30 text-primary font-label-md text-xs sm:text-label-md rounded hover:bg-white/5 transition-all cursor-pointer font-bold hover:scale-105 sm:px-6"
          >
            New Analysis
          </button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-12 w-full"
      >

        <section className="mb-6 lg:mb-12 relative overflow-hidden rounded-2xl bg-surface border border-outline-variant/30 p-5 sm:p-8 lg:p-12 inner-glow">
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-l from-primary/10 to-transparent"></div>
          </div>
          <div className="relative z-10 max-w-2xl">
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-primary mb-4 leading-tight">
              {getGreeting()}
            </h2>
            <p className="font-body-lg text-on-surface-variant mb-5 sm:mb-8 max-w-md italic">
              {user?.name?.split(' ')[0] || 'There'}, what do you want to analyze next?
            </p>
            <button
              onClick={handleStartNewChat}
              disabled={isWorkspaceLoading || !activeProjectId}
              className="bg-primary text-black font-semibold px-5 py-3 sm:px-8 sm:py-4 rounded-lg flex items-center gap-3 hover:scale-[1.03] active:scale-[0.97] transition-all cursor-pointer shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined fill-current">chat_bubble</span>
              Start New Chat
            </button>
          </div>
        </section>

        <div className="grid grid-cols-12 gap-5 lg:gap-6">

          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-headline-md text-xl font-semibold text-primary">All Workspaces</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 lg:gap-6">
              {isWorkspaceLoading ? (

                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="glass-panel p-5 rounded-2xl border border-outline-variant/20 bg-surface/40 animate-pulse flex flex-col justify-between min-h-[160px]">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-10 h-10 bg-surface-container-high/60 rounded-lg border border-outline-variant/10"></div>
                      <div className="w-16 h-5 bg-surface-container-high/60 rounded-full"></div>
                    </div>
                    <div className="w-2/3 h-5 bg-surface-container-high/60 rounded mb-3"></div>
                    <div className="w-full h-3.5 bg-surface-container-high/60 rounded mb-2"></div>
                    <div className="w-4/5 h-3.5 bg-surface-container-high/60 rounded mb-4"></div>
                    <div className="flex items-center gap-4 pt-4 border-t border-outline-variant/10">
                      <div className="w-16 h-3 bg-surface-container-high/60 rounded"></div>
                      <div className="w-16 h-3 bg-surface-container-high/60 rounded"></div>
                    </div>
                  </div>
                ))
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => {
                  const isSelected = project.id === activeProjectId;

                  return (
                  <motion.div
                    whileHover={{
                      y: -4
                    }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    key={project.id}
                    onClick={() => {
                      setActiveProjectId(project.id);
                    }}
                    aria-pressed={isSelected}
                    className={`glass-panel dashboard-workspace-card min-h-[160px] p-5 rounded-2xl group cursor-pointer border flex flex-col justify-between bg-surface shadow-sm border-outline-variant/30 hover:bg-surface hover:border-primary/60 ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    style={{
                      transitionDuration: '220ms'
                    }}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-5 relative">
                      <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 group-hover:border-primary/25 transition-colors">
                        <span className="material-symbols-outlined text-primary">{project.icon || 'folder'}</span>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container-low/80 p-1 opacity-80 transition-all group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWorkspaceId(project.id);
                              setEditingWorkspaceTitle(project.title);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
                            title="Edit Workspace"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(project);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-red-500/10 hover:text-red-500"
                            title="Delete Workspace"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {editingWorkspaceId === project.id ? (
                        <form onSubmit={(e) => handleRenameWorkspaceSubmit(e, project.id)} className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            className="flex-1 bg-surface-container-high text-primary px-2 py-1 rounded border border-primary/50 text-lg font-bold outline-none"
                            value={editingWorkspaceTitle}
                            onChange={e => setEditingWorkspaceTitle(e.target.value)}
                            onBlur={(e) => handleRenameWorkspaceSubmit(e, project.id)}
                          />
                        </form>
                      ) : (
                        <>
                          <h3 className="font-headline-md text-lg font-bold text-primary truncate">{project.title}</h3>
                        </>
                      )}
                    </div>
                    </div>
                    <div className="flex items-center gap-4 pt-4 border-t border-outline-variant/20 mt-auto">
                      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-primary/60">chat</span>
                        {(allChatsByProject?.[project.id] || []).length} Chats
                      </div>
                      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-primary/60">description</span>
                        {project.filesCount} Datasets
                      </div>
                    </div>
                  </motion.div>
                  );
                })
              ) : (
                <div className="col-span-full p-6 sm:p-12 text-center text-sm text-on-surface-variant border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low">
                  No workspaces found matching your search.
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-headline-md text-xl font-semibold text-primary">Workspace Chats</h2>
            </div>

            <div className="space-y-3">
              {isWorkspaceLoading ? (

                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-xl border border-outline-variant/20 bg-surface/30 animate-pulse flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high/60 border border-outline-variant/10 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="w-1/2 h-4 bg-surface-container-high/60 rounded"></div>
                      <div className="w-3/4 h-3 bg-surface-container-high/60 rounded"></div>
                    </div>
                    <div className="w-10 h-3 bg-surface-container-high/60 rounded mt-1"></div>
                  </div>
                ))
              ) : chats.length > 0 ? (
                chats.slice(0, 4).map((chat) => (
                  <motion.div
                    whileHover={{ scale: 1.01, borderColor: 'rgba(255, 255, 255, 0.2)' }}
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      navigate('/chat');
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 bg-surface shadow-sm ${
                      chat.id === activeChatId
                        ? 'border-primary/30 bg-primary/5 shadow-md'
                        : 'border-outline-variant/30 hover:border-primary/20 hover:bg-surface'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-container-lowest border border-outline-variant/30 flex-shrink-0">
                      <span className="material-symbols-outlined text-[20px] text-primary">{chat.icon || 'chat'}</span>
                    </div>
                    <div className="flex-1 min-w-0 group/chattitle">
                      {editingChatId === chat.id ? (
                        <form onSubmit={(e) => handleRenameChatSubmit(e, chat.id)} className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            className="flex-1 bg-surface-container-high text-primary px-2 py-1 rounded border border-primary/50 text-sm font-bold outline-none"
                            value={editingChatTitle}
                            onChange={e => setEditingChatTitle(e.target.value)}
                            onBlur={(e) => handleRenameChatSubmit(e, chat.id)}
                          />
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-primary truncate flex items-center gap-1.5">
                            {chat.title}
                            {chat.id === activeChatId && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                          </p>
                          <div className="opacity-0 group-hover/chattitle:opacity-100 flex items-center transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(chat.id);
                                setEditingChatTitle(chat.title);
                              }}
                              className="text-on-surface-variant hover:text-primary p-1"
                              title="Rename chat"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChatToDelete(chat);
                              }}
                              className="text-on-surface-variant hover:text-red-400 p-1 ml-1"
                              title="Delete chat"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-on-surface-variant mt-1 truncate">{chat.snippet}</p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant/60 whitespace-nowrap mt-1">{chat.time}</span>
                  </motion.div>
                ))
              ) : (
                <div className="p-6 sm:p-8 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant/30 rounded-xl bg-surface-container-low">
                  No active chats in this workspace.
                </div>
              )}
            </div>

            {chats.length > 4 && (
              <button
                onClick={() => {
                  setChatSearchQuery('');
                  setShowAllChatsModal(true);
                }}
                disabled={isWorkspaceLoading}
                className="w-full py-4 text-sm text-on-surface-variant hover:text-primary border border-dashed border-outline-variant/40 rounded-xl hover:border-primary/30 transition-all flex items-center justify-center gap-2 cursor-pointer font-bold hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">history</span>
                More Chats
              </button>
            )}
          </div>

        </div>
      </motion.div>

      <ConfirmModal
        isOpen={!!projectToDelete}
        title="Delete Workspace"
        message={`Are you sure you want to permanently delete the workspace "${projectToDelete?.title}" and all of its chats and datasets? This action cannot be undone.`}
        confirmText="Yes, delete it"
        onConfirm={async () => {
          if (projectToDelete) {
            await deleteWorkspace(projectToDelete.id);
            setProjectToDelete(null);
          }
        }}
        onCancel={() => setProjectToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!chatToDelete}
        title="Delete Chat"
        message={`Are you sure you want to delete the chat "${chatToDelete?.title}"? This cannot be undone.`}
        confirmText="Yes, delete it"
        onConfirm={async () => {
          if (chatToDelete) {
            await deleteChat(chatToDelete.id);
            setChatToDelete(null);
          }
        }}
        onCancel={() => setChatToDelete(null)}
      />

      <AnimatePresence>
        {showAllChatsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowAllChatsModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="all-chats-modal relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-2xl"
            >
              <div className="flex items-center justify-between p-5 border-b border-outline-variant/30">
                <h3 className="text-lg font-bold text-primary">All Workspace Chats</h3>
                <button
                  onClick={() => setShowAllChatsModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-5 border-b border-outline-variant/20">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                    search
                  </span>
                  <input
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-low pl-10 pr-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary/30"
                  />
                </div>
              </div>
              <div className="all-chats-list p-5 overflow-y-auto custom-scrollbar max-h-[calc(80vh-145px)] space-y-3">
                {filteredModalChats.length > 0 ? filteredModalChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="all-chat-card w-full p-4 rounded-xl border border-outline-variant/30 hover:border-primary/30 hover:bg-surface-container-low transition-all text-left flex items-start gap-3 group/chattitle cursor-pointer"
                    onClick={() => {
                      if (editingChatId === chat.id) return;
                      setActiveChatId(chat.id);
                      setShowAllChatsModal(false);
                      navigate('/chat');
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      {editingChatId === chat.id ? (
                        <form onSubmit={(e) => handleRenameChatSubmit(e, chat.id)} className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            className="flex-1 bg-surface-container-high text-primary px-2 py-1 rounded border border-primary/50 text-sm font-bold outline-none"
                            value={editingChatTitle}
                            onChange={e => setEditingChatTitle(e.target.value)}
                            onBlur={(e) => handleRenameChatSubmit(e, chat.id)}
                          />
                        </form>
                      ) : (
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-bold text-primary truncate">{chat.title}</p>
                          <div className="opacity-0 group-hover/chattitle:opacity-100 flex items-center transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(chat.id);
                                setEditingChatTitle(chat.title);
                              }}
                              className="text-on-surface-variant hover:text-primary p-1"
                              title="Rename chat"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChatToDelete(chat);
                              }}
                              className="text-on-surface-variant hover:text-red-400 p-1 ml-1"
                              title="Delete chat"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-on-surface-variant truncate mt-1">{chat.snippet}</p>
                    </div>
                  </div>
                )) : (
                  <div className="p-6 sm:p-8 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant/30 rounded-xl bg-surface-container-low">
                    No chats found.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Dashboard;
