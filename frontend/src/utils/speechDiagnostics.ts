// Diagnostic utilities for Web Speech API troubleshooting

export interface SpeechDiagnostics {
  browserSupport: boolean;
  browserInfo: string;
  protocol: string;
  hostname: string;
  microphoneAvailable: boolean;
  microphonePermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  networkStatus: 'online' | 'offline';
  speechRecognitionAvailable: boolean;
  errors: string[];
}

export async function runSpeechDiagnostics(): Promise<SpeechDiagnostics> {
  const diagnostics: SpeechDiagnostics = {
    browserSupport: false,
    browserInfo: navigator.userAgent,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    microphoneAvailable: false,
    microphonePermission: 'unknown',
    networkStatus: navigator.onLine ? 'online' : 'offline',
    speechRecognitionAvailable: false,
    errors: [],
  };

  // Check Speech Recognition support
  const SpeechRecognition = 
    (window as any).SpeechRecognition || 
    (window as any).webkitSpeechRecognition;
  
  diagnostics.speechRecognitionAvailable = !!SpeechRecognition;
  diagnostics.browserSupport = !!SpeechRecognition;

  if (!SpeechRecognition) {
    diagnostics.errors.push('Speech Recognition API is not supported in this browser');
    return diagnostics;
  }

  // Check microphone availability
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      diagnostics.microphoneAvailable = true;
      stream.getTracks().forEach(track => track.stop());
    } else {
      diagnostics.errors.push('getUserMedia is not supported');
    }
  } catch (error: any) {
    diagnostics.errors.push(`Microphone access failed: ${error.name} - ${error.message}`);
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      diagnostics.microphonePermission = 'denied';
    } else if (error.name === 'NotFoundError') {
      diagnostics.microphoneAvailable = false;
      diagnostics.errors.push('No microphone found');
    }
  }

  // Check microphone permission
  if ('permissions' in navigator) {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      diagnostics.microphonePermission = result.state as any;
    } catch (error) {
      // Permissions API might not support 'microphone' in all browsers
      console.log('Permissions API check failed:', error);
    }
  }

  // Test Speech Recognition initialization
  try {
    const recognition = new SpeechRecognition();
    console.log('Speech Recognition object created successfully');
    console.log('Recognition properties:', {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang,
      serviceURI: (recognition as any).serviceURI || 'default',
    });
  } catch (error: any) {
    diagnostics.errors.push(`Failed to create Speech Recognition: ${error.message}`);
  }

  return diagnostics;
}

export function logDiagnostics(diagnostics: SpeechDiagnostics) {
  console.group('🔍 Speech Recognition Diagnostics');
  console.log('Browser:', diagnostics.browserInfo);
  console.log('Protocol:', diagnostics.protocol);
  console.log('Hostname:', diagnostics.hostname);
  console.log('Network:', diagnostics.networkStatus);
  console.log('Speech Recognition Available:', diagnostics.speechRecognitionAvailable);
  console.log('Microphone Available:', diagnostics.microphoneAvailable);
  console.log('Microphone Permission:', diagnostics.microphonePermission);
  
  if (diagnostics.errors.length > 0) {
    console.error('Errors:', diagnostics.errors);
  } else {
    console.log('✅ All checks passed');
  }
  console.groupEnd();
  
  return diagnostics;
}
