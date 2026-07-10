import Big from "big.js";
import { MONTHS_PER_YEAR, MS_PER_HOUR } from "./time-constants.js";
export function costForActiveMs(config, activeMs) {
    const annualSalary = Big(config.monthlySalary).times(MONTHS_PER_YEAR);
    const annualMs = Big(config.hoursPerWeek).times(config.weeksPerYear).times(MS_PER_HOUR);
    return annualSalary.times(activeMs).div(annualMs);
}
