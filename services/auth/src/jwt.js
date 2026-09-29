/**
 * Auth Token Management & Verification
 */
import jwt from 'jsonwebtoken';

// Retrieve JWT secret from runtime environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '1h';

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
