import React from 'react';
import {
  Film,
  FileText,
  Scissors,
  Layers,
  Settings,
  Plus,
  FolderOpen,
  Trash2,
  Copy,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';
import { Project } from '../types';

interface SidebarProps {
  currentTab: 'preview' | 'recap' | 'cutguide' | 'timeline' | 'settings';
  onSelectTab: (tab: 'preview' | 'recap' | 'cutguide' | 'timeline' | 'settings') => void;
  projects: Project[];
  activeProject: Project;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDuplicateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  projects,
  activeProject,
  onSelectProject,
  onNewProject,
  onDuplicateProject,
  onDeleteProject,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [showProjectsList, setShowProjectsList] = React.useState(false);

  const navItems = [
    {
      id: 'preview' as const,
      label: 'Video & Analysis',
      icon: Film,
      badge: activeProject.videoInfo?.fileName ? 'Loaded' : 'Empty',
    },
    {
      id: 'recap' as const,
      label: 'Recap Script',
      icon: FileText,
      badge: activeProject.analysis?.recapScript ? `${activeProject.analysis.wordCount || 0} w` : undefined,
    },
    {
      id: 'cutguide' as const,
      label: 'Cut Guide',
      icon: Scissors,
      badge: activeProject.analysis?.cutGuide?.length ? `${activeProject.analysis.cutGuide.length} cuts` : undefined,
    },
    {
      id: 'timeline' as const,
      label: 'Editing Timeline',
      icon: Layers,
      badge: activeProject.analysis?.cutGuide?.length ? `${activeProject.analysis.cutGuide.length}` : undefined,
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-72 bg-slate-950 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                Recap Studio <span className="text-amber-400 font-extrabold text-xs px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">AI</span>
              </h1>
              <p className="text-[11px] text-slate-400">Movie & Anime Recap Engine</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action: New Project Button */}
        <div className="p-3 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              onNewProject();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-md shadow-amber-500/10 hover:shadow-amber-500/25 active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            New Project
          </button>
        </div>

        {/* Active Project Card & Switcher */}
        <div className="p-3 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              Active Project
            </span>
            <button
              onClick={() => setShowProjectsList(!showProjectsList)}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-medium hover:underline flex items-center gap-0.5"
            >
              {projects.length} Total
              <ChevronRight
                className={`w-3 h-3 transition-transform ${showProjectsList ? 'rotate-90' : ''}`}
              />
            </button>
          </div>

          <div
            onClick={() => setShowProjectsList(!showProjectsList)}
            className="cursor-pointer p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
          >
            <div className="font-medium text-xs text-slate-200 truncate">
              {activeProject.name}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
              <span>{activeProject.settings.language}</span>
              <span>•</span>
              <span className="truncate">{activeProject.analysis?.detectedType || 'Pending'}</span>
            </div>
          </div>

          {/* Collapsible Project Selector */}
          {showProjectsList && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1 border-t border-slate-800 pt-2">
              {projects.map((proj) => {
                const isActive = proj.id === activeProject.id;
                return (
                  <div
                    key={proj.id}
                    className={`group/proj flex items-center justify-between p-2 rounded-md text-xs transition ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectProject(proj.id);
                        onCloseMobile();
                      }}
                      className="flex-1 text-left truncate mr-2"
                    >
                      {proj.name}
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover/proj:opacity-100 transition">
                      <button
                        title="Duplicate project"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateProject(proj);
                        }}
                        className="p-1 hover:text-white rounded"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {projects.length > 1 && (
                        <button
                          title="Delete project"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(proj.id);
                          }}
                          className="p-1 hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation Section */}
        <div className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1 tracking-wider">
            Workspace
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  isSelected
                    ? 'bg-slate-800/90 text-white border-l-2 border-amber-500 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 text-[11px] text-slate-400 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span>Gemini Engine</span>
            <span className="text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              {activeProject.settings.model || '3.8'}-flash active
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            Files API & Dual-Timeline Ready
          </div>
        </div>
      </aside>
    </>
  );
};
