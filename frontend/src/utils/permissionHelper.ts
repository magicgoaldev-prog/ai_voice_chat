// Helper functions for microphone permission handling

export function isLocalhost(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' ||
         hostname === '127.0.0.1' ||
         hostname === '[::1]' ||
         hostname.startsWith('192.168.') ||
         hostname.startsWith('10.') ||
         hostname.startsWith('172.16.') ||
         hostname.startsWith('172.17.') ||
         hostname.startsWith('172.18.') ||
         hostname.startsWith('172.19.') ||
         hostname.startsWith('172.20.') ||
         hostname.startsWith('172.21.') ||
         hostname.startsWith('172.22.') ||
         hostname.startsWith('172.23.') ||
         hostname.startsWith('172.24.') ||
         hostname.startsWith('172.25.') ||
         hostname.startsWith('172.26.') ||
         hostname.startsWith('172.27.') ||
         hostname.startsWith('172.28.') ||
         hostname.startsWith('172.29.') ||
         hostname.startsWith('172.30.') ||
         hostname.startsWith('172.31.');
}

export function isHTTPS(): boolean {
  return window.location.protocol === 'https:' || isLocalhost();
}

export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function requiresHTTPS(): boolean {
  // 모바일 브라우저는 HTTPS 필수 (localhost 제외)
  // 데스크톱은 localhost에서 HTTP 허용
  return isMobile() && !isLocalhost() && window.location.protocol !== 'https:';
}

export async function checkMicrophonePermission(): Promise<{
  granted: boolean;
  error?: string;
}> {
  try {
    // Check if permissions API is available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return {
          granted: result.state === 'granted',
          error: result.state === 'denied' 
            ? 'Microphone permission is denied. Please enable it in browser settings.'
            : result.state === 'prompt'
            ? 'Microphone permission is not set. Please allow when prompted.'
            : undefined
        };
      } catch (error) {
        // Permissions API might not support 'microphone' in all browsers
        console.log('Permissions API not fully supported, trying getUserMedia...');
      }
    }

    // Fallback: Try to access microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately
      return { granted: true };
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return {
          granted: false,
          error: 'Microphone permission denied. Please allow microphone access in your browser settings.'
        };
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return {
          granted: false,
          error: 'No microphone found. Please connect a microphone and try again.'
        };
      }
      return {
        granted: false,
        error: `Failed to access microphone: ${error.message}`
      };
    }
  } catch (error: any) {
    return {
      granted: false,
      error: `Permission check failed: ${error.message}`
    };
  }
}

export function getMicrophonePermissionInstructions(): string {
  const isMobileDevice = isMobile();
  const needsHTTPS = requiresHTTPS();
  
  let instructions = '';
  
  if (needsHTTPS) {
    instructions += '⚠️ IMPORTANT: Mobile browsers require HTTPS (except localhost).\n\n';
    instructions += 'Please access this app via HTTPS (https://) instead of HTTP.\n\n';
    instructions += 'For development:\n';
    instructions += '- ngrok: ngrok http 3000\n';
    instructions += '- localtunnel: npx localtunnel --port 3000\n\n';
  }
  
  instructions += 'To enable microphone access:\n\n';
  
  if (isMobileDevice) {
    instructions += '📱 Mobile Browser:\n';
    instructions += '1. Tap the lock/security icon in the address bar\n';
    instructions += '2. Select "Site settings" or "Permissions"\n';
    instructions += '3. Enable "Microphone" permission\n';
    instructions += '4. Refresh the page\n\n';
    
    instructions += 'Or:\n';
    instructions += '1. Go to browser Settings\n';
    instructions += '2. Find "Site settings" or "Permissions"\n';
    instructions += '3. Find this website and enable Microphone\n';
  } else {
    instructions += '🖥️ Desktop Browser:\n';
    instructions += '1. Click the lock icon in the address bar\n';
    instructions += '2. Click "Site settings"\n';
    instructions += '3. Change Microphone to "Allow"\n';
    instructions += '4. Refresh the page\n';
  }
  
  return instructions;
}
