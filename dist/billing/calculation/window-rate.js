import { activeWindowMs } from "./active-window.js";
import { costForActiveMs } from "./cost-for-active-time.js";

export function windowRate(config) {
  return costForActiveMs(config, activeWindowMs(config));
}
