"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { moveTo } from "@/lib/moveTo";
import { useRobotStore } from "@/state/robotStore";

const STEP = 0.05;

function getEeWorldPos(): { x: number; y: number; z: number } | null {
  const { robot, stylusLinkName } = useRobotStore.getState();
  if (!robot) return null;
  const link = robot.links[stylusLinkName];
  if (!link) return null;
  const v = new THREE.Vector3();
  link.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

function rotateAroundWorldY(pos: { x: number; y: number; z: number }, degrees: number) {
  const rad = THREE.MathUtils.degToRad(degrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pos.x * cos - pos.z * sin,
    y: pos.y,
    z: pos.x * sin + pos.z * cos,
  };
}

export const useVoiceCommand = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastAction, setLastAction] = useState("None");
  const recognitionRef = useRef<any>(null);

  const processCommand = useCallback((command: string) => {
    const spoken = command.toLowerCase().trim();
    const { keyPositions } = useRobotStore.getState();
    const cur = getEeWorldPos();
    if (!cur) {
      setLastAction("Robot not loaded");
      return;
    }

    const keyMatch = spoken.match(/(?:move\s+to\s+|press\s+|touch\s+)?key\s*([1-6])/);
    if (keyMatch) {
      const target = keyPositions[keyMatch[1]];
      if (!target) {
        setLastAction(`Key ${keyMatch[1]} is not loaded`);
        return;
      }
      const result = moveTo(target);
      setLastAction(result.success ? `Reached key ${keyMatch[1]}` : `Failed: ${result.reason}`);
      return;
    }

    const rotateMatch = spoken.match(/rotate\s+(?:base\s+)?(-?\d+(?:\.\d+)?)\s*(?:degree|degrees)?/);
    if (rotateMatch) {
      const degrees = Number(rotateMatch[1]);
      if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) {
        setLastAction("Rotation blocked: use -90 to 90 degrees");
        return;
      }
      const target = rotateAroundWorldY(cur, degrees);
      const result = moveTo(target);
      setLastAction(result.success ? `Rotated base path ${degrees} degrees` : `Failed: ${result.reason}`);
      return;
    }

    let target = { ...cur };
    if (spoken.includes("move up")) target.y += STEP;
    else if (spoken.includes("move down")) target.y -= STEP;
    else if (spoken.includes("move left")) target.x -= STEP;
    else if (spoken.includes("move right")) target.x += STEP;
    else if (spoken.includes("move forward")) target.z -= STEP;
    else if (spoken.includes("move backward") || spoken.includes("move back")) target.z += STEP;
    else {
      setLastAction("Command not recognized");
      return;
    }

    const result = moveTo(target);
    setLastAction(
      result.success
        ? `Moved to (${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`
        : `Failed: ${result.reason}`,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event: any) => {
      const spokenText = event.results[0][0].transcript.toLowerCase().trim();
      setTranscript(spokenText);
      processCommand(spokenText);
    };

    recognitionRef.current.onerror = () => {
      setLastAction("Speech recognition failed");
      setIsListening(false);
    };

    recognitionRef.current.onend = () => setIsListening(false);
  }, [processCommand]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
      setIsListening(true);
      setTranscript("");
      setLastAction("Processing...");
      return;
    }

    if (!recognitionRef.current) {
      setLastAction("Speech recognition is not supported in this browser");
    }
  };

  return { isListening, transcript, lastAction, startListening, processCommand };
};
