import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { useMotionConfig } from '../lib/motionConfig';
import { Globe, Folder, ChevronDown, Plus, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export function ProjectSwitcher() {
  const {
    projects,
    currentProjectId,
    getCurrentProject,
    switchProject,
    addProject,
    removeProject,
  } = useSkillStore();

  const { getTransition } = useMotionConfig();
  const [open_, setOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentProject = getCurrentProject();
  const springMedium = getTransition('medium');
  const springFast = getTransition('fast');

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sort projects by last opened (most recent first)
  const recentProjects = [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

  const handleSwitchToGlobal = () => {
    switchProject(null);
    setOpen(false);
  };

  const handleSwitchToProject = (projectId: string) => {
    switchProject(projectId);
    setOpen(false);
  };

  const handleAddProject = async () => {
    setShowAddDialog(true);
    setOpen(false);
  };

  const handlePickFolder = async () => {
    try {
      setAddingProject(true);
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择项目目录',
      });
      if (selected && typeof selected === 'string') {
        await addProject(selected);
        setShowAddDialog(false);
      }
    } catch (e) {
      console.error('Failed to pick folder:', e);
    } finally {
      setAddingProject(false);
    }
  };

  const handleRemoveProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('确定要从列表中移除该项目吗？（不会删除文件）')) {
      removeProject(projectId);
    }
  };

  const displayName = currentProject ? currentProject.name : '全局';
  const isGlobal = !currentProjectId;

  return (
    <div ref={ref} className="relative">
      {/* Switcher Button */}
      <motion.button
        onClick={() => setOpen(!open_)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-trae-card/60 border border-trae-border hover:border-trae-accent/30 hover:bg-trae-card/80 transition-all text-sm"
      >
        {isGlobal ? (
          <Globe className="w-4 h-4 text-trae-accent" />
        ) : (
          <Folder className="w-4 h-4 text-trae-accent" />
        )}
        <span className="text-trae-text font-medium max-w-[160px] truncate">
          {displayName}
        </span>
        <motion.span
          animate={{ rotate: open_ ? 180 : 0 }}
          transition={springFast}
        >
          <ChevronDown className="w-3.5 h-3.5 text-trae-text-secondary" />
        </motion.span>
      </motion.button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {open_ && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={springFast}
            className="absolute top-full left-0 mt-1.5 w-64 bg-trae-sidebar border border-trae-border rounded-xl shadow-hard z-50 py-1.5 overflow-hidden"
          >
            {/* Global option */}
            <motion.button
              whileHover={{ x: 2 }}
              onClick={handleSwitchToGlobal}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                isGlobal
                  ? 'text-trae-accent bg-trae-accent/10 font-medium'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">全局</span>
              {isGlobal && <CheckIcon />}
            </motion.button>

            {/* Divider */}
            {recentProjects.length > 0 && (
              <div className="mx-2 my-1 h-px bg-trae-border/60" />
            )}

            {/* Recent projects */}
            {recentProjects.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto">
                {recentProjects.map((project, i) => {
                  const isActive = project.id === currentProjectId;
                  return (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02, ...springFast }}
                      className="group relative"
                    >
                      <motion.button
                        whileHover={{ x: 2 }}
                        onClick={() => handleSwitchToProject(project.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? 'text-trae-accent bg-trae-accent/10 font-medium'
                            : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-left truncate">
                          {project.name}
                        </span>
                        <span className="text-[10px] text-trae-text-secondary/60">
                          {project.skillCount} 个
                        </span>
                        {isActive && <CheckIcon />}
                      </motion.button>
                      {/* Remove button (shown on hover) */}
                      <button
                        onClick={(e) => handleRemoveProject(e, project.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-trae-text-secondary hover:text-trae-danger opacity-0 group-hover:opacity-100 transition-opacity hover:bg-trae-danger/10"
                        title="移除项目"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Divider */}
            <div className="mx-2 my-1 h-px bg-trae-border/60" />

            {/* Add project button */}
            <motion.button
              whileHover={{ x: 2 }}
              onClick={handleAddProject}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-trae-text-secondary hover:text-trae-accent hover:bg-trae-accent/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加项目...</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Project Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => !addingProject && setShowAddDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={springMedium}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 max-w-[90vw] bg-trae-sidebar border border-trae-border rounded-xl shadow-hard overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                <h3 className="text-trae-text font-semibold text-base">
                  添加项目
                </h3>
                {!addingProject && (
                  <button
                    onClick={() => setShowAddDialog(false)}
                    className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-5">
                <p className="text-sm text-trae-text-secondary mb-4">
                  选择项目根目录，将自动检测 .trae/skills/ 目录下的项目级 Skill。
                </p>

                <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-xs text-trae-text-secondary mb-2">
                    <Folder className="w-3.5 h-3.5 text-trae-accent" />
                    <span>项目技能目录</span>
                  </div>
                  <p className="text-xs text-trae-text/80 font-mono break-all">
                    {'<项目目录>/.trae/skills/'}
                  </p>
                </div>

                <motion.button
                  onClick={handlePickFolder}
                  disabled={addingProject}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingProject ? (
                  <>
                    <div className="w-4 h-4 border-2 border-trae-accent border-t-transparent rounded-full animate-spin" />
                    选择中...
                  </>
                ) : (
                  <>
                    <Folder className="w-4 h-4" />
                    选择项目目录
                  </>
                )}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-trae-accent"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
