import { formatTime, parseTimeToSeconds } from './time';
import { cleanVideoTitle, detectContentTypeFromTitle } from './titles';

/**
 * Offline 'Real-Video Story Engine' — ported verbatim from server.ts.
 * Used when no Gemini API key is available, or when the Gemini call fails.
 */

export function generateIntelligentRecapAnalysis(params: {
  storedName: string;
  movieName?: string;
  episodeNumber?: string;
  language?: string;
  recapStyle?: string;
  narrationTone?: string;
  targetDuration?: string;
  realDuration?: number;
}) {
  const {
    storedName,
    movieName,
    episodeNumber,
    language = 'Khmer',
    recapStyle = 'Balanced',
    narrationTone = 'Suspenseful',
    realDuration = 60,
  } = params;

  const cleaned = cleanVideoTitle(movieName || storedName);
  const finalTitle = movieName || cleaned.title;
  const detectedEp = episodeNumber || cleaned.detectedEpisode || 'N/A';
  const detected = detectContentTypeFromTitle(finalTitle);

  const durationSec = Math.max(30, realDuration);
  const isKhmer = language.toLowerCase() === 'khmer';

  // Build authentic character names and themes based on detected content type
  let characters: string[] = [];
  let keyPowers: string[] = [];
  let synopsis = '';
  let fullScript = '';

  if (detected.type === 'Anime') {
    characters = [`${finalTitle} Protagonist`, 'Master / Mentor', 'Rival Warrior', 'Shadow Villain'];
    keyPowers = ['Awakened Power', 'Battle Transformation', 'Martial Arts Technique', 'Cliffhanger Twist'];
    synopsis = `រឿងរ៉ាវដ៏រំភើបនិងតស៊ូរបស់តួអង្គក្នុង ${finalTitle} ក្នុងការស្វែងរកអំណាចពិតប្រាកដ និងការពារមិត្តភក្តិពីការបំផ្លិចបំផ្លាញរបស់កងទ័ពសត្រូវ។`;

    if (isKhmer) {
      fullScript = `[HOOK]
តើអ្នកធ្លាប់គិតទេថា មនុស្សដែលមើលទៅទន់ខ្សោយបំផុត បែរជាមានអំណាចអាថ៌កំបាំងដែលអាចកក្រើកផែនដីទាំងមូល? នេះគឺជារឿងរ៉ាវដ៏អស្ចារ្យនិងកក្រើកនៃ ${finalTitle}!

[SETUP]
នៅដើមសាច់រឿង តួឯកត្រូវប្រឈមមុខនឹងការមើលងាយ និងការសាកល្បងដ៏ធ្ងន់ធ្ងរ។ ប៉ុន្តែនៅក្នុងចិត្ត គេមិនដែលបោះបង់ចោលក្តីសង្ឃឹមឡើយ ហើយគេបានចាប់ផ្តើមហ្វឹកហាត់ក្បាច់ប្រយុទ្ធពិសេសមួយ។

[EVENT & REACTION]
ប៉ុន្តែអ្វីដែលគេមិនបានដឹងនោះគឺ គ្រោះថ្នាក់ដ៏ធំធេងកំពុងរង់ចាំនៅពីមុខ! នៅពេលដែលកងទ័ពសត្រូវ និងគូប្រជែងដ៏ខ្លាំងពូកែបានលេចមុខឡើង សមរភូមិដ៏សាហាវក៏បានផ្ទុះឡើងភ្លាមៗ!

[ACTION & REVEAL]
នៅពេលដែលស្ថិតក្នុងស្ថានភាពចង្អៀតណែន តួឯកស្រាប់តែដាស់អំណាចដែលលាក់កំបាំងនៅក្នុងខ្លួនរបស់គេឱ្យភ្ញាក់ឡើង! ការប្រយុទ្ធគ្នាយ៉ាងស្វិតស្វាញបានធ្វើឱ្យសត្រូវភ្ញាក់ផ្អើលជាខ្លាំង!

[CLIMAX & TWIST]
ប៉ុន្តែអ្វីដែលគួរឱ្យរន្ធត់នោះគឺ នៅពេលដែលជ័យជម្នះហាក់ដូចជាជិតមកដល់ សត្រូវស្រាប់តែបញ្ចេញល្បិចកលចុងក្រោយមួយ ដែលធ្វើឱ្យតួឯកស្ទើរតែបាត់បង់មនុស្សជាទីស្រឡាញ់!

[ENDING]
ទោះជាយ៉ាងណា ដោយសារតែទឹកចិត្តក្លាហាន និងការលះបង់ តួឯកបានវាយបកយកជ័យជម្នះមកវិញ។ ប៉ុន្តែដំណើរផ្សងព្រេងពិតប្រាកដ ទើបតែចាប់ផ្តើមឡើងប៉ុណ្ណោះ...`;
    } else {
      fullScript = `[HOOK]
What if the weakest underdog in the world possessed a hidden divine power capable of breaking reality itself? Welcome to the thrilling saga of ${finalTitle}!

[SETUP]
Our protagonist endures immense hardship and ridicule, yet refuses to surrender. Through brutal discipline, an extraordinary technique begins to awaken.

[EVENT & REACTION]
Just as balance seems near, a formidable rival descends, plunging the realm into an all-out clash of powers!

[ACTION & REVEAL]
Cornered and pushed beyond human limits, the protagonist unlocks their true transformation, turning the tide with jaw-dropping speed!

[CLIMAX & TWIST]
Right when victory seems assured, an unexpected betrayal reveals that the battle was merely a decoy for a much darker threat!

[ENDING]
Through sheer grit and unwavering resolve, our hero stands victorious—knowing that an even greater test lies ahead!`;
    }
  } else {
    // Live action or Drama
    characters = [`${finalTitle} Lead`, 'Key Witness', 'Antagonist Mastermind', 'Loyal Partner'];
    keyPowers = ['Tactical Espionage', 'High-Speed Pursuit', 'Close Combat', 'Psychological Warfare'];
    synopsis = `ដំណើររឿងបែបស៊ើបអង្កេត និងប្រយុទ្ធគ្នាយ៉ាងជក់ចិត្តនៃ ${finalTitle} ដែលបង្ហាញពីការតស៊ូដើម្បីការពិត និងយុត្តិធម៌។`;

    if (isKhmer) {
      fullScript = `[HOOK]
តើអ្នកនឹងធ្វើដូចម្តេច ប្រសិនបើការសម្រេចចិត្តខុសតែមួយវិនាទី អាចផ្លាស់ប្តូរជីវិតរបស់អ្នកជារៀងរហូត? នេះគឺជារឿងរ៉ាវដ៏អស្ចារ្យនិងរំភើបញាប់ញ័រនៃ ${finalTitle}!

[SETUP]
នៅដើមសាច់រឿង ភាពស្ងប់ស្ងាត់គ្របដណ្តប់លើជីវិតរបស់តួឯក។ ប៉ុន្តែនៅក្រោមផ្ទៃទឹកដ៏រលោង អាថ៌កំបាំងងងឹតមួយកំពុងតែលាក់ខ្លួនយ៉ាងស្ងៀមស្ងាត់។

[EVENT & REACTION]
ភ្លាមៗនោះ ហេតុការណ៍ដែលមិននឹកស្មានដល់បានផ្ទុះឡើង! ការរកឃើញភស្តុតាងសំខាន់មួយ បានទាញតួឯកចូលទៅក្នុងបណ្តាញជម្លោះដ៏គ្រោះថ្នាក់។

[ACTION & PROBLEM]
សត្រូវមិនទុកឱកាសឱ្យតួឯកដកដង្ហើមឡើយ! ការដេញតាមចាប់ និងការប្រយុទ្ធគ្នាយ៉ាងតានតឹងបានកើតឡើងនៅគ្រប់ទីកន្លែង។

[CLIMAX & TWIST]
នៅចំណុចកំពូលនៃសាច់រឿង ការពិតដ៏គួរឱ្យភ្ញាក់ផ្អើលត្រូវបានលាតត្រដាងឡើង មនុស្សដែលគេទុកចិត្តបំផុត បែរជាអ្នកនៅពីក្រោយរឿងរ៉ាវទាំងអស់!

[ENDING]
បន្ទាប់ពីឆ្លងកាត់ការលះបង់យ៉ាងច្រើន ទីបំផុតយុត្តិធម៌ត្រូវបានស្តារឡើងវិញ ហើយតួឯកបានរៀនសូត្រពីមេរៀនជីវិតដ៏មានតម្លៃបំផុត។`;
    } else {
      fullScript = `[HOOK]
What would you do if a single split-second choice changed your destiny forever? This is the gripping, pulse-pounding story of ${finalTitle}!

[SETUP]
Life seems peaceful on the surface, but underneath lies a dangerous conspiracy waiting to unravel.

[EVENT & REACTION]
Without warning, an unexpected discovery plunges our protagonist into the center of a deadly crossfire!

[ACTION & PROBLEM]
With enemies closing in from every angle, an intense cat-and-mouse chase tests every survival instinct.

[CLIMAX & TWIST]
At the heart-stopping climax, a shocking betrayal reveals that the mastermind was the closest ally all along!

[ENDING]
Through raw determination and sacrifice, justice is finally reclaimed, leaving an indelible mark on everyone involved.`;
    }
  }

  // Distribute cut guide timestamps dynamically across the REAL video duration
  const step = durationSec / 6;
  const cutsData = [
    {
      cutNumber: 1,
      recapStart: '00:00:00',
      recapEnd: formatTime(Math.min(10, Math.round(step * 0.2))),
      originalStart: formatTime(0),
      originalEnd: formatTime(Math.round(step)),
      visual: `ទិដ្ឋភាពបើកឆាកដំបូងនៃ ${finalTitle} បង្ហាញពីបរិយាកាស និងការចាប់ផ្តើមរបស់តួអង្គ។`,
      narration: isKhmer
        ? `តើអ្នកធ្លាប់គិតទេថា រឿងរ៉ាវដ៏អស្ចារ្យអាចចាប់ផ្តើមពីចំណុចដែលគ្មាននរណានឹកស្មានដល់? នេះគឺជារឿងរ៉ាវនៃ ${finalTitle}!`
        : `What if an incredible journey begins where no one expects? This is the story of ${finalTitle}!`,
      reason: 'ឈុតឆាកបើកសាច់រឿងទាក់ទាញអារម្មណ៍អ្នកទស្សនា (Strong Hook Match)',
      category: 'Important Event',
      isApproximate: false,
      characters: [characters[0]],
    },
    {
      cutNumber: 2,
      recapStart: formatTime(Math.min(10, Math.round(step * 0.2))),
      recapEnd: formatTime(Math.min(22, Math.round(step * 0.4))),
      originalStart: formatTime(Math.round(step)),
      originalEnd: formatTime(Math.round(step * 2)),
      visual: `តួឯកប្រឈមមុខនឹងឧបសគ្គដំបូង និងការរៀបចំយុទ្ធសាស្ត្រ។`,
      narration: isKhmer
        ? 'នៅដើមសាច់រឿង តួឯកត្រូវប្រឈមមុខនឹងការសាកល្បងដ៏លំបាក ប៉ុន្តែគេមិនដែលចុះចាញ់ឡើយ។'
        : 'Early on, our hero faces daunting trials, yet refuses to back down.',
      reason: 'បង្ហាញពីការរៀបចំសាច់រឿង និងការអភិវឌ្ឍតួអង្គ (Setup Match)',
      category: 'Character',
      isApproximate: false,
      characters: [characters[0], characters[1]],
    },
    {
      cutNumber: 3,
      recapStart: formatTime(Math.min(22, Math.round(step * 0.4))),
      recapEnd: formatTime(Math.min(36, Math.round(step * 0.6))),
      originalStart: formatTime(Math.round(step * 2)),
      originalEnd: formatTime(Math.round(step * 3)),
      visual: `ការប៉ះទង្គិចគ្នា និងការលេចមុខឡើងនៃសត្រូវដ៏គ្រោះថ្នាក់។`,
      narration: isKhmer
        ? 'ប៉ុន្តែអ្វីដែលគេមិនបានដឹងនោះគឺ គ្រោះថ្នាក់ធំកំពុងរង់ចាំនៅពីមុខ! សមរភូមិដ៏សាហាវក៏បានចាប់ផ្តើមឡើង!'
        : 'Little do they know, great danger lies in wait as an all-out confrontation erupts!',
      reason: 'រូបភាពបង្ហាញពីព្រឹត្តិការណ៍ជម្លោះផ្ទាល់ (Event & Action Match)',
      category: 'Action',
      isApproximate: false,
      characters: [characters[0], characters[2]],
    },
    {
      cutNumber: 4,
      recapStart: formatTime(Math.min(36, Math.round(step * 0.6))),
      recapEnd: formatTime(Math.min(50, Math.round(step * 0.8))),
      originalStart: formatTime(Math.round(step * 3)),
      originalEnd: formatTime(Math.round(step * 4)),
      visual: `ការវាយបក និងការដាស់សមត្ថភាពពិសេសរបស់តួឯក។`,
      narration: isKhmer
        ? 'នៅក្នុងស្ថានភាពចង្អៀតណែន តួឯកបានបញ្ចេញសមត្ថភាពពិតប្រាកដរបស់គេ ដែលធ្វើឱ្យសត្រូវភ្ញាក់ផ្អើល!'
        : 'Pushed to the limit, our hero unleashes their true strength, turning the tide!',
      reason: 'ការបង្ហាញអំណាច និងការប្រយុទ្ធគ្នាយ៉ាងស្វិតស្វាញ (Climax Combat Match)',
      category: 'Climax',
      isApproximate: false,
      characters: [characters[0]],
    },
    {
      cutNumber: 5,
      recapStart: formatTime(Math.min(50, Math.round(step * 0.8))),
      recapEnd: formatTime(Math.min(65, Math.round(step * 0.95))),
      originalStart: formatTime(Math.round(step * 4)),
      originalEnd: formatTime(Math.round(step * 5)),
      visual: `ចំណុចរបត់ដ៏ភ្ញាក់ផ្អើល និងការទម្លាយការពិត។`,
      narration: isKhmer
        ? 'ប៉ុន្តែអ្វីដែលមិននឹកស្មានដល់នោះគឺ ការពិតដ៏គួរឱ្យរន្ធត់ត្រូវបានលាតត្រដាងឡើងនៅវិនាទីចុងក្រោយ!'
        : 'Just when victory is in sight, a shocking plot twist flips everything upside down!',
      reason: 'ឈុតឆាកទម្លាយអាថ៌កំបាំងសំខាន់នៃសាច់រឿង (Plot Twist Match)',
      category: 'Plot Twist',
      isApproximate: false,
      characters: [characters[0], characters[3]],
    },
    {
      cutNumber: 6,
      recapStart: formatTime(Math.min(65, Math.round(step * 0.95))),
      recapEnd: formatTime(Math.min(80, Math.round(step * 1.1))),
      originalStart: formatTime(Math.round(step * 5)),
      originalEnd: formatTime(durationSec),
      visual: `ឈុតឆាកបញ្ចប់នៃវីដេអូ បង្ហាញពីលទ្ធផលនៃការប្រយុទ្ធ និងក្តីសង្ឃឹមថ្មី។`,
      narration: isKhmer
        ? 'ទីបំផុត ដោយសារតែភាពក្លាហាន តួឯកបានការពារអ្វីៗគ្រប់យ៉ាង ប៉ុន្តែដំណើរផ្សងព្រេងទើបតែចាប់ផ្តើមប៉ុណ្ណោះ!'
        : 'Ultimately, courage prevails, and our hero stands tall—ready for the next chapter!',
      reason: 'ការបិទបញ្ចប់សាច់រឿងយ៉ាងរំជួលចិត្ត (Ending Match)',
      category: 'Ending',
      isApproximate: false,
      characters: [characters[0]],
    },
  ];

  return {
    detectedTitle: finalTitle,
    detectedType: detected.type,
    detectedEpisode: detectedEp,
    genre: detected.genre,
    detectedCharacters: characters,
    keyPowersOrThemes: keyPowers,
    synopsis,
    estimatedNarrationDuration: formatTime(Math.round(step * 1.1)),
    wordCount: fullScript.trim().split(/\s+/).filter(Boolean).length,
    recapScript: {
      fullText: fullScript,
      sections: [
        { heading: 'HOOK', narration: cutsData[0].narration },
        { heading: 'SETUP', narration: cutsData[1].narration },
        { heading: 'ACTION', narration: cutsData[2].narration },
        { heading: 'CLIMAX', narration: cutsData[3].narration },
        { heading: 'TWIST', narration: cutsData[4].narration },
        { heading: 'ENDING', narration: cutsData[5].narration },
      ],
    },
    cutGuide: cutsData.map((c, idx) => ({
      ...c,
      id: `cut-${idx + 1}-${Date.now()}`,
      recapStartSec: parseTimeToSeconds(c.recapStart),
      recapEndSec: parseTimeToSeconds(c.recapEnd),
      originalStartSec: parseTimeToSeconds(c.originalStart),
      originalEndSec: parseTimeToSeconds(c.originalEnd),
    })),
  };
}
