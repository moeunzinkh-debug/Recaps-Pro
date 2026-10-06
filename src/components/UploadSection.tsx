import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Link as LinkIcon,
  Sparkles,
  Play,
  Film,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileVideo,
  Languages,
  Sliders,
  Tv,
} from 'lucide-react';
import { Project, SampleDemoVideo, VideoInfo } from '../types';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { formatTimecode } from '../utils/exportUtils';

interface UploadSectionProps {
  project: Project;
  onUpdateProject: (updated: Partial<Project>) => void;
  onStartAnalysis: () => void;
  isAnalyzing: boolean;
  analysisStep: string;
  analysisProgress: number;
  playerRef: React.RefObject<VideoPlayerRef | null>;
  onSeekTime: (seconds: number) => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  project,
  onUpdateProject,
  onStartAnalysis,
  isAnalyzing,
  analysisStep,
  analysisProgress,
  playerRef,
  onSeekTime,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleDemoVideo[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sample demo videos from server
  useEffect(() => {
    fetch('/api/samples')
      .then((res) => res.json())
      .then((data) => {
        if (data.samples) setSamples(data.samples);
      })
      .catch((err) => console.error('Error fetching sample videos:', err));
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      const videoInfo: VideoInfo = {
        fileName: file.name,
        storedName: data.file.storedName,
        filePath: data.file.filePath,
        mimeType: data.file.mimeType,
        size: data.file.size,
        videoUrl: data.file.videoUrl,
        detectedTitle: project.settings.movieName || file.name.replace(/\.[^/.]+$/, ''),
      };

      onUpdateProject({
        videoInfo,
        settings: {
          ...project.settings,
          movieName: project.settings.movieName || videoInfo.detectedTitle,
        },
      });
    } catch (err: any) {
      console.error('File upload error:', err);
      setUploadError(err.message || 'Video upload failed. Please try again with MP4, WebM, or MOV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput.trim(),
          title: project.settings.movieName || 'Imported Video',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to download video from URL');
      }

      const videoInfo: VideoInfo = {
        fileName: data.file.fileName,
        storedName: data.file.storedName,
        filePath: data.file.filePath,
        mimeType: data.file.mimeType,
        size: data.file.size,
        videoUrl: data.file.videoUrl,
        detectedTitle: project.settings.movieName || data.file.fileName.replace(/\.[^/.]+$/, ''),
      };

      onUpdateProject({
        videoInfo,
      });
      setUrlInput('');
    } catch (err: any) {
      console.error('URL import error:', err);
      setUploadError(err.message || 'Could not fetch video URL. Direct MP4/WebM URL is recommended.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectSample = (sample: SampleDemoVideo) => {
    setUploadError(null);
    const videoInfo: VideoInfo = {
      fileName: `${sample.title}.mp4`,
      storedName: sample.storedName || `${sample.id}.mp4`,
      filePath: `uploads/${sample.storedName || `${sample.id}.mp4`}`,
      mimeType: 'video/mp4',
      size: 2000000,
      videoUrl: sample.url,
      duration: sample.durationSec,
      detectedTitle: sample.title,
      detectedType: sample.type,
      isSample: true,
    };

    onUpdateProject({
      name: `${sample.title} (Recap)`,
      videoInfo,
      settings: {
        ...project.settings,
        movieName: sample.title,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Cinematic Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 p-6 md:p-8 border border-slate-800 shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Gemini Multimodal Story Intelligence
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Recap Studio AI
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-300 font-normal leading-relaxed">
            Turn your movie, anime episode, or series into a high-retention narration recap script and an accurate video cut guide with dual timestamps.
          </p>
        </div>
      </div>

      {/* Main Grid: Upload & Options vs Video Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Options (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Upload Drop Zone Card */}
          <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-800 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-amber-400" />
                Upload Source Video
              </span>
              <span className="text-[11px] text-slate-400 font-normal">MP4, MOV, WebM, AVI</span>
            </h2>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                isDragOver
                  ? 'border-amber-400 bg-amber-400/10'
                  : 'border-slate-700/80 hover:border-amber-500/60 bg-slate-950/50 hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm,.avi,.mkv,.mpeg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-amber-400 mb-1 shadow-inner">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-slate-200">
                Drag & Drop Video Here
              </div>
              <div className="text-[11px] text-slate-400">
                or <span className="text-amber-400 underline font-medium">Browse Files</span> on your device
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Supports up to 1GB • Processed via Gemini Files API
              </div>
            </div>

            {/* URL Input */}
            <form onSubmit={handleUrlSubmit} className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                Or Import via YouTube / Video URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!urlInput.trim() || isUploading}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition disabled:opacity-50"
                >
                  Import
                </button>
              </div>
            </form>

            {/* Demo Sample Pickers */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Try Demo Sample Video</span>
                <span className="text-amber-400/90 lowercase text-[10px] font-normal">1-click test</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {samples.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSample(s)}
                    disabled={isUploading}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 text-left transition group"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-medium text-slate-200 group-hover:text-amber-300 truncate">
                        {s.title}
                      </div>
                      <div className="text-[10px] text-slate-400">{s.type} • {s.duration}</div>
                    </div>
                    <Play className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {uploadError && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Project & Recap Parameters */}
          <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-800 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Recap Configuration
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Movie / Anime Title
                </label>
                <input
                  type="text"
                  placeholder="Auto-detect if empty"
                  value={project.settings.movieName || ''}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, movieName: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Episode Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ep 1 or Movie"
                  value={project.settings.episodeNumber || ''}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, episodeNumber: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                  <Languages className="w-3 h-3 text-amber-400" />
                  Language
                </label>
                <select
                  value={project.settings.language}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, language: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Khmer">ភាសាខ្មែរ (Khmer - Default)</option>
                  <option value="English">English</option>
                  <option value="Thai">ภาษาไทย (Thai)</option>
                  <option value="Vietnamese">Tiếng Việt (Vietnamese)</option>
                  <option value="Chinese">中文 (Chinese)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Recap Style
                </label>
                <select
                  value={project.settings.recapStyle}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, recapStyle: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Balanced">Balanced (Story + Action)</option>
                  <option value="Fast">Fast Paced (High Retention)</option>
                  <option value="Detailed">Detailed (Lore & Nuance)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Narration Tone
                </label>
                <select
                  value={project.settings.narrationTone}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, narrationTone: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Suspenseful">Suspenseful (Cliffhangers)</option>
                  <option value="Dramatic">Dramatic (Emotional Stakes)</option>
                  <option value="Casual">Casual (Friendly Conversational)</option>
                  <option value="Professional">Professional (Cinematic)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Target Duration
                </label>
                <select
                  value={project.settings.targetDuration}
                  onChange={(e) =>
                    onUpdateProject({
                      settings: { ...project.settings, targetDuration: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="3 minutes">3 Minutes (Short format)</option>
                  <option value="5 minutes">5 Minutes (Standard YouTube)</option>
                  <option value="10 minutes">10 Minutes (Deep recap)</option>
                  <option value="15 minutes">15 Minutes (Extended)</option>
                  <option value="20 minutes">20 Minutes (Full episode)</option>
                </select>
              </div>
            </div>

            {/* Model Dropdown Menu (3.5, 3.6, 3.7, 3.8) */}
            <div className="pt-1">
              <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Gemini Model Version
                </span>
                <span className="text-[10px] font-mono text-amber-400">
                  gemini-{project.settings.model || '3.8'}-flash
                </span>
              </label>
              <select
                value={project.settings.model || '3.8'}
                onChange={(e) =>
                  onUpdateProject({
                    settings: { ...project.settings, model: e.target.value as any },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                <option value="3.8">Gemini 3.8 Flash (Flagship Video Comprehension - Recommended)</option>
                <option value="3.7">Gemini 3.7 Flash (High Performance Multimodal)</option>
                <option value="3.6">Gemini 3.6 Flash (Fast & Balanced)</option>
                <option value="3.5">Gemini 3.5 Flash (Efficient Standard)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Video Preview & Primary Analyze Trigger (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-800 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-amber-400" />
                Video Monitor
              </h2>
              {project.videoInfo?.fileName && (
                <span className="text-xs font-mono text-slate-400 truncate max-w-xs">
                  {project.videoInfo.fileName}
                </span>
              )}
            </div>

            {/* Video Player */}
            <VideoPlayer
              ref={playerRef}
              src={project.videoInfo?.videoUrl}
              onLoadedMetadata={(duration) => {
                if (!project.videoInfo?.duration) {
                  onUpdateProject({
                    videoInfo: {
                      ...project.videoInfo!,
                      duration,
                    },
                  });
                }
              }}
              className="w-full"
            />

            {/* Video Details Card */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950/70 rounded-lg border border-slate-800/80 text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Duration</div>
                <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                  {project.videoInfo?.duration
                    ? formatTimecode(project.videoInfo.duration)
                    : '00:00:00'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Format</div>
                <div className="text-xs font-mono text-slate-300 mt-0.5">
                  {project.videoInfo?.mimeType?.split('/')[1]?.toUpperCase() || 'MP4'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Status</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {project.videoInfo?.storedName ? 'Ready' : 'Awaiting Video'}
                </div>
              </div>
            </div>

            {/* PRIMARY CALL-TO-ACTION BUTTON */}
            <div className="pt-2">
              <button
                type="button"
                disabled={!project.videoInfo?.storedName || isAnalyzing || isUploading}
                onClick={onStartAnalysis}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-base tracking-wide uppercase shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 glow-amber"
              >
                <Sparkles className="w-5 h-5 fill-current animate-spin" style={{ animationDuration: isAnalyzing ? '2s' : '0s' }} />
                <span>{isAnalyzing ? 'ANALYZING VIDEO...' : 'ANALYZE VIDEO'}</span>
              </button>
            </div>

            {/* Active Analysis Progress Card */}
            {isAnalyzing && (
              <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-xl space-y-3 animate-fade-in shadow-xl">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-400 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                    {analysisStep}
                  </span>
                  <span className="font-mono text-slate-400 font-bold">{analysisProgress}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-300 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                  <span>Gemini Files API Multimodal Video Processing</span>
                  <span className="text-amber-300/80">Please do not close tab</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Summary of Detected Analysis if already present */}
          {project.analysis && !isAnalyzing && (
            <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-800 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Analyzed Content
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20">
                  {project.analysis.detectedType}
                </span>
              </div>
              <h3 className="text-base font-bold text-white">
                {project.analysis.detectedTitle}
              </h3>
              <p className="text-xs text-slate-300 font-khmer leading-relaxed line-clamp-2">
                {project.analysis.synopsis}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.analysis.detectedCharacters?.map((c, i) => (
                  <span key={i} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
