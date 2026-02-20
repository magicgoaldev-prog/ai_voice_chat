import jwt from 'jsonwebtoken';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
}
