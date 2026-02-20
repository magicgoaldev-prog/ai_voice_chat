// Local storage utilities for conversation management
import { Conversation, Message } from '../types';
import { saveAudio, getAudio, deleteAudio } from './audioStorage';

const CONVERSATIONS_KEY = 'eng_ai_voice_conversations';
const MESSAGES_KEY_PREFIX = 'eng_ai_voice_messages_';

export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function saveConversation(conversation: Conversation): void {
  const conversations = getConversations();
  const existingIndex = conversations.findIndex(c => c.id === conversation.id);
  
  if (existingIndex >= 0) {
    conversations[existingIndex] = conversation;
  } else {
    conversations.unshift(conversation); // Add to beginning
  }
  
  // Sort by updatedAt (most recent first)
  conversations.sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt).getTime();
    return dateB - dateA;
  });
  
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export function getConversations(): Conversation[] {
  try {
    const data = localStorage.getItem(CONVERSATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading conversations:', error);
    return [];
  }
}

export function getConversation(id: string): Conversation | null {
  const conversations = getConversations();
  return conversations.find(c => c.id === id) || null;
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = getConversations().filter(c => c.id !== id);
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  
  // Also delete messages for this conversation
  const messages = getMessages(id);
  
  // Delete associated audio files from IndexedDB
  for (const message of messages) {
    if (message.userAudioUrl) {
      // Extract audio ID from blob URL or use message ID
      const audioId = `audio_${message.id}`;
      try {
        await deleteAudio(audioId);
      } catch (error) {
        console.error('Error deleting audio:', error);
      }
    }
  }
  
  localStorage.removeItem(`${MESSAGES_KEY_PREFIX}${id}`);
}

export async function saveMessage(conversationId: string, message: Message): Promise<void> {
  // Create a copy of the message to avoid mutating the original
  const messageToSave = { ...message };
  
  // If message has userAudioUrl (blob URL), save the audio to IndexedDB
  if (messageToSave.userAudioUrl && messageToSave.userAudioUrl.startsWith('blob:') && messageToSave.type === 'user') {
    try {
      // Fetch the blob from the URL
      const response = await fetch(messageToSave.userAudioUrl);
      const blob = await response.blob();
      
      // Save to IndexedDB
      const audioId = `audio_${messageToSave.id}`;
      await saveAudio(audioId, blob);
      
      // Update message to use the stored audio ID instead of blob URL
      // The blob URL will be recreated when loading
      messageToSave.userAudioUrl = audioId; // Store ID instead of blob URL
    } catch (error) {
      console.error('Error saving audio to IndexedDB:', error);
      // Continue without audio if storage fails, but keep the blob URL
    }
  }
  
  const messages = getMessages(conversationId);
  
  // Check if message already exists (avoid duplicates)
  const existingIndex = messages.findIndex(m => m.id === messageToSave.id);
  if (existingIndex >= 0) {
    // Update existing message
    messages[existingIndex] = messageToSave;
  } else {
    // Add new message and sort by createdAt to maintain order
    messages.push(messageToSave);
    messages.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }
  
  // Update conversation with last message info
  const conversation = getConversation(conversationId);
  if (conversation) {
    conversation.lastMessage = messageToSave.type === 'user' 
      ? (messageToSave.transcription || messageToSave.correctedText || '')
      : (messageToSave.aiResponseText || '');
    conversation.lastMessageAt = messageToSave.createdAt;
    conversation.updatedAt = messageToSave.createdAt;
    conversation.messageCount = messages.length;
    
    // Generate title from first user message if not set
    if (!conversation.title && messageToSave.type === 'user') {
      const firstUserMessage = messages.find(m => m.type === 'user');
      if (firstUserMessage) {
        conversation.title = (firstUserMessage.transcription || firstUserMessage.correctedText || 'New Conversation')
          .substring(0, 50);
      }
    }
    
    saveConversation(conversation);
  }
  
  localStorage.setItem(`${MESSAGES_KEY_PREFIX}${conversationId}`, JSON.stringify(messages));
}

// Load message with audio from IndexedDB
export async function loadMessageWithAudio(message: Message): Promise<Message> {
  // Check if userAudioUrl is an audio ID (starts with 'audio_') or already a blob URL
  if (message.userAudioUrl) {
    if (message.userAudioUrl.startsWith('audio_')) {
      // This is an audio ID, load from IndexedDB
      const audioId = message.userAudioUrl;
      const blob = await getAudio(audioId);
      
      if (blob) {
        // Create blob URL from stored audio
        message.userAudioUrl = URL.createObjectURL(blob);
      } else {
        // Audio not found in IndexedDB, remove the reference
        console.warn('Audio not found in IndexedDB:', audioId);
        message.userAudioUrl = undefined;
      }
    }
    // If it's already a blob URL (starts with 'blob:'), keep it as is
  }
  
  return message;
}

// Load all messages with audio for a conversation
export async function loadMessagesWithAudio(conversationId: string): Promise<Message[]> {
  const messages = getMessages(conversationId);
  const loadedMessages = await Promise.all(
    messages.map(msg => loadMessageWithAudio(msg))
  );
  return loadedMessages;
}

export function getMessages(conversationId: string): Message[] {
  try {
    const data = localStorage.getItem(`${MESSAGES_KEY_PREFIX}${conversationId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
}

export function createNewConversation(): Conversation {
  const conversation: Conversation = {
    id: generateConversationId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: 'New Conversation',
    messageCount: 0,
  };
  
  saveConversation(conversation);
  return conversation;
}
