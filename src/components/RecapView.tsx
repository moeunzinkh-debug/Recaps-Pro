import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Check,
  Edit3,
  Download,
  RotateCcw,
  Sparkles,
  Minimize2,
  Maximize2,
  Flame,
  Languages,
  Clock,
  BookOpen,
  Save,
} from 'lucide-react';
import { Project } from '../types';
import { exportToDoc, exportToTxt } from '../utils/exportUtils';
import { getStoredApiKey } from '../utils/storage';

interface RecapViewProps {
  project: Project;
  onUpdateProject: (updated: Partial<Project>) => void;
  onNavigateToCutGuide: () => void;
}

export const RecapView: React.FC<RecapViewProps> = ({
  project,
  onUpdateProject,
  onNavigateToCutGuide,
}) => {
  const recap = project.analysis?.recapScript;
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(recap?.fullText || '');
  const [copied, setCopied] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineActionName, setRefineActionName] = useState<string | null>(null);

  // Sync editedText if recap updates from outside
  React.useEffect(() => {
    if (recap?.fullText && !isEditing) {
      setEditedText(recap.fullText);
    }
  }, [recap?.fullText, isEditing]);

  const handleCopy = () => {
    const textToCopy = isEditing ? editedText : recap?.fullText || '';
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (!project.analysis) return;
    const wordCount = editedText.trim().split(/\s+/).filter(Boolean).length;
    onUpdateProject({
      analysis: {
        ...project.analysis,
        wordCount,
        recapScript: {
          ...project.analysis.recapScript,
          fullText: editedText,
        },
      },
    });
    setIsEditing(false);
  };

  const handleRefineScript = async (action: 'shorter' | 'longer' | 'improve_hook' | 'regenerate') => {
    if (!project.analysis?.recapScript?.fullText) return;

    setIsRefining(true);
    setRefineActionName(action);

    try {
      const storedKey = getStoredApiKey() || undefined;
      const res = await fetch('/api/refine-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedKey ? { 'x-gemini-api-key': storedKey } : {}),
        },
        body: JSON.stringify({
          currentScript: editedText || project.analysis.recapScript.fullText,
          action,
          language: project.settings.language,
          tone: project.settings.narrationTone,
          movieName: project.analysis.detectedTitle || project.name,
          model: project.settings.model || '3.8',
          apiKey: storedKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to refine script');
      }

      const refinedText = data.refinedScript;
      const wordCount = refinedText.trim().split(/\s+/).filter(Boolean).length;

      setEditedText(refinedText);
      onUpdateProject({
        analysis: {
          ...project.analysis,
          wordCount,
          recapScript: {
            ...project.analysis.recapScript,
            fullText: refinedText,
          },
        },
      });
    } catch (err: any) {
      console.error('Error refining script:', err);
      alert(err.message || 'Script refinement failed. Please try again.');
    } finally {
      setIsRefining(false);
      setRefineActionName(null);
    }
  };

  if (!recap) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
          <FileText className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">No Recap Script Generated Yet</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Upload a video or select a demo sample from the Video tab, then click "ANALYZE VIDEO" to generate your full movie/anime recap script.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Script Header Banner */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Professional YouTube-Style Narration
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              FULL RECAP SCRIPT
            </h1>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700">
              <strong className="text-white">Title:</strong> {project.analysis?.detectedTitle || project.name}
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700">
              <strong className="text-white">Genre:</strong> {project.analysis?.genre || 'Animation/Action'}
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {project.analysis?.estimatedNarrationDuration || '00:04:00'}
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700 font-mono">
              <strong className="text-white">Words:</strong> {project.analysis?.wordCount || 0}
            </span>
            <span className="text-xs bg-amber-400/10 text-amber-300 px-3 py-1 rounded-lg border border-amber-400/20 font-semibold flex items-center gap-1">
              <Languages className="w-3.5 h-3.5" />
              {project.settings.language}
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Edit / View Mode */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Script'}
            </button>

            {isEditing ? (
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
              >
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Script
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateToCutGuide}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition border border-amber-500/30"
            >
              <span>View Video Cut Guide</span>
              <span>→</span>
            </button>
          </div>

          {/* AI Refinement Tools */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium mr-1">AI Tools:</span>

            <button
              type="button"
              disabled={isRefining}
              onClick={() => handleRefineScript('improve_hook')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
              title="Enhance the opening hook for high viewer retention"
            >
              <Flame className="w-3 h-3 text-red-400" />
              {isRefining && refineActionName === 'improve_hook' ? 'Polishing...' : 'Improve Hook'}
            </button>

            <button
              type="button"
              disabled={isRefining}
              onClick={() => handleRefineScript('shorter')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
              title="Make the script faster and more concise"
            >
              <Minimize2 className="w-3 h-3 text-blue-400" />
              {isRefining && refineActionName === 'shorter' ? 'Condensing...' : 'Shorter'}
            </button>

            <button
              type="button"
              disabled={isRefining}
              onClick={() => handleRefineScript('longer')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
              title="Add more story nuance and detail"
            >
              <Maximize2 className="w-3 h-3 text-emerald-400" />
              {isRefining && refineActionName === 'longer' ? 'Expanding...' : 'Longer'}
            </button>

            <button
              type="button"
              disabled={isRefining}
              onClick={() => handleRefineScript('regenerate')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
              title="Regenerate recap with fresh storytelling angle"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              {isRefining && refineActionName === 'regenerate' ? 'Rewriting...' : 'Regenerate'}
            </button>

            {/* Export Buttons */}
            <div className="h-4 w-px bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={() => exportToTxt(project)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
            >
              <Download className="w-3 h-3 text-slate-400" />
              TXT
            </button>

            <button
              type="button"
              onClick={() => exportToDoc(project)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition border border-slate-700"
            >
              <Download className="w-3 h-3 text-blue-400" />
              DOC
            </button>
          </div>
        </div>
      </div>

      {/* Script Editor / Display Box */}
      <div className="bg-slate-900/90 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
        {/* Story Rhythm Guide Ribbon */}
        <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center gap-2 overflow-x-auto text-[11px] font-mono text-slate-400">
          <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">Story Rhythm:</span>
          <span className="text-amber-300 font-semibold">HOOK</span>
          <span>→</span>
          <span>SETUP</span>
          <span>→</span>
          <span>EVENT</span>
          <span>→</span>
          <span>REACTION</span>
          <span>→</span>
          <span>PROBLEM</span>
          <span>→</span>
          <span>ACTION</span>
          <span>→</span>
          <span>REVEAL</span>
          <span>→</span>
          <span className="text-red-400 font-semibold">CLIMAX</span>
          <span>→</span>
          <span className="text-emerald-400 font-semibold">ENDING</span>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Editing Full Script • Changes are auto-saved to project when you click Save</span>
              <span className="font-mono text-amber-400">
                {editedText.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={18}
              className="w-full bg-slate-950 text-slate-100 font-khmer text-sm md:text-base leading-relaxed p-4 rounded-xl border border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              placeholder="Paste or write your recap script here..."
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditedText(recap.fullText);
                  setIsEditing(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow"
              >
                Save Script Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Formatted Script Viewer */}
            <div className="prose prose-invert max-w-none font-khmer text-slate-200 text-sm md:text-base leading-relaxed whitespace-pre-line bg-slate-950/60 p-6 md:p-8 rounded-xl border border-slate-800/80 shadow-inner">
              {recap.fullText}
            </div>

            {/* Individual Section Breakdown if available */}
            {recap.sections && recap.sections.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  Section-by-Section Narrative Breakdown
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {recap.sections.map((sec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-slate-700 transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 font-mono tracking-wide">
                          [{sec.heading}]
                        </span>
                        <span className="text-[10px] text-slate-400">Section {idx + 1}</span>
                      </div>
                      <p className="text-xs md:text-sm text-slate-300 font-khmer leading-relaxed">
                        {sec.narration}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
