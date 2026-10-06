import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Key,
  ShieldCheck,
  Cpu,
  Layers,
} from 'lucide-react';
import { Project } from './types';
import {
  loadProjectsFromStorage,
  saveProjectsToStorage,
  getActiveProjectId,
  setActiveProjectId,
  createNewProject,
  duplicateProject,
  getStoredApiKey,
} from './utils/storage';
import { pollAnalyzeJob, startAnalyze, AnalyzeJobStatus } from './utils/apiClient';
import { Sidebar } from './components/Sidebar';
import { UploadSection } from './components/UploadSection';
import { RecapView } from './components/RecapView';
import { CutGuideView } from './components/CutGuideView';
import { TimelineView } from './components/TimelineView';
import { SettingsView } from './components/SettingsView';
import { VideoPlayerRef } from './components/VideoPlayer';

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjectsFromStorage());
  const [activeProjectId, setActiveId] = useState<string>(() =>
    getActiveProjectId(loadProjectsFromStorage())
  );
  const [currentTab, setCurrentTab] = useState<
    'preview' | 'recap' | 'cutguide' | 'timeline' | 'settings'
  >('preview');

  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('Initializing Gemini video engine...');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Shared VideoPlayer reference
  const playerRef = useRef<VideoPlayerRef | null>(null);

  // Check API key status on mount
  useEffect(() => {
    fetch('/api/api-key-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasKey) {
          setHasApiKey(true);
        } else {
          const localKey = getStoredApiKey();
          if (localKey && localKey.trim()) {
            setHasApiKey(true);
            fetch('/api/set-api-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: localKey.trim() }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [currentTab]);

  // Save projects to localStorage whenever updated
  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || createNewProject();

  const handleUpdateActiveProject = (updated: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === activeProject.id) {
          return {
            ...p,
            ...updated,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      })
    );
  };

  const handleSelectProject = (id: string) => {
    setActiveId(id);
    setActiveProjectId(id);
  };

  const handleNewProject = () => {
    const newProj = createNewProject(`Project #${projects.length + 1}`);
    setProjects((prev) => [newProj, ...prev]);
    setActiveId(newProj.id);
    setActiveProjectId(newProj.id);
    setCurrentTab('preview');
  };

  const handleDuplicateProject = (source: Project) => {
    const copy = duplicateProject(source);
    setProjects((prev) => [copy, ...prev]);
    setActiveId(copy.id);
    setActiveProjectId(copy.id);
  };

  const handleDeleteProject = (id: string) => {
    if (projects.length <= 1) {
      alert('You must keep at least one project.');
      return;
    }
    if (confirm('Are you sure you want to delete this project?')) {
      const remaining = projects.filter((p) => p.id !== id);
      setProjects(remaining);
      const nextActive = remaining[0].id;
      setActiveId(nextActive);
      setActiveProjectId(nextActive);
    }
  };

  // Run Gemini Video Analysis
  const handleStartAnalysis = async () => {
    if (!activeProject.videoInfo?.storedName) {
      alert('Please upload a video or pick a demo sample first.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(10);
    setAnalysisStep('Uploading video to Gemini engine...');

    // Animated progress simulation for user feedback while Gemini processes on server
    const steps = [
      { step: 'Uploading video to Gemini Files API...', targetProg: 25, delay: 2000 },
      { step: 'Analyzing video composition & audio cues...', targetProg: 40, delay: 5000 },
      { step: 'Understanding characters, actions & dialogue...', targetProg: 55, delay: 9000 },
      { step: 'Detecting important events, powers & twists...', targetProg: 70, delay: 14000 },
      { step: 'Building chronological story timeline...', targetProg: 82, delay: 18000 },
      { step: 'Writing natural conversational recap script...', targetProg: 90, delay: 22000 },
      { step: 'Matching exact visual cuts & dual timestamps...', targetProg: 96, delay: 26000 },
    ];

    const stepTimers: NodeJS.Timeout[] = [];
    steps.forEach(({ step, targetProg, delay }) => {
      const t = setTimeout(() => {
        setAnalysisStep(step);
        setAnalysisProgress(targetProg);
      }, delay);
      stepTimers.push(t);
    });

    try {
      const storedKey = getStoredApiKey() || undefined;

      // Both backends share this call. The Express server answers synchronously
      // with `data`; the Cloudflare Worker answers with a `jobId` that is polled
      // below (a Worker request cannot stay open while Gemini processes a video).
      const started = await startAnalyze(
        {
          storedName: activeProject.videoInfo.storedName,
          movieName: activeProject.settings.movieName,
          episodeNumber: activeProject.settings.episodeNumber,
          language: activeProject.settings.language,
          recapStyle: activeProject.settings.recapStyle,
          narrationTone: activeProject.settings.narrationTone,
          targetDuration: activeProject.settings.targetDuration,
          customDurationMinutes: activeProject.settings.customDurationMinutes,
          model: activeProject.settings.model || '3.8',
          apiKey: storedKey,
        },
        storedKey
      );

      let analysis = started.data;

      if (!analysis && started.jobId) {
        // Worker path — stop the simulated progress and follow real progress.
        stepTimers.forEach(clearTimeout);

        setAnalysisStep(started.message || 'Uploading video to Gemini engine...');
        if (typeof started.progress === 'number') setAnalysisProgress(started.progress);

        analysis = await pollAnalyzeJob({
          jobId: started.jobId,
          apiKey: storedKey,
          onStatus: (status: AnalyzeJobStatus) => {
            if (status.message) setAnalysisStep(status.message);
            if (typeof status.progress === 'number') {
              setAnalysisProgress((prev) => Math.max(prev, status.progress as number));
            }
          },
        });
      }

      stepTimers.forEach(clearTimeout);

      if (!analysis) {
        throw new Error('The analysis finished without any recap data. Please try again.');
      }

      setAnalysisProgress(100);
      setAnalysisStep('Analysis complete! Ready to review.');

      // Update project with real generated data
      handleUpdateActiveProject({
        name: `${analysis.detectedTitle || activeProject.name} (Recap)`,
        analysis,
      });

      // Switch to Recap Script view automatically after brief celebration
      setTimeout(() => {
        setIsAnalyzing(false);
        setCurrentTab('recap');
      }, 1000);
    } catch (err: any) {
      stepTimers.forEach(clearTimeout);
      console.error('Analysis error:', err);
      setIsAnalyzing(false);
      setAnalysisError(err.message || 'Video processing failed. Please try again.');
    }
  };

  return (
    <div className="flex h-screen bg-[#0b0f17] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Component */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Universal Top Header Bar */}
        <header className="h-14 bg-slate-950/90 border-b border-slate-800/80 px-4 md:px-6 flex items-center justify-between z-20 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsOpenMobile(true)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm text-white hidden sm:inline flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Recap Studio <span className="text-amber-400 text-xs font-mono font-bold">AI</span>
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="text-xs font-mono text-slate-300 truncate max-w-[140px] sm:max-w-xs">
                {activeProject.name}
              </span>
            </div>
          </div>

          {/* Header Action Badges & API Key Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Active Model Indicator */}
            <div
              onClick={() => setCurrentTab('settings')}
              title="Click to change model in Settings"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 hover:border-amber-500/50 cursor-pointer transition"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>gemini-{activeProject.settings.model || '3.8'}-flash</span>
            </div>

            {/* API Key Status / Add Key Action Button */}
            {hasApiKey ? (
              <button
                onClick={() => setCurrentTab('settings')}
                title="Gemini API Key configured. Click to manage."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">API Connected</span>
                <span className="sm:hidden">Connected</span>
              </button>
            ) : (
              <button
                onClick={() => setCurrentTab('settings')}
                title="Add your Gemini API Key in Settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition shadow-md shadow-amber-500/10 active:scale-95 animate-pulse"
              >
                <Key className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add API Key</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Error Banner if any */}
        {analysisError && (
          <div className="bg-red-950/80 border-b border-red-800 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
            <button
              onClick={() => setAnalysisError(null)}
              className="text-red-300 hover:text-white underline font-semibold text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Content Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {currentTab === 'preview' && (
            <UploadSection
              project={activeProject}
              onUpdateProject={handleUpdateActiveProject}
              onStartAnalysis={handleStartAnalysis}
              isAnalyzing={isAnalyzing}
              analysisStep={analysisStep}
              analysisProgress={analysisProgress}
              playerRef={playerRef}
              onSeekTime={(sec) => playerRef.current?.seekTo(sec)}
            />
          )}

          {currentTab === 'recap' && (
            <RecapView
              project={activeProject}
              onUpdateProject={handleUpdateActiveProject}
              onNavigateToCutGuide={() => setCurrentTab('cutguide')}
            />
          )}

          {currentTab === 'cutguide' && (
            <CutGuideView
              project={activeProject}
              onUpdateProject={handleUpdateActiveProject}
              playerRef={playerRef}
              onJumpToVideoTab={() => setCurrentTab('preview')}
            />
          )}

          {currentTab === 'timeline' && (
            <TimelineView
              project={activeProject}
              onUpdateProject={handleUpdateActiveProject}
              playerRef={playerRef}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              project={activeProject}
              onUpdateProject={handleUpdateActiveProject}
            />
          )}
        </main>
      </div>
    </div>
  );
}
