export function formatSafetyReason(reason?: string) {
  switch (reason) {
    case "board_collision":
      return "Invalid: keypad collision risk";
    case "ground_collision":
      return "Invalid: ground collision risk";
    case "collision_detected":
      return "Invalid: collision risk";
    case "out_of_bounds":
      return "Invalid: outside workspace or safety boundary";
    case "unreachable":
      return "Invalid: target is too close to the base";
    case "ik_did_not_converge":
      return "Invalid: IK could not reach the target within 5 mm";
    case "robot_not_loaded":
      return "Robot is not loaded yet";
    case "key_not_loaded":
      return "Requested key target is not loaded";
    case "clarification_needed":
      return "Clarification needed";
    case "agent_rejected":
      return "Agent rejected the command";
    case "command_not_recognized":
      return "Invalid: voice command was not recognized";
    case "agentic_empty_plan":
      return "Agent returned no executable motion plan";
    case "agentic_voice_failed":
      return "Agentic voice request failed";
    case undefined:
    case "":
      return "Invalid command";
    default:
      if (reason.endsWith("_out_of_limits")) return `Invalid: ${reason.replace(/_/g, " ")}`;
      return reason.replace(/_/g, " ");
  }
}
