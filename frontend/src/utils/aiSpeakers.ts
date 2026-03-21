import { AISpeaker } from './userSettings';

// Import images - Vite will handle these as URLs
// @ts-ignore - Image imports are handled by Vite
import emmaPhoto from '../assets/imgs/emma.png';
// @ts-ignore
import jamesPhoto from '../assets/imgs/james.png';
// @ts-ignore
import sophiaPhoto from '../assets/imgs/sophia.png';
// @ts-ignore
import michaelPhoto from '../assets/imgs/michael.png';

// Default AI Speakers - will be populated from available WebSpeech voices
export const DEFAULT_AI_SPEAKERS: AISpeaker[] = [
  {
    id: 'speaker_1',
    name: 'Emma',
    photo: emmaPhoto,
    voiceName: '', // Will be set dynamically
    gender: 'female',
    age: 'young',
  },
  {
    id: 'speaker_2',
    name: 'James',
    photo: jamesPhoto,
    voiceName: '', // Will be set dynamically
    gender: 'male',
    age: 'adult',
  },
  {
    id: 'speaker_3',
    name: 'Sophia',
    photo: sophiaPhoto,
    voiceName: '', // Will be set dynamically
    gender: 'female',
    age: 'adult',
  },
  {
    id: 'speaker_4',
    name: 'Michael',
    photo: michaelPhoto,
    voiceName: '', // Will be set dynamically
    gender: 'male',
    age: 'young',
  },
];

// Helper function to assign voices to speakers based on available WebSpeech voices
// Tries to assign distinct voices with different characteristics
export function assignVoicesToSpeakers(
  speakers: AISpeaker[],
  availableVoices: SpeechSynthesisVoice[],
  practiceLanguage: 'en' | 'he' = 'en'
): AISpeaker[] {
  const langVoices =
    practiceLanguage === 'he'
      ? availableVoices.filter((v) => v.lang.startsWith('he'))
      : availableVoices.filter(
          (v) => v.lang.startsWith('en') || v.lang.includes('English')
        );

  if (practiceLanguage === 'he') {
    return speakers.map((speaker, i) => ({
      ...speaker,
      voiceName: langVoices[i % langVoices.length]?.name || '',
    }));
  }

  const englishVoices = langVoices;

  // More comprehensive voice name matching
  const femaleVoices = englishVoices.filter((v) => {
    const name = v.name.toLowerCase();
    const gender = (v as any).gender; // gender is not in standard type but may exist
    return (
      gender === 'female' ||
      name.includes('female') ||
      name.includes('woman') ||
      name.includes('zira') ||
      name.includes('samantha') ||
      name.includes('karen') ||
      name.includes('susan') ||
      name.includes('hazel') ||
      name.includes('heather') ||
      name.includes('helen') ||
      name.includes('linda') ||
      name.includes('lisa') ||
      name.includes('victoria') ||
      name.includes('veena') ||
      name.includes('tessa') ||
      name.includes('fiona') ||
      name.includes('kate') ||
      name.includes('sarah') ||
      name.includes('shelley') ||
      name.includes('monica') ||
      name.includes('nancy') ||
      name.includes('allison')
    );
  });

  const maleVoices = englishVoices.filter((v) => {
    const name = v.name.toLowerCase();
    const gender = (v as any).gender; // gender is not in standard type but may exist
    return (
      gender === 'male' ||
      name.includes('male') ||
      name.includes('man') ||
      name.includes('david') ||
      name.includes('mark') ||
      name.includes('alex') ||
      name.includes('daniel') ||
      name.includes('thomas') ||
      name.includes('richard') ||
      name.includes('james') ||
      name.includes('john') ||
      name.includes('michael') ||
      name.includes('lee') ||
      name.includes('tom') ||
      name.includes('aaron') ||
      name.includes('fred') ||
      name.includes('ralph') ||
      name.includes('bruce') ||
      name.includes('nick') ||
      name.includes('reed') ||
      (name.includes('siri') && name.includes('male'))
    );
  });

  // Remove duplicates and sort by name for consistency
  const uniqueFemaleVoices = Array.from(
    new Map(femaleVoices.map(v => [v.name, v])).values()
  );
  const uniqueMaleVoices = Array.from(
    new Map(maleVoices.map(v => [v.name, v])).values()
  );

  // Assign voices with priority: try to get distinct voices
  const usedVoiceNames = new Set<string>();
  
  return speakers.map((speaker) => {
    let voice: SpeechSynthesisVoice | undefined;
    let candidateVoices: SpeechSynthesisVoice[] = [];

    if (speaker.gender === 'female' && uniqueFemaleVoices.length > 0) {
      candidateVoices = uniqueFemaleVoices;
    } else if (speaker.gender === 'male' && uniqueMaleVoices.length > 0) {
      candidateVoices = uniqueMaleVoices;
    } else {
      candidateVoices = englishVoices;
    }

    // Try to find an unused voice first
    const unusedVoices = candidateVoices.filter(v => !usedVoiceNames.has(v.name));
    if (unusedVoices.length > 0) {
      // Prefer voices that match age characteristics
      if (speaker.age === 'young') {
        // For young voices, prioritize voices with names that suggest youth
        const veryYoungVoices = unusedVoices.filter(v => {
          const name = v.name.toLowerCase();
          return (
            name.includes('young') ||
            name.includes('teen') ||
            name.includes('girl') ||
            name.includes('samantha') || // Often sounds younger
            name.includes('karen') || // Often sounds younger
            name.includes('tessa') || // Often sounds younger
            name.includes('fiona') || // Often sounds younger
            name.includes('kate') || // Often sounds younger
            name.includes('sarah') // Often sounds younger
          ) && !name.includes('senior') && !name.includes('mature') && !name.includes('old');
        });
        // If no very young voices found, filter out mature/senior voices
        const youngVoices = veryYoungVoices.length > 0 
          ? veryYoungVoices 
          : unusedVoices.filter(v => {
              const name = v.name.toLowerCase();
              return !name.includes('senior') && !name.includes('mature') && !name.includes('old');
            });
        voice = youngVoices[0] || unusedVoices[0];
      } else if (speaker.age === 'senior') {
        const seniorVoices = unusedVoices.filter(v => {
          const name = v.name.toLowerCase();
          return name.includes('senior') || name.includes('mature') || name.includes('old');
        });
        voice = seniorVoices[0] || unusedVoices[0];
      } else {
        // For adult, prefer voices that are not too young or too old
        const adultVoices = unusedVoices.filter(v => {
          const name = v.name.toLowerCase();
          return !name.includes('young') && !name.includes('senior');
        });
        voice = adultVoices[0] || unusedVoices[0];
      }
    } else {
      // If all voices are used, cycle through them but try to pick different ones
      const index = usedVoiceNames.size % candidateVoices.length;
      voice = candidateVoices[index];
    }

    if (voice) {
      usedVoiceNames.add(voice.name);
    }

    return {
      ...speaker,
      voiceName: voice?.name || '',
    };
  });
}
