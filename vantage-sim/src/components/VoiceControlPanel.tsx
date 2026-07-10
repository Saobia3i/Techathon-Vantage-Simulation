"use client";

import { useVoiceCommand } from "../hooks/useVoiceCommand";

export default function VoiceControlPanel() {
  const { isListening, transcript, lastAction, startListening } =
    useVoiceCommand();

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="font-bold text-gray-800 mb-3">Voice Control 🎤</h3>

      <button
        onClick={startListening}
        disabled={isListening}
        className={`px-4 py-2 rounded-md font-medium text-white transition-colors w-full mb-4 ${
          isListening
            ? "bg-red-500 animate-pulse"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {isListening ? "Listening..." : "Click to Speak"}
      </button>

      <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 space-y-2">
        <p>
          <strong className="text-gray-900">You said:</strong>{" "}
          {transcript || "..."}
        </p>
        <p>
          <strong className="text-gray-900">Action:</strong> {lastAction}
        </p>
      </div>

      <p className="text-xs text-gray-500 mt-3 italic">
        Try saying: "move up", "move left", "move forward"
      </p>
    </div>
  );
}
