// IndexedDB utilities for audio file storage
// IndexedDB has much larger storage limits than localStorage (typically 50% of disk space)

const DB_NAME = 'eng_ai_voice_audio';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

interface AudioData {
  id: string;
  blob: Blob;
  createdAt: string;
}

let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

export async function saveAudio(audioId: string, audioBlob: Blob): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const audioData: AudioData = {
      id: audioId,
      blob: audioBlob,
      createdAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(audioData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('Audio saved to IndexedDB:', audioId);
  } catch (error) {
    console.error('Error saving audio to IndexedDB:', error);
    throw error;
  }
}

export async function getAudio(audioId: string): Promise<Blob | null> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise<Blob | null>((resolve, reject) => {
      const request = store.get(audioId);
      request.onsuccess = () => {
        const result = request.result as AudioData | undefined;
        resolve(result ? result.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting audio from IndexedDB:', error);
    return null;
  }
}

export async function deleteAudio(audioId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(audioId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('Audio deleted from IndexedDB:', audioId);
  } catch (error) {
    console.error('Error deleting audio from IndexedDB:', error);
    throw error;
  }
}

export async function getAllAudioIds(): Promise<string[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise<string[]>((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        resolve(request.result as string[]);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting audio IDs from IndexedDB:', error);
    return [];
  }
}

// Convert Blob to base64 for localStorage (fallback for small files)
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert base64 to Blob
export function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
  const bytes = atob(data);
  const arrayBuffer = new ArrayBuffer(bytes.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < bytes.length; i++) {
    uint8Array[i] = bytes.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: mime });
}
