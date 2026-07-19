import { generateActivityLabel } from "./extension/activity-label-generator.js";
import projectTimeExtension from "./index.js";

export default function ompProjectTimeExtension(pi, options = {}) {
  projectTimeExtension(pi, {
    ...options,
    generateActivity: (prompt, ctx) => generateActivityLabel(prompt, ctx, pi),
  });
}
