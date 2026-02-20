import express from 'express';
import { translateText } from '../services/translationService';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await translateText(text, targetLanguage || 'en');
    res.json({
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: targetLanguage || 'en',
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Failed to translate text' });
  }
});

export default router;
