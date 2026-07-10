import { DEFAULT_ACTIVE_WINDOW_MINUTES, DEFAULT_HOURS_PER_WEEK, DEFAULT_LABEL, DEFAULT_MONTHLY_SALARY, DEFAULT_REFRESH_INTERVAL_SECONDS, DEFAULT_WEEKS_PER_YEAR, } from "./defaults.js";
import { parseNonEmptyString } from "../../utils/parse-non-empty-string.js";
import { parsePositiveNumber } from "../../utils/parse-positive-number.js";
export function parseDeveloperCostConfig(options) {
    const rawMonthlySalary = options?.monthlySalary ?? DEFAULT_MONTHLY_SALARY;
    const rawHoursPerWeek = options?.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
    const rawWeeksPerYear = options?.weeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
    const rawActiveWindowMinutes = options?.activeWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
    const rawRefreshIntervalSeconds = options?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
    const rawLabel = options?.label ?? DEFAULT_LABEL;
    const parsedMonthlySalary = parsePositiveNumber(rawMonthlySalary);
    const monthlySalary = parsedMonthlySalary ?? DEFAULT_MONTHLY_SALARY;
    const parsedHoursPerWeek = parsePositiveNumber(rawHoursPerWeek);
    const hoursPerWeek = parsedHoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
    const parsedWeeksPerYear = parsePositiveNumber(rawWeeksPerYear);
    const weeksPerYear = parsedWeeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
    const parsedActiveWindowMinutes = parsePositiveNumber(rawActiveWindowMinutes);
    const activeWindowMinutes = parsedActiveWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
    const parsedRefreshIntervalSeconds = parsePositiveNumber(rawRefreshIntervalSeconds);
    const refreshIntervalSeconds = parsedRefreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
    const parsedLabel = parseNonEmptyString(rawLabel);
    const label = parsedLabel?.toLowerCase() ?? DEFAULT_LABEL;
    return {
        monthlySalary,
        hoursPerWeek,
        weeksPerYear,
        activeWindowMinutes,
        refreshIntervalSeconds,
        label,
    };
}
