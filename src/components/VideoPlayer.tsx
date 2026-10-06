import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw, RotateCw, Film } from 'lucide-react';
import { formatTimecode } from '../utils/exportUtils';

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  playClip: (startSec: number, endSec: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
}

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  className?: string;
  title?: string;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ src, poster, onTimeUpdate, onLoadedMetadata, className = '', title }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [clipRange, setClipRange] = useState<{ start: number; end: number } | null>(null);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (videoRef.current) {
          const clamped = Math.max(0, Math.min(seconds, videoRef.current.duration || seconds));
          videoRef.current.currentTime = clamped;
          setCurrentTime(clamped);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      },
      playClip: (startSec: number, endSec: number) => {
        if (videoRef.current) {
          const clampedStart = Math.max(0, startSec);
          const clampedEnd = Math.max(clampedStart + 0.5, endSec);
          videoRef.current.currentTime = clampedStart;
          setClipRange({ start: clampedStart, end: clampedEnd });
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      },
      getVideoElement: () => videoRef.current,
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleTime = () => {
        const cur = video.currentTime;
        setCurrentTime(cur);
        onTimeUpdate?.(cur);

        // Check if clip limit reached
        if (clipRange && cur >= clipRange.end) {
          video.pause();
          setIsPlaying(false);
          setClipRange(null);
        }
      };

      const handleMeta = () => {
        setDuration(video.duration || 0);
        onLoadedMetadata?.(video.duration || 0);
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      video.addEventListener('timeupdate', handleTime);
      video.addEventListener('loadedmetadata', handleMeta);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      return () => {
        video.removeEventListener('timeupdate', handleTime);
        video.removeEventListener('loadedmetadata', handleMeta);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }, [clipRange, onTimeUpdate, onLoadedMetadata]);

    const togglePlay = () => {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        setClipRange(null);
        videoRef.current.play().catch(() => {});
      }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (videoRef.current) {
        videoRef.current.currentTime = val;
        setCurrentTime(val);
        setClipRange(null);
      }
    };

    const skipTime = (offset: number) => {
      if (videoRef.current) {
        const nextTime = Math.max(0, Math.min(currentTime + offset, duration));
        videoRef.current.currentTime = nextTime;
        setCurrentTime(nextTime);
        setClipRange(null);
      }
    };

    const toggleMute = () => {
      if (!videoRef.current) return;
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      if (videoRef.current) {
        videoRef.current.volume = val;
        videoRef.current.muted = val === 0;
        setIsMuted(val === 0);
      }
    };

    const toggleFullscreen = () => {
      if (!containerRef.current) return;
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    return (
      <div
        ref={containerRef}
        className={`relative group bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col ${className}`}
      >
        {/* Main Video Element */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {src ? (
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-3 p-8 text-center">
              <Film className="w-16 h-16 text-slate-700 animate-pulse" />
              <p className="text-sm font-medium">No video loaded. Upload a video or pick a demo sample to begin.</p>
            </div>
          )}

          {/* Clip Range Overlay Indicator */}
          {clipRange && (
            <div className="absolute top-3 right-3 bg-amber-500/90 text-slate-950 font-bold text-xs px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-slate-950 inline-block"></span>
              Playing Clip: {formatTimecode(clipRange.start)} → {formatTimecode(clipRange.end)}
            </div>
          )}

          {/* Title tag on hover */}
          {title && (
            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700/50">
              {title}
            </div>
          )}
        </div>

        {/* Video Control Bar */}
        <div className="p-3 bg-gradient-to-t from-slate-950 to-slate-900/95 border-t border-slate-800 flex flex-col gap-2">
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-amber-400 font-semibold w-14 text-right">
              {formatTimecode(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
              />
            </div>
            <span className="text-[11px] font-mono text-slate-400 w-14">
              {formatTimecode(duration)}
            </span>
          </div>

          {/* Buttons & Tools */}
          <div className="flex items-center justify-between gap-2 text-slate-300">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!src}
                className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition disabled:opacity-40 disabled:hover:bg-amber-500 flex items-center justify-center"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => skipTime(-5)}
                disabled={!src}
                className="p-1.5 hover:bg-slate-800 rounded transition text-slate-400 hover:text-slate-200"
                title="Rewind 5s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => skipTime(5)}
                disabled={!src}
                className="p-1.5 hover:bg-slate-800 rounded transition text-slate-400 hover:text-slate-200"
                title="Forward 5s"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-1.5 ml-2 group/vol">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 text-slate-400 hover:text-slate-200 transition"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Source Player
              </span>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                title="Fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
