/**
 * Public barrel export for the maintenance execution engine feature.
 */

// Types
export type {
  MaintenanceTask,
  MaintenanceJob,
  ExecutionResult,
  TaskResult,
  ValidationResult,
  TaskStatus,
  ExecutionStatus,
  JobSource,
  ExecutionEventType,
  ExecutionEventPayloads,
  ExecutionEventListener,
  PauseConditionChecker,
  PauseConditionResult,
  EngineState,
  EngineSnapshot,
  PersistedExecutionState,
  ScheduleDueInfo,
} from './types';

// Execution events
export { executionEvents } from './executionEvents';

// Pause conditions
export {
  registerPauseCondition,
  unregisterAllPauseConditions,
  evaluatePauseConditions,
  getRegisteredPauseConditions,
  GamingModePauseCondition,
  BatterySaverPauseCondition,
  FullScreenPauseCondition,
  CpuBusyPauseCondition,
  UserActivePauseCondition,
} from './pauseConditions';

// Job builder
export { jobBuilder, scheduleHasValidTasks } from './jobBuilder';

// Execution engine
export { executionEngine } from './executionEngine';

// Execution store
export {
  useExecutionStore,
  useExecutionState,
  useIsExecuting,
  useLastExecutionResult,
  useExecutionHistory,
} from './executionStore';
export type { ExecutionStoreState } from './executionStore';

// Tasks
export {
  TASK_IDS,
  registerTask,
  createTask,
  getRegisteredTaskIds,
  isTaskRegistered,
} from './tasks';
export {
  JunkCleanerTask,
  BrowserCleanerTask,
  RecycleBinCleanerTask,
  TempFilesCleanerTask,
  BaseMaintenanceTask,
  isRpcAvailable,
  getRpcBridge,
} from './tasks';
