import React, { useState, useEffect } from 'react';
import {
  Settings,
  Languages,
  Sliders,
  Clock,
  Sparkles,
  Key,
  ShieldCheck,
  Cpu,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Project } from '../types';
import {
  getStoredApiKey,
  setStoredApiKey,
  removeStoredApiKey,
} from '../utils/storage';

interface SettingsViewProps {
  project: Project;
  onUpdateProject: (updated: Partial<Project>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  project,
  onUpdateProject,
}) => {
  const settings = project.settings;

  // API Key State
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean; maskedKey: string | null }>({
    hasKey: false,
    maskedKey: null,
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [showKeyChars, setShowKeyChars] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch current API key status from server (and sync with localStorage if needed)
  const fetchKeyStatus = async () => {
    try {
      const res = await fetch('/api/api-key-status');
      const data = await res.json();
      if (data.hasKey) {
        setApiKeyStatus({
          hasKey: true,
          maskedKey: data.maskedKey,
        });
      } else {
        // If server doesn't have it but client localStorage has it, sync to server
        const localKey = getStoredApiKey();
        if (localKey && localKey.trim()) {
          const syncRes = await fetch('/api/set-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: localKey.trim() }),
          });
          const syncData = await syncRes.json();
          if (syncData.success) {
            setApiKeyStatus({
              hasKey: true,
              maskedKey: syncData.maskedKey,
            });
            return;
          }
        }
        setApiKeyStatus({
          hasKey: false,
          maskedKey: null,
        });
      }
    } catch (e) {
      console.error('Error fetching API key status:', e);
    }
  };

  useEffect(() => {
    fetchKeyStatus();
  }, []);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    setKeySaving(true);
    setKeyFeedback(null);

    try {
      const res = await fetch('/api/set-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: inputKey.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save API key');
      }

      setStoredApiKey(inputKey.trim());
      setKeyFeedback({
        success: true,
        message: 'Gemini API key verified, saved to server & local storage!',
      });
      setInputKey('');
      await fetchKeyStatus();

      setTimeout(() => {
        setShowKeyModal(false);
        setKeyFeedback(null);
      }, 1500);
    } catch (err: any) {
      setKeyFeedback({
        success: false,
        message: err.message || 'Error updating API key',
      });
    } finally {
      setKeySaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!confirm('Are you sure you want to disconnect your Gemini API key?')) return;
    try {
      await fetch('/api/set-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'REMOVE' }),
      });
      removeStoredApiKey();
      setApiKeyStatus({ hasKey: false, maskedKey: null });
    } catch (err) {
      console.error('Failed to remove API key:', err);
    }
  };

  const handleUpdate = (patch: Partial<typeof settings>) => {
    onUpdateProject({
      settings: {
        ...settings,
        ...patch,
      },
    });
  };

  const currentModel = settings.model || '3.8';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Banner */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          Project Preferences
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          RECAP SETTINGS & AI ENGINE
        </h1>
        <p className="text-xs text-slate-400">
          Configure Gemini API credentials, select AI models (3.5, 3.6, 3.7, 3.8), and customize narration language, tone, and pacing.
        </p>
      </div>

      {/* API Key Configuration Card */}
      <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Gemini API Key Connection
            </h2>
            <p className="text-xs text-slate-400">
              Required for real-time video understanding and script generation via Gemini Files API.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {apiKeyStatus.hasKey && (
              <button
                type="button"
                onClick={handleRemoveApiKey}
                className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-red-950/60 hover:text-red-300 border border-slate-700/80 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                title="Disconnect key"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Disconnect</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowKeyModal(true);
                setKeyFeedback(null);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-md shadow-amber-500/10 active:scale-95"
            >
              {apiKeyStatus.hasKey ? <RefreshCw className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 stroke-[3]" />}
              <span>{apiKeyStatus.hasKey ? 'Update API Key' : 'Add API Key'}</span>
            </button>
          </div>
        </div>

        {/* Status Display */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                apiKeyStatus.hasKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <div>
              <div className="font-semibold text-slate-200">
                {apiKeyStatus.hasKey ? 'Gemini API Key Connected' : 'No Gemini API Key Configured Yet'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {apiKeyStatus.hasKey
                  ? `Active key: ${apiKeyStatus.maskedKey || '••••••••'}`
                  : 'Click "Add API Key" to attach your Google AI Studio key, or use the built-in Intelligent Story Engine.'}
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Server-Side Secured
          </div>
        </div>
      </div>

      {/* Model Selection Dropdown Card */}
      <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-lg space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          Gemini Model Version
        </h2>
        <p className="text-xs text-slate-400">
          Select which multimodal intelligence version to deploy for video comprehension and recap writing.
        </p>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 block">
            Select Model
          </label>
          <select
            value={currentModel}
            onChange={(e) => handleUpdate({ model: e.target.value as any })}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="3.8">Gemini 3.8 Flash (Latest & Recommended - Flagship Multimodal Video)</option>
            <option value="3.7">Gemini 3.7 Flash (High Performance Multimodal Reasoning)</option>
            <option value="3.6">Gemini 3.6 Flash (Fast & Balanced)</option>
            <option value="3.5">Gemini 3.5 Flash (Efficient Standard Multimodal)</option>
          </select>

          {/* Model Description Badges */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Active Architecture:</span>
            <span className="font-mono text-amber-400 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              gemini-{currentModel}-flash
            </span>
          </div>
        </div>
      </div>

      {/* Narration Script Parameters */}
      <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-lg space-y-6">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-400" />
          Narration Script Parameters
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-amber-400" />
              Recap Language
            </label>
            <p className="text-[11px] text-slate-400">
              Default is natural conversational Khmer (ភាសាខ្មែរធម្មជាតិ).
            </p>
            <select
              value={settings.language}
              onChange={(e) => handleUpdate({ language: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="Khmer">ភាសាខ្មែរ (Khmer - Natural Conversational)</option>
              <option value="English">English (YouTube Hook & Storytelling)</option>
              <option value="Thai">ภาษาไทย (Thai)</option>
              <option value="Vietnamese">Tiếng Việt (Vietnamese)</option>
              <option value="Chinese">中文 (Chinese)</option>
            </select>
          </div>

          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Recap Pacing & Style
            </label>
            <p className="text-[11px] text-slate-400">
              Controls the speed and level of detail in the script.
            </p>
            <select
              value={settings.recapStyle}
              onChange={(e) => handleUpdate({ recapStyle: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="Fast">Fast (Punchy, High Retention, Quick Cuts)</option>
              <option value="Balanced">Balanced (Story Context + Action Climax)</option>
              <option value="Detailed">Detailed (In-depth Lore, Dialogue & Power System)</option>
            </select>
          </div>

          {/* Tone */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Narration Tone
            </label>
            <p className="text-[11px] text-slate-400">
              The personality and vocal posture of the narrator.
            </p>
            <select
              value={settings.narrationTone}
              onChange={(e) => handleUpdate({ narrationTone: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="Suspenseful">Suspenseful (Cliffhangers, Tension & Twists)</option>
              <option value="Casual">Casual (Friendly Conversational, like a buddy)</option>
              <option value="Dramatic">Dramatic (High Stakes, Emotional Weight)</option>
              <option value="Professional">Professional (Cinematic Documentarian)</option>
            </select>
          </div>

          {/* Target Duration */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Target Duration
            </label>
            <p className="text-[11px] text-slate-400">
              AI scales script length to fit spoken narration time.
            </p>
            <select
              value={settings.targetDuration}
              onChange={(e) => handleUpdate({ targetDuration: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="3 minutes">3 Minutes (Short format / Highlights)</option>
              <option value="5 minutes">5 Minutes (Standard YouTube Recap)</option>
              <option value="10 minutes">10 Minutes (Deep Dive)</option>
              <option value="15 minutes">15 Minutes (Extended Recap)</option>
              <option value="20 minutes">20 Minutes (Full Length Episode)</option>
              <option value="Custom">Custom Minutes</option>
            </select>
          </div>
        </div>

        {/* Custom duration if selected */}
        {settings.targetDuration === 'Custom' && (
          <div className="pt-2">
            <label className="text-xs font-semibold text-slate-300 mb-1 block">
              Custom Duration (Minutes)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={settings.customDurationMinutes || 7}
              onChange={(e) =>
                handleUpdate({ customDurationMinutes: parseInt(e.target.value, 10) || 5 })
              }
              className="w-48 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {/* AI Key Input Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                {apiKeyStatus.hasKey ? 'Update Gemini API Key' : 'Add Gemini API Key'}
              </h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your Google AI Studio API key (starts with <span className="font-mono text-amber-400 font-bold">AIzaSy...</span>). The key is securely stored in your server session and proxy requests without client-side exposure.
            </p>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Don't have a key yet?</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:text-amber-300 font-semibold underline"
              >
                Get Free API Key from AI Studio ↗
              </a>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">
                  API Key (e.g. AIzaSy...)
                </label>
                <div className="relative">
                  <input
                    type={showKeyChars ? 'text' : 'password'}
                    placeholder="AIzaSy..."
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyChars(!showKeyChars)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    title={showKeyChars ? 'Hide key' : 'Show key'}
                  >
                    {showKeyChars ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {keyFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    keyFeedback.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/60 border border-red-800 text-red-300'
                  }`}
                >
                  {keyFeedback.success ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{keyFeedback.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inputKey.trim() || keySaving}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {keySaving ? 'Saving...' : 'Save API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
