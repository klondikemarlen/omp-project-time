import { generateActivity } from "./extension/activity-label-generator.js";
import projectTimeExtension from "./index.js";

export default function ompProjectTimeExtension(pi, options = {}) {
  projectTimeExtension(pi, {
    ...options,
    generateActivity:
      options.generateActivity ??
      ((prompt, ctx) => generateActivity(prompt, ctx)),
  });
}
