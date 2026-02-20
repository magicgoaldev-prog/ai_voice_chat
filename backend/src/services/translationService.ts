// Using REST API instead of @google-cloud/translate for simpler setup
let translateApiKey: string | undefined;

function getTranslateApiKey(): string {
  if (!translateApiKey) {
    translateApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!translateApiKey) {
      throw new Error('GOOGLE_TRANSLATE_API_KEY is not set');
    }
  }
  return translateApiKey;
}

export async function translateText(
  text: string,
  targetLanguage: string = 'en'
): Promise<{ translatedText: string; sourceLanguage: string }> {
  try {
    const apiKey = getTranslateApiKey();
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        target: targetLanguage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }

    const data = await response.json();
    const translation = data.data.translations[0];
    
    return {
      translatedText: translation.translatedText,
      sourceLanguage: translation.detectedSourceLanguage || 'unknown',
    };
  } catch (error) {
    console.error('Translation Error:', error);
    throw new Error('Failed to translate text');
  }
}
