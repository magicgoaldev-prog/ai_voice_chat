// Web Speech API TTS — simplified singleton
//
// Design:
// - Only one global speak job at a time
// - New speakText() resolves the previous call (never rejects)
// - No start notification from here — callers set UI state if needed
// - Chrome workarounds:
//   A) After cancel(), ignore onend within 250ms of speak() (echo from prior cancel)
//   B) Background tab pause: poll resume() every 100ms

export interface SpeakOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
}

// Global singleton state
let _token   = 0;
let _resolve: (() => void) | null = null;
let _keepAliveId: ReturnType<typeof setInterval> | null = null;

function _stopKA() {
  if (_keepAliveId !== null) { clearInterval(_keepAliveId); _keepAliveId = null; }
}

function _startKA() {
  _stopKA();
  _keepAliveId = setInterval(() => {
    try {
      if ('speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch { /* ignore */ }
  }, 100);
}

/**
 * Stop current speech and resolve its Promise.
 * Called automatically at the start of speakText().
 */
function _cancel() {
  _token++;
  _stopKA();
  if (_resolve) {
    const r = _resolve;
    _resolve = null;
    r(); // Resolve the previous speakText() promise
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Speak text. The returned Promise resolves when playback finishes or when
 * another speakText() / stopSpeaking() runs. Never rejects.
 */
export function speakText(opts: SpeakOptions): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();

  _cancel();
  const myToken = _token;

  return new Promise<void>((resolve) => {
    _resolve = resolve;

    const rate   = _clamp(opts.rate   ?? 1.0, 0.1, 10);
    const pitch  = _clamp(opts.pitch  ?? 1.0, 0,   2);
    const volume = _clamp(opts.volume ?? 1.0, 0,   1);

    const utt    = new SpeechSynthesisUtterance(opts.text);
    utt.lang     = opts.lang ?? 'en-US';
    utt.rate     = rate;
    utt.pitch    = pitch;
    utt.volume   = volume;

    // Resolve voice each time (avoids stale voice object bugs)
    if (opts.voiceName) {
      const found = window.speechSynthesis.getVoices().find(v => v.name === opts.voiceName);
      if (found) utt.voice = found;
    }

    const safetyMs = Math.min(90_000, Math.max(20_000, opts.text.length * 100));
    let   done     = false;
    let   callTime = 0;
    let   safetyId: ReturnType<typeof setTimeout>;

    const finish = (src: string) => {
      if (done) return;
      // Chrome: onend within 250ms of speak() can be echo from a prior cancel
      if (src === 'onend' && callTime > 0 && (Date.now() - callTime) < 250) {
        return;
      }
      done = true;
      clearTimeout(safetyId);
      _stopKA();
      if (myToken === _token) {
        _resolve = null;
        resolve();
      }
    };

    utt.onend   = () => finish('onend');
    utt.onerror = (e) => {
      // 'interrupted' is expected when we cancel — treat as normal completion
      finish('onerror:' + e.error);
    };

    // Wait 180ms after cancel() so the browser fully finishes cancel
    setTimeout(() => {
      if (myToken !== _token) { finish('superseded'); return; }
      try {
        callTime = Date.now();
        window.speechSynthesis.speak(utt);
        _startKA();
        safetyId = setTimeout(() => finish('timeout'), safetyMs);
      } catch {
        finish('speak-threw');
      }
    }, 180);
  });
}

/** Stop current playback. */
export function stopSpeaking() {
  _cancel();
}

// Voice list helpers

export function getVoicesForLang(lang: 'en' | 'he'): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  if (lang === 'he') {
    return all.filter(v => v.lang.startsWith('he') || v.name.toLowerCase().includes('hebrew'));
  }
  return all.filter(v => v.lang.startsWith('en') || v.lang.includes('English'));
}

// Back-compat aliases
export function getAvailableVoices()               { return ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() : []; }
export function getEnglishVoices()                 { return getVoicesForLang('en'); }
export function getVoicesForPracticeLanguage(l: 'en'|'he') { return getVoicesForLang(l); }

export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const v = window.speechSynthesis.getVoices();
  if (v.length > 0) return Promise.resolve(v);
  return new Promise(res => {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      res(window.speechSynthesis.getVoices());
    }, { once: true });
  });
}

export function waitForVoicesWithRetry(retryMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return waitForVoices().then(v => {
    if (v.length > 0) return v;
    return new Promise<SpeechSynthesisVoice[]>(res =>
      setTimeout(() => res(window.speechSynthesis?.getVoices() ?? []), retryMs)
    );
  });
}

function _clamp(v: number, min: number, max: number) {
  if (!isFinite(v) || isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}