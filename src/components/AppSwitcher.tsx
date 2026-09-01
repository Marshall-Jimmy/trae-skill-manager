import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { useMotionConfig } from '../lib/motionConfig';
import { ChevronDown, Globe, Folder, Plus, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ToolIcon } from './ToolIcon';

// 顶栏应用名：展示当前目标应用，点击展开「应用 + 项目」切换菜单，
// 替代原先独立的 ProjectSwitcher 与 ToolSelector，让地址栏简化为应用名。
export function AppSwitcher() {
  const {
    toolsStatus,
    activeToolId,
    switchTool,
    getActiveTool,
    projects,
    currentProjectId,
    switchProject,
    addProject,
    removeProject,
  } = useSkillStore();

  const { getTransition } = useMotionConfig();
  const [open_, setOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const springFast = getTransition('fast');

  const activeTool = getActiveTool();
  const recentProjects = [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchTool = (toolId: string) => {
    if (toolId !== activeToolId) switchTool(toolId);
    setOpen(false);
  };

  const handleSwitchProject = (projectId: string | null) => {
    switchProject(projectId);
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

  return (
    <div ref={ref} className="relative">
      {/* 应用名按钮 */}
      <motion.button
        onClick={() => setOpen(!open_)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-3 py-1.5 bg-trae-card/60 border border-trae-border hover:border-trae-accent/30 hover:bg-trae-card/80 transition-all text-sm"
        title={activeTool ? `当前应用：${activeTool.displayName}` : '选择应用'}
      >
        {activeTool ? (
          <ToolIcon id={activeTool.id} className="w-4 h-4" />
        ) : (
          <Globe className="w-4 h-4 text-trae-accent" />
        )}
        <span className="text-trae-text font-medium max-w-[140px] truncate">
          {activeTool?.displayName || 'Trae'}
        </span>
        <motion.span animate={{ rotate: open_ ? 180 : 0 }} transition={springFast}>
          <ChevronDown className="w-3.5 h-3.5 text-trae-text-secondary" />
        </motion.span>
      </motion.button>

      {/* 下拉菜单：应用 + 项目 */}
      <AnimatePresence>
        {open_ && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={springFast}
            className="absolute top-full left-0 mt-1.5 w-64 bg-trae-sidebar border border-trae-border shadow-hard z-50 py-1.5 overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider">
              应用
            </div>
            {toolsStatus.map((tool) => {
              const isActive = tool.id === activeToolId;
              return (
                <motion.button
                  key={tool.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleSwitchTool(tool.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'text-trae-accent bg-trae-accent/10 font-medium'
                      : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
                  }`}
                >
                  <ToolIcon id={tool.id} className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left truncate">{tool.displayName}</span>
                  {tool.running ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-trae-success/15 text-trae-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-trae-success animate-pulse" />
                      运行中
                    </span>
                  ) : tool.installed ? (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-trae-accent/15 text-trae-accent">
                      已安装
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-trae-card/60 text-trae-text-secondary/60">
                      未安装
                    </span>
                  )}
                </motion.button>
              );
            })}

            <div className="mx-2 my-1 h-px bg-trae-border/60" />

            <div className="px-3 py-1.5 text-[10px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider">
              项目
            </div>
            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => handleSwitchProject(null)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                !currentProjectId
                  ? 'text-trae-accent bg-trae-accent/10 font-medium'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">全局</span>
              {!currentProjectId && <CheckIcon />}
            </motion.button>

            {recentProjects.length > 0 && (
              <div className="max-h-[160px] overflow-y-auto">
                {recentProjects.map((project) => {
                  const isActive = project.id === currentProjectId;
                  return (
                    <div key={project.id} className="group relative">
                      <motion.button
                        whileHover={{ x: 2 }}
                        onClick={() => handleSwitchProject(project.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? 'text-trae-accent bg-trae-accent/10 font-medium'
                            : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-left truncate">{project.name}</span>
                        {isActive && <CheckIcon />}
                      </motion.button>
                      <button
                        onClick={(e) => handleRemoveProject(e, project.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-trae-text-secondary hover:text-trae-danger opacity-0 group-hover:opacity-100 transition-opacity hover:bg-trae-danger/10"
                        title="移除项目"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mx-2 my-1 h-px bg-trae-border/60" />

            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => {
                setShowAddDialog(true);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-trae-text-secondary hover:text-trae-accent hover:bg-trae-accent/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加项目...</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 添加项目对话框 */}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={springFast}
                className="pointer-events-auto w-96 max-w-[90vw] bg-trae-sidebar border border-trae-border shadow-hard overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                  <h3 className="text-trae-text font-semibold text-base">添加项目</h3>
                  {!addingProject && (
                    <button
                      onClick={() => setShowAddDialog(false)}
                      className="p-1.5 text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="p-5">
                  <p className="text-sm text-trae-text-secondary mb-4">
                    选择项目根目录，将自动检测 .trae/skills/ 目录下的项目级 Skill。
                  </p>

                  <div className="bg-trae-card/30 border border-trae-border p-4 mb-4">
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
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
