import { Project } from '../types';
import { INITIAL_PROJECT } from '../data/defaultProject';

const STORAGE_KEY = 'recap_studio_ai_projects';
const ACTIVE_PROJECT_ID_KEY = 'recap_studio_ai_active_id';

export function loadProjectsFromStorage(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveProjectsToStorage([INITIAL_PROJECT]);
      return [INITIAL_PROJECT];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [INITIAL_PROJECT];
    }
    return parsed;
  } catch (e) {
    console.error('Error loading projects from storage:', e);
    return [INITIAL_PROJECT];
  }
}

export function saveProjectsToStorage(projects: Project[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Error saving projects to storage:', e);
  }
}

export function getActiveProjectId(projects: Project[]): string {
  try {
    const activeId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
    if (activeId && projects.some((p) => p.id === activeId)) {
      return activeId;
    }
    return projects[0]?.id || INITIAL_PROJECT.id;
  } catch {
    return projects[0]?.id || INITIAL_PROJECT.id;
  }
}

export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
  } catch (e) {
    console.error('Error setting active project ID:', e);
  }
}

export function createNewProject(name: string = 'Untitled Recap Project'): Project {
  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      language: 'Khmer',
      recapStyle: 'Balanced',
      narrationTone: 'Suspenseful',
      targetDuration: '5 minutes',
      movieName: '',
      episodeNumber: '',
      model: '3.8',
    },
  };
}

export function duplicateProject(source: Project): Project {
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: `${source.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const API_KEY_STORAGE_KEY = 'recap_studio_gemini_api_key';

export function getStoredApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key && key.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Error saving API key to local storage:', e);
  }
}

export function removeStoredApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {}
}
