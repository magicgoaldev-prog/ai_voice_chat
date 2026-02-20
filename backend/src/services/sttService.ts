import axios from 'axios';
import FormData from 'form-data';

export async function processSTT(audioFile: Express.Multer.File): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    // Validate audio file
    if (!audioFile.buffer || audioFile.buffer.length === 0) {
      throw new Error('Audio file is empty');
    }

    if (audioFile.buffer.length < 1024) {
      throw new Error('Audio file is too small');
    }

    // Create FormData for multipart/form-data request
    const formData = new FormData();
    
    // Append file buffer with proper options
    formData.append('file', audioFile.buffer, {
      filename: audioFile.originalname || 'audio.webm',
      contentType: audioFile.mimetype || 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Use axios which handles form-data better than fetch in Node.js
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data.text;
  } catch (error: any) {
    console.error('STT Error:', error);
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      console.error('OpenAI API error:', status, errorData);
      
      // Handle specific error types with user-friendly messages
      if (status === 429) {
        const errorCode = errorData?.error?.code;
        if (errorCode === 'insufficient_quota') {
          throw new Error('OpenAI API quota exceeded. Please check your account billing and plan details.');
        } else {
          throw new Error('Too many requests. Please try again later.');
        }
      } else if (status === 401) {
        throw new Error('OpenAI API key is invalid. Please check your settings.');
      } else if (status === 400) {
        throw new Error('Invalid request. Please check the audio file format.');
      } else {
        throw new Error(`Speech recognition error occurred. (${status})`);
      }
    }
    throw new Error(`Speech recognition error occurred: ${error.message}`);
  }
}
