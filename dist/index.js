import { loadProjectTimeConfig } from "./config/loader/load-project-time-config.js";
import { loadProjectTimeConfigFromFiles } from "./config/loader/load-project-time-config-from-files.js";
import { generateActivityLabel } from "./extension/activity-label-generator.js";
import { ProjectTimeRuntime } from "./extension/runtime.js";

export { loadProjectTimeConfig, loadProjectTimeConfigFromFiles };
export default function projectTimeExtension(pi, options = {}) {
  const generateActivity =
    options.generateActivity ??
    ((prompt, ctx) => generateActivityLabel(prompt, ctx, pi));
  const runtime = new ProjectTimeRuntime(pi, { ...options, generateActivity });
  runtime.register();
}
