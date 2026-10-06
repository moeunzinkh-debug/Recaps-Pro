/**
 * Title cleaning + content-type detection — ported from server.ts.
 * No filesystem access required, safe for Workers.
 */

// Clean raw video file name into clean movie/anime title
export function cleanVideoTitle(rawName: string): { title: string; detectedEpisode?: string } {
  let clean = rawName.replace(/\.[^/.]+$/, '');
  clean = clean.replace(/\[.*?\]|\(.*?\)/g, ' ').trim();
  let detectedEpisode: string | undefined = undefined;
  const epMatch = clean.match(/(?:s\d+e|ep(?:isode)?\s*|#)(\d+)/i);
  if (epMatch) {
    detectedEpisode = `Episode ${parseInt(epMatch[1], 10)}`;
  }
  clean = clean.replace(/\b(1080p|720p|480p|4k|x264|x265|hevc|webrip|bluray|aac|h264|dvdrip|repack|hdrip)\b/gi, '');
  clean = clean.replace(/[._-]+/g, ' ').trim();
  return { title: clean || 'Movie / Anime Feature', detectedEpisode };
}

// Detect content type from title keywords
export function detectContentTypeFromTitle(title: string): { type: string; genre: string } {
  const lower = title.toLowerCase();
  const animeKeywords = [
    'anime', 'sintel', 'titan', 'slayer', 'naruto', 'jujutsu', 'piece', 'bleach',
    'dragon', 'solo leveling', 'chainsaw', 'spy', 'death note', 'ghibli',
    'frieren', 'boku', 'hero', 'hunter', 'alchemist', 'one punch', 'haikyuu',
    'geass', 'evangelion', 'tokyo ghoul', 'black clover', 'boruto', 'fate'
  ];
  const cartoonKeywords = [
    'cartoon', 'bunny', 'tom', 'jerry', 'sponge', 'looney', 'simpson',
    'rick and morty', 'adventure time', 'disney', 'pixar', 'shrek'
  ];

  if (animeKeywords.some((k) => lower.includes(k))) {
    return { type: 'Anime', genre: 'Shonen / Action / Fantasy' };
  }
  if (cartoonKeywords.some((k) => lower.includes(k))) {
    return { type: 'Cartoon', genre: 'Comedy / Animation / Adventure' };
  }
  return { type: 'Live-action movie', genre: 'Action / Sci-Fi / Suspense' };
}
