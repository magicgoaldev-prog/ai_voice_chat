import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Ensure env vars are loaded before this module reads them.
// (Some entrypoints import routes/services before calling dotenv.config().)
dotenv.config();
// Fallback: allow a workspace-root `.env` when running from `backend/`
// (e.g., `cd backend && npm run dev`)
if (!process.env.SUPABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in environment variables`);
  return v;
}

export const SUPABASE_URL = requireEnv('SUPABASE_URL');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// Guardrail: Storage uploads from backend require a secret/service role key.
// If a publishable key is used, Storage RLS will block inserts (403).
if (SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_')) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY appears to be a publishable key (sb_publishable_*). ' +
      'For backend DB/Storage writes you must use the Supabase secret/service_role key. ' +
      'Get it from Supabase Dashboard → Project Settings → API → "service_role" (secret).'
  );
}
export const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'audio';

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const MOCK_USER_ID = process.env.MOCK_USER_ID || 'mock-user';

