'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { moveTo } from '@/lib/moveTo';

const INITIAL_POS = { x: 0.12, y: 0.04, z: 0.30 };

export const useVoiceCommand = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState('None');
  const currentPos = useRef(INITIAL_POS);
  const recognitionRef = useRef<any>(null);

  // ১. processCommand ফাংশনটিকে উপরে নিয়ে আসা হয়েছে
  const processCommand = useCallback((command: string) => {
    let { x, y, z } = currentPos.current;
    const step = 0.05;

    if (command.includes('move up')) z += step;
    else if (command.includes('move down')) z -= step;
    else if (command.includes('move left')) x -= step;
    else if (command.includes('move right')) x += step;
    else if (command.includes('move forward')) y += step;
    else if (command.includes('move backward')) y -= step;
    else {
      setLastAction('Command not recognized');
      return;
    }

    currentPos.current = { x, y, z };
    const result = moveTo(currentPos.current);
    
    setLastAction(result.success ? `Moved successfully to X:${x.toFixed(2)}, Y:${y.toFixed(2)}, Z:${z.toFixed(2)}` : 'Move failed (Safety block)');
  }, []);

  // ২. useEffect এখন processCommand কে ঠিকমতো চিনতে পারবে
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const spokenText = event.results[0][0].transcript.toLowerCase().trim();
          setTranscript(spokenText);
          processCommand(spokenText); // এখন আর কোনো এরর দেখাবে না!
        };

        recognitionRef.current.onend = () => setIsListening(false);
      }
    }
  }, [processCommand]); // Dependency array-তে processCommand যোগ করা হয়েছে

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
      setIsListening(true);
      setTranscript('');
      setLastAction('Processing...');
    }
  };

  return { isListening, transcript, lastAction, startListening };
};