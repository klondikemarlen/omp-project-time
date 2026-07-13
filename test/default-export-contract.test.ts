import assert from "node:assert/strict"
import test from "node:test"
import defaultCostForActiveMs, {
  costForActiveMs,
} from "../src/billing/calculation/cost-for-active-time.js"
import defaultParseDeveloperCostConfig, {
  parseDeveloperCostConfig,
} from "../src/billing/config/parser.js"
import defaultRecordDeveloperPrompt, {
  recordDeveloperPrompt,
} from "../src/billing/operations/record-prompt.js"
import defaultSettleSpreadDeveloperCostStates, {
  settleSpreadDeveloperCostStates,
} from "../src/billing/operations/settle-shared-state.js"
import defaultSettleDeveloperCostState, {
  settleDeveloperCostState,
} from "../src/billing/operations/settle-state.js"
import defaultFormatDeveloperCost, {
  formatDeveloperCost,
} from "../src/billing/presentation/format-cost.js"
import defaultEmptyDeveloperCostState, {
  emptyDeveloperCostState,
} from "../src/billing/state/empty.js"
import defaultParseDeveloperCostState, {
  parseDeveloperCostState,
} from "../src/billing/state/parser.js"
import defaultLoadDeveloperCostConfigFromFiles, {
  loadDeveloperCostConfigFromFiles,
} from "../src/config/loader/load-developer-cost-config-from-files.js"
import defaultLoadDeveloperCostConfig, {
  loadDeveloperCostConfig,
} from "../src/config/loader/load-developer-cost-config.js"
import defaultReadDeveloperCostConfigFile, {
  readDeveloperCostConfigFile,
} from "../src/config/loader/read-developer-cost-config-file.js"
import defaultIsTopLevelSession, {
  isTopLevelSession,
} from "../src/extension/session-classification.js"
import defaultLoadPersistedDeveloperCostState, {
  loadPersistedDeveloperCostState,
} from "../src/extension/session-state.js"
import defaultCreateAutomaticTimeLogEntry, {
  createAutomaticTimeLogEntry,
} from "../src/time-log/domain/create-automatic-entry.js"
import defaultParseTimeLogEntry, {
  parseTimeLogEntry,
} from "../src/time-log/domain/parse-entry.js"
import defaultRepositoryIdentityFromRemoteUrl, {
  repositoryIdentityFromRemoteUrl,
} from "../src/time-log/domain/repository-identity.js"
import defaultSanitizedProjectLabel, {
  sanitizedProjectLabel,
} from "../src/time-log/domain/sanitized-project-label.js"
import defaultResolveGitRepository, {
  resolveGitRepository,
} from "../src/time-log/infrastructure/git-repository.js"
import defaultErrorMessage, { errorMessage } from "../src/utils/error-message.js"
import defaultIsEnoent, { isEnoent } from "../src/utils/is-enoent.js"
import defaultIsFiniteNumber, {
  isFiniteNumber,
} from "../src/utils/is-finite-number.js"
import defaultParseDecimalString, {
  parseDecimalString,
} from "../src/utils/parse-decimal-string.js"
import defaultParseNonEmptyString, {
  parseNonEmptyString,
} from "../src/utils/parse-non-empty-string.js"
import defaultParseOptionalNumber, {
  parseOptionalNumber,
} from "../src/utils/parse-optional-number.js"
import defaultParsePositiveNumber, {
  parsePositiveNumber,
} from "../src/utils/parse-positive-number.js"

const exportPairs = [
  [defaultCostForActiveMs, costForActiveMs],
  [defaultParseDeveloperCostConfig, parseDeveloperCostConfig],
  [defaultRecordDeveloperPrompt, recordDeveloperPrompt],
  [defaultSettleSpreadDeveloperCostStates, settleSpreadDeveloperCostStates],
  [defaultSettleDeveloperCostState, settleDeveloperCostState],
  [defaultFormatDeveloperCost, formatDeveloperCost],
  [defaultEmptyDeveloperCostState, emptyDeveloperCostState],
  [defaultParseDeveloperCostState, parseDeveloperCostState],
  [defaultLoadDeveloperCostConfigFromFiles, loadDeveloperCostConfigFromFiles],
  [defaultLoadDeveloperCostConfig, loadDeveloperCostConfig],
  [defaultReadDeveloperCostConfigFile, readDeveloperCostConfigFile],
  [defaultIsTopLevelSession, isTopLevelSession],
  [defaultLoadPersistedDeveloperCostState, loadPersistedDeveloperCostState],
  [defaultCreateAutomaticTimeLogEntry, createAutomaticTimeLogEntry],
  [defaultParseTimeLogEntry, parseTimeLogEntry],
  [defaultRepositoryIdentityFromRemoteUrl, repositoryIdentityFromRemoteUrl],
  [defaultSanitizedProjectLabel, sanitizedProjectLabel],
  [defaultResolveGitRepository, resolveGitRepository],
  [defaultErrorMessage, errorMessage],
  [defaultIsEnoent, isEnoent],
  [defaultIsFiniteNumber, isFiniteNumber],
  [defaultParseDecimalString, parseDecimalString],
  [defaultParseNonEmptyString, parseNonEmptyString],
  [defaultParseOptionalNumber, parseOptionalNumber],
  [defaultParsePositiveNumber, parsePositiveNumber],
]

test("exports each standalone operation by matching named and default bindings", () => {
  for (const [defaultExport, namedExport] of exportPairs) {
    assert.equal(defaultExport, namedExport)
  }
})
