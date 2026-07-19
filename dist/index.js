import { loadProjectTimeConfig } from "./config/loader/load-project-time-config.js";
import { loadProjectTimeConfigFromFiles } from "./config/loader/load-project-time-config-from-files.js";
import { ProjectTimeRuntime } from "./extension/runtime.js";

export { loadProjectTimeConfig, loadProjectTimeConfigFromFiles };
export default function projectTimeExtension(pi, options = {}) {
  const runtime = new ProjectTimeRuntime(pi, options);
  runtime.register();
}
