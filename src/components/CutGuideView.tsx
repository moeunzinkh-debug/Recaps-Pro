import React, { useState, useMemo } from 'react';
import {
  Scissors,
  Search,
  Play,
  Clock,
  Sparkles,
  Download,
  Filter,
  Copy,
  Check,
  Edit2,
  ExternalLink,
  Tag,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { CutItem, Project, CutCategory } from '../types';
import { VideoPlayerRef } from './VideoPlayer';
import { exportToCsv, exportToSrt, exportToTxt, exportToJson } from '../utils/exportUtils';

interface CutGuideViewProps {
  project: Project;
  onUpdateProject: (updated: Partial<Project>) => void;
  playerRef: React.RefObject<VideoPlayerRef | null>;
  onJumpToVideoTab: () => void;
}

const CATEGORIES: CutCategory[] = [
  'All',
  'Action',
  'Dialogue',
  'Character',
  'Important Event',
  'Flashback',
  'Power',
  'Transformation',
  'Plot Twist',
  'Climax',
  'Ending',
];

export const CutGuideView: React.FC<CutGuideViewProps> = ({
  project,
  onUpdateProject,
  playerRef,
  onJumpToVideoTab,
}) => {
  const cuts = project.analysis?.cutGuide || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedCutId, setCopiedCutId] = useState<string | null>(null);
  const [activePlayingCutId, setActivePlayingCutId] = useState<string | null>(null);

  // Edit cut state
  const [editingCut, setEditingCut] = useState<CutItem | null>(null);

  // Filter cuts by search query and category
  const filteredCuts = useMemo(() => {
    return cuts.filter((cut) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        cut.category?.toLowerCase() === selectedCategory.toLowerCase();

      if (!matchesCategory) return false;

      if (!searchTerm.trim()) return true;

      const q = searchTerm.toLowerCase();
      const matchVisual = cut.visual?.toLowerCase().includes(q);
      const matchNarration = cut.narration?.toLowerCase().includes(q);
      const matchReason = cut.reason?.toLowerCase().includes(q);
      const matchCategory = cut.category?.toLowerCase().includes(q);
      const matchCharacters = cut.characters?.some((c) => c.toLowerCase().includes(q));

      return matchVisual || matchNarration || matchReason || matchCategory || matchCharacters;
    });
  }, [cuts, selectedCategory, searchTerm]);

  const handlePlayClip = (cut: CutItem) => {
    setActivePlayingCutId(cut.id);
    if (playerRef.current) {
      playerRef.current.playClip(cut.originalStartSec, cut.originalEndSec);
    }
  };

  const handleSeekOriginal = (cut: CutItem) => {
    setActivePlayingCutId(cut.id);
    if (playerRef.current) {
      playerRef.current.seekTo(cut.originalStartSec);
    }
  };

  const handleCopyNarration = (cut: CutItem) => {
    navigator.clipboard.writeText(cut.narration);
    setCopiedCutId(cut.id);
    setTimeout(() => setCopiedCutId(null), 2000);
  };

  const handleSaveCutEdit = () => {
    if (!editingCut || !project.analysis) return;
    const updatedCuts = cuts.map((c) => (c.id === editingCut.id ? editingCut : c));
    onUpdateProject({
      analysis: {
        ...project.analysis,
        cutGuide: updatedCuts,
      },
    });
    setEditingCut(null);
  };

  if (cuts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
          <Scissors className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">No Cut Guide Available</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Upload and analyze a video to automatically generate a synchronized cut guide with original vs recap timestamps.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Top Banner & Control Deck */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Accurate Video Matching Engine
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              VIDEO CUT GUIDE
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Synchronizing narration script to exact original video scenes with dual timecodes.
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportToCsv(project)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition border border-emerald-500/30"
              title="Export as CSV with Recap Start, Recap End, Original Start, Original End, Scene, Narration"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => exportToSrt(project)}
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition border border-blue-500/30"
              title="Export Subtitles SRT"
            >
              <Download className="w-3.5 h-3.5" />
              Export SRT
            </button>

            <button
              type="button"
              onClick={() => exportToTxt(project)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              TXT
            </button>

            <button
              type="button"
              onClick={() => exportToJson(project)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search recap narration, scenes, character names, dialogue, powers, twists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 placeholder-slate-500 pl-10 pr-4 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-amber-500 text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Chips Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mr-1 flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3 text-amber-400" />
              Filter:
            </span>
            {CATEGORIES.map((cat) => {
              const active = selectedCategory.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition flex-shrink-0 ${
                    active
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dual Timestamps Notice */}
        <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>
              Showing <strong className="text-white">{filteredCuts.length}</strong> of{' '}
              <strong className="text-white">{cuts.length}</strong> cuts
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="text-amber-400">RECAP TIMELINE = Narration Time</span>
            <span className="text-blue-400">ORIGINAL VIDEO = Clip Source</span>
          </div>
        </div>
      </div>

      {/* Cut Cards Sequence */}
      <div className="space-y-4">
        {filteredCuts.map((cut) => {
          const isPlaying = activePlayingCutId === cut.id;
          return (
            <div
              key={cut.id}
              className={`rounded-2xl p-5 md:p-6 transition border ${
                isPlaying
                  ? 'bg-slate-900 border-amber-500 shadow-xl shadow-amber-500/10'
                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700 shadow-lg'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                {/* Left Info: Cut number and Timestamps */}
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-amber-400 tracking-wider">
                      CUT #{cut.cutNumber}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {cut.category}
                    </span>
                    {cut.isApproximate && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        Approximate timestamp
                      </span>
                    )}
                    {cut.characters?.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>{cut.characters.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {/* Dual Timestamps Block */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    {/* Recap Timeline */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Recap Timeline:</span>
                      <span className="font-bold text-amber-400">
                        {cut.recapStart} - {cut.recapEnd}
                      </span>
                    </div>

                    {/* Original Video */}
                    <div
                      onClick={() => handleSeekOriginal(cut)}
                      className="p-2.5 rounded-xl bg-slate-950/80 border border-blue-500/30 hover:border-blue-400 cursor-pointer transition flex items-center justify-between group/orig"
                      title="Click to seek video player"
                    >
                      <span className="text-slate-400 text-[11px] group-hover/orig:text-blue-300 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        Original Video:
                      </span>
                      <span className="font-bold text-blue-400 group-hover/orig:underline">
                        {cut.originalStart} - {cut.originalEnd}
                      </span>
                    </div>
                  </div>

                  {/* Visual Description */}
                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                    <strong className="text-white block text-[11px] uppercase tracking-wider mb-1 text-slate-400">
                      Visual:
                    </strong>
                    {cut.visual}
                  </div>

                  {/* Narration Script */}
                  <div className="text-sm font-khmer text-amber-200/90 leading-relaxed bg-amber-500/5 p-3.5 rounded-xl border border-amber-500/20">
                    <strong className="text-amber-400 block text-[11px] uppercase tracking-wider mb-1 font-sans">
                      Narration:
                    </strong>
                    "{cut.narration}"
                  </div>

                  {/* Matching Reason */}
                  <div className="text-[11px] text-slate-400 italic">
                    <span className="font-semibold text-slate-300 not-italic">Reason: </span>
                    {cut.reason}
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex md:flex-col items-center gap-2 self-start flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePlayClip(cut)}
                    className="w-full px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-md shadow-amber-500/20 active:scale-95"
                    title="Jump to original video timestamp and play this cut"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play Clip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyNarration(cut)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
                    title="Copy narration sentence"
                  >
                    {copiedCutId === cut.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedCutId === cut.id ? 'Copied' : 'Copy'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingCut({ ...cut })}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
                    title="Edit Cut details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Cut Modal */}
      {editingCut && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <h3 className="text-base font-bold text-white flex items-center justify-between">
              <span>Edit CUT #{editingCut.cutNumber}</span>
              <span className="text-xs text-amber-400">{editingCut.category}</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Recap Start</label>
                <input
                  type="text"
                  value={editingCut.recapStart}
                  onChange={(e) => setEditingCut({ ...editingCut, recapStart: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Recap End</label>
                <input
                  type="text"
                  value={editingCut.recapEnd}
                  onChange={(e) => setEditingCut({ ...editingCut, recapEnd: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Original Video Start</label>
                <input
                  type="text"
                  value={editingCut.originalStart}
                  onChange={(e) => setEditingCut({ ...editingCut, originalStart: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Original Video End</label>
                <input
                  type="text"
                  value={editingCut.originalEnd}
                  onChange={(e) => setEditingCut({ ...editingCut, originalEnd: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block text-slate-400 mb-1">Visual Description</label>
              <textarea
                value={editingCut.visual}
                onChange={(e) => setEditingCut({ ...editingCut, visual: e.target.value })}
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            <div className="text-xs">
              <label className="block text-slate-400 mb-1">Narration Text</label>
              <textarea
                value={editingCut.narration}
                onChange={(e) => setEditingCut({ ...editingCut, narration: e.target.value })}
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-khmer"
              />
            </div>

            <div className="text-xs">
              <label className="block text-slate-400 mb-1">Matching Reason</label>
              <input
                type="text"
                value={editingCut.reason}
                onChange={(e) => setEditingCut({ ...editingCut, reason: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingCut.isApproximate}
                  onChange={(e) => setEditingCut({ ...editingCut, isApproximate: e.target.checked })}
                  className="rounded bg-slate-800 text-amber-500"
                />
                Approximate timestamp
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCut(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCutEdit}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Save Cut
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
