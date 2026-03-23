import type { PracticeLanguage } from './userSettings';

/** Best-effort terminal punctuation and light comma insertion after STT (no LLM). */
export function autoPunctuate(text: string, practiceLanguage: PracticeLanguage = 'en'): string {
  const t = (text || '').trim();
  if (!t) return '';
  return practiceLanguage === 'he' ? autoPunctuateHebrew(t) : autoPunctuateEnglish(t);
}

function autoPunctuateEnglish(t: string): string {
  let s = t
    .replace(/\s+but\s+/gi, ', but ')
    .replace(/\s+so\s+/gi, ', so ')
    .replace(/\s+however\s+/gi, ', however ');
  s = s.replace(/,\s*,/g, ', ');
  if (/[.!?]$/.test(s)) return s;

  const lower = s.toLowerCase();
  const looksLikeQuestion =
    /^(who|what|why|how|when|where|which)\b/.test(lower) ||
    /^(is|are|am|do|does|did|can|could|would|should|will|have|has|had)\b/.test(lower) ||
    /\b(what|why|how|when|where|which)\b/.test(lower);

  return looksLikeQuestion ? `${s}?` : `${s}.`;
}

/** Hebrew: comma before common discourse markers; terminal . or ? (JS \\b is unreliable for Hebrew). */
function autoPunctuateHebrew(t: string): string {
  let s = t
    .replace(/\s+אבל\s+/g, ', אבל ')
    .replace(/\s+אולם\s+/g, ', אולם ')
    .replace(/\s+לכן\s+/g, ', לכן ');
  s = s.replace(/,\s*,/g, ', ');

  if (/[.!?׃…]$/.test(s)) return s;

  const looksLikeQuestion = /^(מה|מי|איך|למה|מתי|איפה|איזה|איזו|אילו|האם)/.test(s);

  return looksLikeQuestion ? `${s}?` : `${s}.`;
}
