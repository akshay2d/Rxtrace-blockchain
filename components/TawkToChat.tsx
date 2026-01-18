'use client';

import { useEffect } from 'react';

// Tawk.to Chat Widget Component
// Property ID: 696cc3781241ae197e98d6a5
// Widget ID: 1jf8dn48d
//
// This component loads Tawk.to chat widget client-side only.
// It prevents SSR issues and duplicate script loading.
export default function TawkToChat() {
  useEffect(() => {
    // Tawk.to Property ID and Widget ID
    // Can be configured via environment variables or use defaults below
    const TAWK_TO_PROPERTY_ID = process.env.NEXT_PUBLIC_TAWK_TO_PROPERTY_ID || '696cc3781241ae197e98d6a5';
    const TAWK_TO_WIDGET_ID = process.env.NEXT_PUBLIC_TAWK_TO_WIDGET_ID || '1jf8dn48d';

    // Check if Tawk.to script is already loaded to prevent duplicates
    if (window.Tawk_API) {
      return;
    }

    // Check if script element already exists
    const existingScript = document.getElementById('tawk-to-script');
    if (existingScript) {
      return;
    }

    // Load Tawk.to script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://embed.tawk.to/${TAWK_TO_PROPERTY_ID}/${TAWK_TO_WIDGET_ID}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    script.id = 'tawk-to-script';

    // Insert script before first script tag or append to body
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.body.appendChild(script);
    }

    return () => {
      // Cleanup: Remove script on unmount
      const scriptToRemove = document.getElementById('tawk-to-script');
      if (scriptToRemove && scriptToRemove.parentNode) {
        scriptToRemove.parentNode.removeChild(scriptToRemove);
      }
      // Reset Tawk.to API
      if (window.Tawk_API) {
        delete window.Tawk_API;
      }
    };
  }, []);

  return null;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    Tawk_API?: any;
  }
}
