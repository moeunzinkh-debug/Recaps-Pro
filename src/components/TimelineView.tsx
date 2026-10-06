import React, { useState, useEffect } from 'react';
import {
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Play,
  Plus,
  Clock,
  Sparkles,
  Film,
  Check,
  RotateCcw,
} from 'lucide-react';
import { CutItem, Project } from '../types';
import { VideoPlayerRef } from './VideoPlayer';
import { captureFrameThumbnail } from '../utils/videoThumbnails';

interface TimelineViewProps {
  project: Project;
  onUpdateProject: (updated: Partial<Project>) => void;
  playerRef: React.RefObject<VideoPlayerRef | null>;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  project,
  onUpdateProject,
  playerRef,
}) => {
  const cuts = project.analysis?.cutGuide || [];
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [editingCut, setEditingCut] = useState<CutItem | null>(null);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);

  // Capture thumbnails automatically when cuts are loaded
  useEffect(() => {
    let isMounted = true;
    const captureThumbnails = async () => {
      const videoEl = playerRef.current?.getVideoElement();
      if (!videoEl || !cuts.length) return;

      const newThumbs: Record<string, string> = { ...thumbnails };
      for (const cut of cuts) {
        if (!newThumbs[cut.id]) {
          try {
            const thumb = await captureFrameThumbnail(videoEl, cut.originalStartSec);
            if (thumb && isMounted) {
              newThumbs[cut.id] = thumb;
              setThumbnails((prev) => ({ ...prev, [cut.id]: thumb }));
            }
          } catch {
            // Ignore capture error
          }
        }
      }
    };

    const timer = setTimeout(captureThumbnails, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [cuts, playerRef]);

  const handleMoveUp = (index: number) => {
    if (index <= 0 || !project.analysis) return;
    const newCuts = [...cuts];
    const temp = newCuts[index - 1];
    newCuts[index - 1] = newCuts[index];
    newCuts[index] = temp;

    // Recalculate cut numbers
    const renumbered = newCuts.map((c, i) => ({ ...c, cutNumber: i + 1 }));
    onUpdateProject({
      analysis: {
        ...project.analysis,
        cutGuide: renumbered,
      },
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= cuts.length - 1 || !project.analysis) return;
    const newCuts = [...cuts];
    const temp = newCuts[index + 1];
    newCuts[index + 1] = newCuts[index];
    newCuts[index] = temp;

    // Recalculate cut numbers
    const renumbered = newCuts.map((c, i) => ({ ...c, cutNumber: i + 1 }));
    onUpdateProject({
      analysis: {
        ...project.analysis,
        cutGuide: renumbered,
      },
    });
  };

  const handleDeleteCut = (id: string) => {
    if (!project.analysis) return;
    if (confirm('Are you sure you want to delete this cut from the timeline?')) {
      const filtered = cuts.filter((c) => c.id !== id);
      const renumbered = filtered.map((c, i) => ({ ...c, cutNumber: i + 1 }));
      onUpdateProject({
        analysis: {
          ...project.analysis,
          cutGuide: renumbered,
        },
      });
    }
  };

  const handlePlayClip = (cut: CutItem) => {
    setActivePlayingId(cut.id);
    if (playerRef.current) {
      playerRef.current.playClip(cut.originalStartSec, cut.originalEndSec);
    }
  };

  const handleSaveEdit = () => {
    if (!editingCut || !project.analysis) return;
    const updated = cuts.map((c) => (c.id === editingCut.id ? editingCut : c));
    onUpdateProject({
      analysis: {
        ...project.analysis,
        cutGuide: updated,
      },
    });
    setEditingCut(null);
  };

  const handleAddTimelineItem = () => {
    if (!project.analysis) return;
    const nextCutNum = cuts.length + 1;
    const lastCut = cuts[cuts.length - 1];
    const newCut: CutItem = {
      id: `cut-${Date.now()}`,
      cutNumber: nextCutNum,
      recapStart: lastCut ? lastCut.recapEnd : '00:00:00',
      recapEnd: '00:00:08',
      recapStartSec: lastCut ? lastCut.recapEndSec : 0,
      recapEndSec: (lastCut ? lastCut.recapEndSec : 0) + 8,
      originalStart: '00:00:00',
      originalEnd: '00:00:08',
      originalStartSec: 0,
      originalEndSec: 8,
      visual: 'Custom scene insert',
      narration: 'Narration text...',
      reason: 'User manual edit',
      category: 'Action',
      isApproximate: false,
      characters: [],
    };

    onUpdateProject({
      analysis: {
        ...project.analysis,
        cutGuide: [...cuts, newCut],
      },
    });
  };

  if (cuts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
          <Layers className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">No Timeline Items</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Upload and analyze a video to generate visual timeline cut blocks.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Banner */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Visual Timeline Sequencer
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            RECAP EDITING TIMELINE
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Reorder scenes, fine-tune timing, inspect video thumbnails, and preview the edit sequence.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddTimelineItem}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-md shadow-amber-500/20 active:scale-95 self-start md:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          Add Cut Item
        </button>
      </div>

      {/* Visual Timeline Track Bar */}
      <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Recap Progression Flow</span>
          <span className="font-mono text-amber-400">{cuts.length} Sequenced Cuts</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          {cuts.map((cut, idx) => (
            <div
              key={cut.id}
              onClick={() => handlePlayClip(cut)}
              className="flex-shrink-0 cursor-pointer group relative"
              title={`Cut #${cut.cutNumber}: ${cut.visual}`}
            >
              <div className="w-20 sm:w-24 h-12 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 overflow-hidden flex flex-col justify-between p-1 transition shadow group-hover:scale-105">
                <span className="text-[9px] font-bold text-amber-400 font-mono">
                  #{cut.cutNumber}
                </span>
                <span className="text-[9px] text-slate-300 truncate font-khmer">
                  {cut.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Items Cards */}
      <div className="space-y-4">
        {cuts.map((cut, index) => {
          const isPlaying = activePlayingId === cut.id;
          const thumbUrl = thumbnails[cut.id];

          return (
            <div
              key={cut.id}
              className={`rounded-2xl p-4 md:p-5 transition border flex flex-col md:flex-row items-start gap-4 ${
                isPlaying
                  ? 'bg-slate-900 border-amber-500 shadow-xl'
                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Thumbnail Box */}
              <div className="w-full md:w-44 aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 relative group">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={`Cut #${cut.cutNumber}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-1">
                    <Film className="w-6 h-6" />
                    <span className="text-[10px]">Frame Preview</span>
                  </div>
                )}

                {/* Play Clip Overlay on Hover */}
                <button
                  onClick={() => handlePlayClip(cut)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-amber-400"
                  title="Play Clip"
                >
                  <Play className="w-7 h-7 fill-current" />
                </button>

                <div className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono text-amber-300 px-1.5 py-0.5 rounded">
                  {cut.originalStart}
                </div>
              </div>

              {/* Middle Info: Scene & Narration */}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-amber-400">CUT #{cut.cutNumber}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {cut.category}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="text-amber-400">
                    <span className="text-slate-500">Recap: </span>
                    {cut.recapStart} - {cut.recapEnd}
                  </div>
                  <div className="text-blue-400">
                    <span className="text-slate-500">Source: </span>
                    {cut.originalStart} - {cut.originalEnd}
                  </div>
                </div>

                <div className="text-xs text-slate-300">
                  <span className="text-slate-400 font-semibold">Scene: </span>
                  {cut.visual}
                </div>

                <div className="text-xs font-khmer text-amber-200/90 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                  "{cut.narration}"
                </div>
              </div>

              {/* Action Buttons: Move, Edit, Delete, Preview */}
              <div className="flex md:flex-col items-center justify-between w-full md:w-auto gap-1.5 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                <button
                  type="button"
                  onClick={() => handlePlayClip(cut)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 shadow"
                  title="Preview Clip"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingCut({ ...cut })}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  title="Edit Cut"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => handleMoveUp(index)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={index === cuts.length - 1}
                  onClick={() => handleMoveDown(index)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteCut(cut.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-300 text-xs transition"
                  title="Delete Cut"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingCut && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">
              Edit Timeline Cut #{editingCut.cutNumber}
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
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
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
              <label className="block text-slate-400 mb-1">Scene Description</label>
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

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCut(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs"
              >
                Save Timeline Cut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
