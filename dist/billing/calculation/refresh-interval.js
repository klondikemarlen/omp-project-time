import { MS_PER_SECOND } from "./time-constants.js";

export function refreshIntervalMs(config) {
  return config.refreshIntervalSeconds * MS_PER_SECOND;
}
