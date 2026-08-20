import { generateActivity } from "./extension/activity-label-generator.js";
import { projectTimeExtension } from "./index.js";

export function ompProjectTimeExtension(pi, options = {}) {
  projectTimeExtension(pi, {
    ...options,
    generateActivity:
      options.generateActivity ??
      ((prompt, ctx, activityContext) =>
        generateActivity(prompt, ctx, activityContext)),
  });
}

export default ompProjectTimeExtension;
