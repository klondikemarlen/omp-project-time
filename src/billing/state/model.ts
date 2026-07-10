export type DeveloperCostState = {
  totalCost: string
  promptCount: number
  activeMilliseconds: number
  activeStartAtMs?: number
  activeUntilMs?: number
  lastSettledAtMs?: number
  lastPromptAtMs?: number
}
