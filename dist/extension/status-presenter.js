import { displayedDeveloperCost, formatDeveloperCost, } from "../billing/index.js";
export const STATUS_KEY = "developer-cost-status";
export function updateStatus(ctx, state, config) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", statusText(state, config)));
}
export function clearStatus(ctx) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
}
export function statusText(state, config) {
    const text = formatDeveloperCost(displayedDeveloperCost(state));
    return `${text} (${config.label})`;
}
export function summaryText(state, config, sessionId, nowMs) {
    const lastPromptAtMs = state.lastPromptAtMs;
    let lastPrompt = "Last prompt: unavailable";
    if (lastPromptAtMs !== undefined) {
        const lastPromptAt = new Date(lastPromptAtMs);
        if (!Number.isNaN(lastPromptAt.getTime())) {
            lastPrompt = `Last prompt: ${durationText(nowMs - lastPromptAtMs)} ago (${lastPromptAt.toISOString()})`;
        }
    }
    return [
        "Developer cost summary",
        `Session: ${sessionId}`,
        `Cost: ${statusText(state, config)}`,
        `Active time: ${durationText(state.activeMilliseconds)}`,
        `Prompt count: ${state.promptCount}`,
        lastPrompt,
    ].join("\n");
}
function durationText(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
        return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0)
        return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}
