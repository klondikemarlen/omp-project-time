import { MS_PER_MINUTE } from "./time-constants.js";

export function activeWindowMs(config) {
  return config.activeWindowMinutes * MS_PER_MINUTE;
}
