import { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator";
import { generateActivity } from "./extension/activity-label-generator.js";
import projectTimeExtension from "./index.js";

export default function ompProjectTimeExtension(pi, options = {}) {
  projectTimeExtension(pi, {
    ...options,
    generateActivity: (prompt, ctx) =>
      generateActivity(prompt, ctx, pi.pi?.settings, generateSessionTitle),
  });
}
