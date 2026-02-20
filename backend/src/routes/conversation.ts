import express from 'express';
import { processTextMessage } from '../services/conversationService';

const router = express.Router();

router.post('/start', async (req, res) => {
  try {
    // Placeholder for conversation start
    res.json({ conversationId: 'temp-id', message: 'Conversation started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

router.post('/message', async (req, res) => {
  try {
    const { text, sessionId } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required and cannot be empty.' });
    }

    const result = await processTextMessage(text.trim(), sessionId);
    res.json(result);
  } catch (error: any) {
    console.error('Error processing text message:', error);
    
    // Extract user-friendly error message
    const errorMessage = error?.message || 'Failed to process message.';
    
    // Determine appropriate status code
    let statusCode = 500;
    if (error?.message?.includes('quota') || error?.message?.includes('Too many requests')) {
      statusCode = 429;
    } else if (error?.message?.includes('API key') || error?.message?.includes('invalid')) {
      statusCode = 401;
    } else if (error?.message?.includes('Invalid request')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    // Placeholder for conversation retrieval
    res.json({ conversationId: req.params.id, messages: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve conversation' });
  }
});

export default router;
