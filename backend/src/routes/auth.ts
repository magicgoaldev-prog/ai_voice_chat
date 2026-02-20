import express from 'express';
import { generateToken } from '../services/authService';

const router = express.Router();

// Google OAuth callback
// In production, this would use Passport.js with Google OAuth 2.0
// For MVP, we'll accept Google ID token from frontend
router.post('/google', async (req, res) => {
  try {
    const { idToken, userInfo } = req.body;

    // In production, verify the ID token with Google
    // For MVP, we'll trust the frontend and create a session
    if (!userInfo || !userInfo.email) {
      return res.status(400).json({ error: 'Invalid user info' });
    }

    // Generate JWT token
    const token = generateToken(userInfo.id || userInfo.email);

    res.json({
      token,
      user: {
        id: userInfo.id || userInfo.email,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { verifyToken } = await import('../services/authService');
    const decoded = verifyToken(token);
    res.json({ valid: true, userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
