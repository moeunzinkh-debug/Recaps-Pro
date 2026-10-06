import type { SampleDemoVideo } from '../types';

/**
 * Curated demo samples — ported from server.ts.
 * On Workers these are streamed from the R2 bucket via /api/video/:storedName.
 */
// Local curated demo sample videos (streamed reliably from local /api/video/)
export const DEMO_SAMPLES: SampleDemoVideo[] = [
  {
    id: 'sample-sintel',
    title: 'Sintel - The Dragon Hunt',
    type: 'Anime / 3D Animation',
    genre: 'Fantasy / Action / Drama',
    duration: '00:00:52',
    durationSec: 52,
    storedName: 'sample-sintel.mp4',
    url: '/api/video/sample-sintel.mp4',
    description: 'A young warrior battles snow, beasts, and treacherous mountains searching for her lost baby dragon companion.',
  },
  {
    id: 'sample-tears',
    title: 'Tears of Steel - Cyberpunk Battlefield',
    type: 'Live-action / Sci-Fi Movie',
    genre: 'Sci-Fi / Action / Cyberpunk',
    duration: '00:00:48',
    durationSec: 48,
    storedName: 'sample-tears.mp4',
    url: '/api/video/sample-tears.mp4',
    description: 'Dystopian future warriors fight rogue robotic AI mechs in an apocalyptic Amsterdam rocket launchpad.',
  },
  {
    id: 'sample-bunny',
    title: 'Big Buck Bunny - Forest Showdown',
    type: 'Cartoon / Animation',
    genre: 'Comedy / Adventure',
    duration: '00:00:33',
    durationSec: 33,
    storedName: 'sample-bunny.mp4',
    url: '/api/video/sample-bunny.mp4',
    description: 'A gentle giant woodland creature is provoked by bully forest critters and enacts clever retribution.',
  },
];
