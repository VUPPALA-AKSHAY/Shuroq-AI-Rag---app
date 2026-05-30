import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { SidebarToggleIcon } from './unlumen-ui/sidebar-toggle-icon';

const Layout = ({ children }) => {
  const {
    user,
    projects,
    activeProjectId,
    setActiveProjectId,
    addProject,
    renameWorkspace,
    logout
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  ));
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingWorkspaceTitle, setEditingWorkspaceTitle] = useState('');

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const userInitial = (user?.name || user?.email || 'A').trim().charAt(0).toUpperCase();

  const handleRenameSubmit = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingWorkspaceTitle.trim()) {
      await renameWorkspace(id, editingWorkspaceTitle.trim());
    }
    setEditingWorkspaceId(null);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await addProject(newProjectName, 'AI research and datasets analysis workspace.');
    setNewProjectName('');
    setShowNewProjectForm(false);
    navigate('/');
  };

  const closeSidebarOnNarrow = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: 'dashboard' },
    { name: 'Analysis', path: '/chat', icon: 'analytics' },
    { name: 'Datasets', path: '/kaggle', icon: 'database' },
    { name: 'Settings', path: '/settings', icon: 'settings' },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#0f0f10] text-on-surface">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] items-center justify-center bg-[#0f0f10] transition-[width,transform] duration-300 ease-out ${
        sidebarOpen ? 'w-[min(340px,calc(100vw-12px))] lg:w-[340px]' : 'w-[76px] lg:w-[92px]'
      }`}>
        <div className={`app-sidebar-panel relative flex h-[calc(100dvh-16px)] flex-col rounded-2xl border border-[#2a2a2d] bg-[#151517] shadow-2xl shadow-black/40 transition-all duration-300 ease-out lg:h-[calc(100vh-24px)] ${
          sidebarOpen ? 'w-[min(318px,calc(100vw-24px))] px-4 py-4 lg:w-[318px] lg:px-5 lg:py-5' : 'w-[58px] px-2 py-4 lg:w-[64px] lg:px-2.5 lg:py-5'
        }`}>
          <div className={`flex items-center ${sidebarOpen ? 'gap-3 px-2 pb-8 pt-1' : 'justify-center pb-6 pt-1'}`}>
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
              <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#22f488,#12c971,#087c43,#22f488)]" />
              <div className="absolute inset-[5px] rounded-full bg-[#151517]" />
              <div className="absolute h-1.5 w-1.5 rounded-full bg-[#22f488]" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <span className="block truncate text-[18px] font-extrabold tracking-[-0.01em] text-[#f4f4f5]">Shuroq AI</span>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-[#8f8f98]">AI Intelligence Platform</p>
              </div>
            )}
            {sidebarOpen && <div className="flex-1" />}
            {sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(prev => !prev)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a2a2d] bg-[#18181b] text-[#dcdce2] shadow-lg shadow-black/30 transition-all hover:bg-[#232327] hover:text-white"
                aria-label="Toggle Sidebar"
                title="Toggle Sidebar"
              >
                <SidebarToggleIcon isOpen={sidebarOpen} className="w-5 h-5" />
              </button>
            )}
          </div>

          {!sidebarOpen && (
            <div className="flex justify-center pb-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2a2a2d] bg-[#18181b] text-[#dcdce2] shadow-lg shadow-black/30 transition-all hover:bg-[#232327] hover:text-white"
                aria-label="Open Sidebar"
                title="Open Sidebar"
              >
                <SidebarToggleIcon isOpen={false} className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className={`relative mb-4 ${sidebarOpen ? '' : 'flex justify-center'}`}>
            {sidebarOpen ? (
              <>
                <label className="mb-2 block px-2 text-[10px] font-bold uppercase tracking-wider text-[#85858f]">Active Workspace</label>
                <button
                  type="button"
                  onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-[#2a2a2d] bg-[#1a1a1d] px-4 text-sm font-bold text-[#f1f1f3] transition-all hover:border-[#424248] hover:bg-[#202024]"
                >
                  <span className="truncate">{activeProject?.title}</span>
                  <span className="material-symbols-outlined text-[18px] text-[#a8a8b0]">keyboard_arrow_down</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2a2a2d] bg-[#1a1a1d] font-semibold text-[#e7e7eb] transition-all hover:border-[#424248] hover:bg-[#232327]"
                title={activeProject?.title}
              >
                <span className="material-symbols-outlined text-[20px]">workspaces</span>
              </button>
            )}

            {showWorkspaceDropdown && (
              <div className={`absolute top-[100%] z-50 mt-2 rounded-xl border border-[#2a2a2d] bg-[#18181b] p-2 shadow-2xl shadow-black/50 ${
                sidebarOpen ? 'left-0 right-0' : 'left-full ml-2 w-56'
              }`}>
                <div className="custom-scrollbar max-h-40 space-y-1 overflow-y-auto">
                  {projects.map((p) => (
                    <div key={p.id} className="group/sidebaritem flex w-full flex-col">
                      {editingWorkspaceId === p.id ? (
                        <form onSubmit={(e) => handleRenameSubmit(e, p.id)} className="w-full p-1" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            value={editingWorkspaceTitle}
                            onChange={(e) => setEditingWorkspaceTitle(e.target.value)}
                            onBlur={(e) => handleRenameSubmit(e, p.id)}
                            className="w-full rounded border border-white/20 bg-[#222226] px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-primary/50"
                          />
                        </form>
                      ) : (
                        <div className={`flex w-full items-center justify-between rounded px-2 py-1 transition-all ${
                            p.id === activeProjectId
                              ? 'border border-white/15 bg-white/10 text-white'
                              : 'text-[#aaaab3] hover:bg-white/5 hover:text-white'
                          }`}>
                          <button
                            onClick={() => {
                              setActiveProjectId(p.id);
                              setShowWorkspaceDropdown(false);
                              closeSidebarOnNarrow();
                              navigate('/');
                            }}
                            className="flex-1 truncate text-left text-xs font-semibold px-1 py-1"
                          >
                            {p.title}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWorkspaceId(p.id);
                              setEditingWorkspaceTitle(p.title);
                            }}
                            className="ml-1 flex-shrink-0 rounded p-1.5 text-[#aaaab3] opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover/sidebaritem:opacity-100 flex items-center justify-center"
                            title="Rename Workspace"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-white/10 pt-2 px-1 pb-1">
                  {showNewProjectForm ? (
                    <form onSubmit={handleCreateProject} className="flex gap-2 w-full">
                      <input
                        type="text"
                        placeholder="New workspace..."
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#1a1a1d] px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                      <button 
                        type="submit" 
                        disabled={!newProjectName.trim()}
                        className="flex items-center justify-center rounded-lg bg-primary px-3 text-black transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Create Workspace"
                      >
                        <span className="material-symbols-outlined text-[18px] font-bold">add</span>
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewProjectForm(true)}
                      className="w-full rounded-lg border border-dashed border-white/15 py-2 text-center text-xs font-bold text-[#aaaab3] transition-all hover:border-white/30 hover:text-white hover:bg-white/5"
                    >
                      + Create Workspace
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <nav className={`flex flex-col ${sidebarOpen ? 'gap-2' : 'items-center gap-3'}`}>
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/' || location.pathname === '/dashboard'
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  title={sidebarOpen ? undefined : item.name}
                  className={() =>
                    `flex items-center transition-all duration-200 ${
                      sidebarOpen
                        ? `h-11 w-full gap-3 rounded-xl px-3 ${isActive ? 'bg-[#242427] text-white shadow-inner shadow-white/5' : 'text-[#f0f0f2] hover:bg-[#1f1f22] hover:text-white'}`
                        : `h-10 w-10 justify-center rounded-xl ${isActive ? 'bg-[#242427] text-white shadow-inner shadow-white/5' : 'text-[#dfdfe3] hover:bg-[#242427] hover:text-white'}`
                    }`
                  }
                  onClick={closeSidebarOnNarrow}
                >
                  <span className={`material-symbols-outlined ${sidebarOpen ? 'text-[22px]' : 'text-[21px]'}`}>{item.icon}</span>
                  {sidebarOpen && <span className="truncate text-[16px] font-extrabold leading-tight lg:text-[18px] pb-[1px]">{item.name}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className={`mt-auto ${sidebarOpen ? '' : 'flex flex-col items-center'}`}>
            {sidebarOpen ? (
              <div className="flex h-14 items-center justify-between rounded-xl border border-[#2c2c31] bg-[#222226] px-3 text-[#f4f4f5]">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7d51d9] text-lg font-bold text-white">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{user?.name}</p>
                    <p className="truncate text-[11px] text-[#aaaab3]">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="rounded-lg p-1.5 text-[#aaaab3] transition-colors hover:bg-white/10 hover:text-white"
                  title="Logout"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={logout}
                title={`${user?.name} (${user?.email})`}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7d51d9] text-lg font-bold text-white ring-2 ring-[#2c2c31]"
              >
                {userInitial}
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className={`relative flex h-[100dvh] min-w-0 flex-1 flex-col bg-surface-container-lowest transition-[margin] duration-300 ease-out ${
        sidebarOpen ? 'ml-[76px] lg:ml-[340px]' : 'ml-[76px] lg:ml-[92px]'
      }`}>
        {children}
      </div>
    </div>
  );
};

export default Layout;
