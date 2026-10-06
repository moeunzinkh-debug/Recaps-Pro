export interface VideoInfo {
  fileName: string;
  storedName: string;
  filePath?: string;
  mimeType: string;
  size: number;
  videoUrl: string;
  duration?: number;
  detectedTitle?: string;
  detectedType?: string;
  detectedEpisode?: string;
  isSample?: boolean;
}

export interface RecapSection {
  heading: string;
  narration: string;
}

export interface RecapScript {
  fullText: string;
  sections: RecapSection[];
}

export type CutCategory =
  | 'All'
  | 'Action'
  | 'Dialogue'
  | 'Character'
  | 'Important Event'
  | 'Flashback'
  | 'Power'
  | 'Transformation'
  | 'Plot Twist'
  | 'Climax'
  | 'Ending';

export interface CutItem {
  id: string;
  cutNumber: number;
  recapStart: string; // e.g. "00:00:00"
  recapEnd: string;   // e.g. "00:00:07"
  recapStartSec: number;
  recapEndSec: number;
  originalStart: string; // e.g. "00:02:14"
  originalEnd: string;   // e.g. "00:02:21"
  originalStartSec: number;
  originalEndSec: number;
  visual: string;
  narration: string;
  reason: string;
  category: CutCategory | string;
  isApproximate: boolean;
  characters: string[];
  thumbnailUrl?: string;
}

export interface StoryEventItem {
  timeRange: string; // e.g. "00:00:00 - 00:00:15"
  event: string;
  characters: string[];
  whatHappens: string;
  whyItMatters: string;
}

export interface VideoAnalysisData {
  detectedTitle: string;
  detectedType: string;
  detectedEpisode?: string;
  genre: string;
  detectedCharacters: string[];
  keyPowersOrThemes: string[];
  synopsis: string;
  estimatedNarrationDuration?: string;
  wordCount?: number;
  recapScript: RecapScript;
  storyEvents?: StoryEventItem[];
  cutGuide: CutItem[];
}

export interface ProjectSettings {
  language: 'Khmer' | 'English' | 'Thai' | 'Vietnamese' | 'Chinese';
  recapStyle: 'Fast' | 'Balanced' | 'Detailed';
  narrationTone: 'Casual' | 'Dramatic' | 'Suspenseful' | 'Professional';
  targetDuration: '3 minutes' | '5 minutes' | '10 minutes' | '15 minutes' | '20 minutes' | 'Custom';
  customDurationMinutes?: number;
  movieName?: string;
  episodeNumber?: string;
  model?: '3.8' | '3.7' | '3.6' | '3.5' | string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  videoInfo?: VideoInfo;
  settings: ProjectSettings;
  analysis?: VideoAnalysisData;
}

export interface SampleDemoVideo {
  id: string;
  title: string;
  type: string;
  genre: string;
  duration: string;
  durationSec: number;
  url: string;
  storedName: string;
  description: string;
}
