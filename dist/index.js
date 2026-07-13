import { loadDeveloperCostConfigFromFiles } from "./config/loader/load-developer-cost-config-from-files.js";
import { DeveloperCostStatusRuntime } from "./extension/runtime.js";

export { loadDeveloperCostConfigFromFiles };
export default function developerCostStatusExtension(pi, options = {}) {
  const runtime = new DeveloperCostStatusRuntime(pi, options);
  runtime.register();
}
