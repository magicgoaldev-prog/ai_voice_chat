// Web Speech API TTS utility

export interface SpeechSynthesisOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice;
}

export function speakText(options: SpeechSynthesisOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis is not supported in this browser.'));
      return;
    }

    // Cancel any ongoing speech and wait a bit for cleanup
    window.speechSynthesis.cancel();
    
    // Small delay to ensure previous speech is fully cancelled
    setTimeout(() => {
      try {
        // Validate and sanitize rate value
        let rate = options.rate;
        if (rate === undefined || rate === null || isNaN(rate) || !isFinite(rate)) {
          rate = 1.0;
        }
        // Clamp rate to valid range (0.1 to 10)
        rate = Math.max(0.1, Math.min(10, rate));
        
        // Validate and sanitize pitch value
        let pitch = options.pitch;
        if (pitch === undefined || pitch === null || isNaN(pitch) || !isFinite(pitch)) {
          pitch = 1.0;
        }
        // Clamp pitch to valid range (0 to 2)
        pitch = Math.max(0, Math.min(2, pitch));
        
        // Validate and sanitize volume value
        let volume = options.volume;
        if (volume === undefined || volume === null || isNaN(volume) || !isFinite(volume)) {
          volume = 1.0;
        }
        // Clamp volume to valid range (0 to 1)
        volume = Math.max(0, Math.min(1, volume));
        
        const utterance = new SpeechSynthesisUtterance(options.text);
        utterance.lang = options.lang || 'en-US';
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;
        
        console.log('TTS utterance created with:', { rate, pitch, volume, lang: utterance.lang });

        if (options.voice) {
          utterance.voice = options.voice;
        }

        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.warn('TTS timeout - assuming completion');
            resolve();
          }
        }, Math.max(30000, options.text.length * 100)); // Timeout based on text length

        utterance.onend = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            console.log('TTS completed successfully');
            resolve();
          }
        };

        utterance.onerror = (event) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            const errorMessage = `Speech synthesis error: ${event.error} (charIndex: ${event.charIndex})`;
            console.error('TTS error:', errorMessage, event);
            reject(new Error(errorMessage));
          }
        };

        utterance.onstart = () => {
          console.log('TTS started:', options.text.substring(0, 50) + '...');
        };

        utterance.onpause = () => {
          console.log('TTS paused');
        };

        utterance.onresume = () => {
          console.log('TTS resumed');
        };

        // Check if speechSynthesis is speaking before starting
        // Note: pending property may not be available in all browsers
        const isSpeaking = window.speechSynthesis.speaking || 
          (window.speechSynthesis as any).pending || false;
        
        if (isSpeaking) {
          console.warn('Speech synthesis is already active, ensuring clean state...');
          window.speechSynthesis.cancel();
          // Wait a bit longer if something was speaking
          setTimeout(() => {
            try {
              if (!resolved) {
                window.speechSynthesis.speak(utterance);
              }
            } catch (speakError: any) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                const errorMsg = speakError?.message || 'Unknown error';
                console.error('Failed to speak after cancel:', errorMsg);
                reject(new Error(`Failed to speak: ${errorMsg}`));
              }
            }
          }, 200);
        } else {
          try {
            window.speechSynthesis.speak(utterance);
          } catch (speakError: any) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              const errorMsg = speakError?.message || 'Unknown error';
              console.error('Failed to speak:', errorMsg, speakError);
              reject(new Error(`Failed to speak: ${errorMsg}`));
            }
          }
        }
      } catch (error: any) {
        console.error('Error creating utterance:', error);
        reject(new Error(`Failed to create speech utterance: ${error.message || 'Unknown error'}`));
      }
    }, 50); // Small delay after cancel
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  const voices = getAvailableVoices();
  return voices.filter(voice => 
    voice.lang.startsWith('en') || 
    voice.lang.includes('English')
  );
}

// Wait for voices to be loaded
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = getAvailableVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(getAvailableVoices());
    };
  });
}
