"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { chooseBestVoiceTranscript, describeVoiceCorrection, getSpeechAlternatives, normalizeVoiceText } from "@/lib/voiceGrammar";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";
import { useRobotStore } from "@/state/robotStore";

const STEP = 0.05;

function getEeWorldPos(): { x: number; y: number; z: number } | null {
  const { robot, stylusLinkName } = useRobotStore.getState();
  const v = getStylusTipWorldPosition(robot, stylusLinkName);
  if (!v) return null;
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

type VoiceStatusCallback = (msg: string, success: boolean, reason?: string) => void;

export const useVoiceCommand = (onStatusChange?: VoiceStatusCallback) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastAction, setLastAction] = useState("None");
  const recognitionRef = useRef<any>(null);
  const unsupportedReportedRef = useRef(false);

  const processCommand = useCallback((command: string) => {
    const spoken = normalizeVoiceText(command);
    const { keyPositions } = useRobotStore.getState();
    const cur = getEeWorldPos();
    if (!cur) {
      setLastAction("Robot not loaded");
      onStatusChange?.("Robot not loaded", false, "robot_not_loaded");
      return;
    }

    const keyMatch = spoken.match(/(?:move\s+to\s+|press\s+|touch\s+)?key\s*([0-9])/);
    if (keyMatch) {
      const target = keyPositions[keyMatch[1]];
      if (!target) {
        setLastAction(`Key ${keyMatch[1]} is not loaded`);
        onStatusChange?.(`Key ${keyMatch[1]} is not loaded`, false, "key_not_loaded");
        return;
      }
      const result = moveTo(target);
      const message = result.success ? `Reached key ${keyMatch[1]}` : formatSafetyReason(result.reason);
      setLastAction(message);
      onStatusChange?.(message, result.success, result.reason);
      return;
    }

    const rotateMatch = spoken.match(/rotate\s+(?:base\s+)?(-?\d+(?:\.\d+)?)\s*(?:degree|degrees)?/);
    if (rotateMatch) {
      const degrees = Number(rotateMatch[1]);
      if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) {
        setLastAction("Rotation blocked: use -90 to 90 degrees");
        onStatusChange?.("Rotation blocked: use -90 to 90 degrees", false, "out_of_bounds");
        return;
      }
      const target = rotateAroundWorldY(cur, degrees);
      const result = moveTo(target);
      const message = result.success ? `Rotated base path ${degrees} degrees` : formatSafetyReason(result.reason);
      setLastAction(message);
      onStatusChange?.(message, result.success, result.reason);
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
      onStatusChange?.("Command not recognized", false, "command_not_recognized");
      return;
    }

    const result = moveTo(target);
    const message = result.success
      ? `Moved to (${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`
      : formatSafetyReason(result.reason);
    setLastAction(message);
    onStatusChange?.(message, result.success, result.reason);
  }, [onStatusChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg = "Speech recognition is not supported in this browser. Try Chrome or Edge.";
      setLastAction(msg);
      if (!unsupportedReportedRef.current) {
        unsupportedReportedRef.current = true;
        onStatusChange?.(msg, false, "speech_recognition_unsupported");
      }
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.maxAlternatives = 5;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event: any) => {
      const alternatives = getSpeechAlternatives(event);
      const spokenText = chooseBestVoiceTranscript(alternatives);
      const rawText = alternatives[0]?.transcript ?? spokenText;
      setTranscript(describeVoiceCorrection(rawText, spokenText));
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
      const msg = "Speech recognition is not supported in this browser. Try Chrome or Edge.";
      setLastAction(msg);
      if (!unsupportedReportedRef.current) {
        unsupportedReportedRef.current = true;
        onStatusChange?.(msg, false, "speech_recognition_unsupported");
      }
    }
  };

  return { isListening, transcript, lastAction, startListening, processCommand };
};
