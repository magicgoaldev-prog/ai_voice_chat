-- Supabase schema for eng_ai_voice
-- Create tables

create table if not exists public.conversations (
  id text primary key,
  user_id text not null,
  title text,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  user_id text not null,
  type text not null check (type in ('user','ai')),
  transcription text,
  ai_response_text text,
  corrected_text text,
  explanation text,
  user_audio_url text,
  ai_audio_url text,
  is_suggested_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id, created_at);

-- Storage bucket:
-- Create a bucket named 'audio' (or set SUPABASE_STORAGE_BUCKET) and make it public,
-- or use signed URLs in your app.

