'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { moveTo } from '@/lib/moveTo';
import { useRobotStore } from '@/state/robotStore';

const STEP = 0.05; // 5 cm per voice command

/** Get current EE world position from the loaded robot, or a safe default. */
function getEeWorldPos(robot: any, stylusLinkName: string): { x: number; y: number; z: number } {
  if (!robot) return { x: 0, y: 0.5, z: 0 }; // safe above-ground default
  const link = robot.links[stylusLinkName];
  if (!link) return { x: 0, y: 0.5, z: 0 };
  const v = new THREE.Vector3();
  link.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

export const useVoiceCommand = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState('None');
  const recognitionRef = useRef<any>(null);

  const processCommand = useCallback((command: string) => {
    const { robot, stylusLinkName } = useRobotStore.getState();
    // Always read live EE position so commands accumulate correctly
    const cur = getEeWorldPos(robot, stylusLinkName);
    let { x, y, z } = cur;

    // Natural language → axis delta (all in Three.js world space / Y-up)
    if      (command.includes('move up'))       y += STEP;
    else if (command.includes('move down'))     y -= STEP;
    else if (command.includes('move left'))     x -= STEP;
    else if (command.includes('move right'))    x += STEP;
    else if (command.includes('move forward'))  z -= STEP;  // forward = -Z in Three.js
    else if (command.includes('move backward')) z += STEP;
    else {
      setLastAction('Command not recognized');
      return;
    }

    const result = moveTo({ x, y, z });
    setLastAction(
      result.success
        ? `✓ Moved to (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`
        : `Failed: ${result.reason}`
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event: any) => {
      const spokenText = event.results[0][0].transcript.toLowerCase().trim();
      setTranscript(spokenText);
      processCommand(spokenText);
    };

    recognitionRef.current.onend = () => setIsListening(false);
  }, [processCommand]);

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