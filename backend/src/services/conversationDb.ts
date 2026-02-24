import { supabase, MOCK_USER_ID } from './supabase';

export type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  type: 'user' | 'ai';
  transcription: string | null;
  ai_response_text: string | null;
  corrected_text: string | null;
  explanation: string | null;
  user_audio_url: string | null;
  ai_audio_url: string | null;
  is_suggested_reply: boolean;
  created_at: string;
};

export async function listConversations(userId: string = MOCK_USER_ID): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ConversationRow[];
}

export async function upsertConversation(params: {
  id: string;
  title?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  user_id?: string;
}): Promise<void> {
  const row = {
    id: params.id,
    user_id: params.user_id || MOCK_USER_ID,
    title: params.title ?? null,
    last_message: params.last_message ?? null,
    last_message_at: params.last_message_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('conversations').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function getConversation(conversationId: string, userId: string = MOCK_USER_ID): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationRow) || null;
}

export async function deleteConversationById(conversationId: string, userId: string = MOCK_USER_ID): Promise<void> {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId).eq('user_id', userId);
  if (error) throw error;
}

export async function listMessages(conversationId: string, userId: string = MOCK_USER_ID): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as MessageRow[];
}

export async function insertMessages(rows: MessageRow[]): Promise<void> {
  // Idempotent insert: client generates IDs; retries/stream+fallback can cause duplicates.
  // Use upsert on primary key to avoid 23505 duplicate key errors.
  const { error } = await supabase.from('messages').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function updateMessage(conversationId: string, messageId: string, patch: Partial<MessageRow>) {
  const { error } = await supabase
    .from('messages')
    .update(patch)
    .eq('id', messageId)
    .eq('conversation_id', conversationId);
  if (error) throw error;
}

export async function deleteMessagesByConversation(conversationId: string, userId: string = MOCK_USER_ID): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

