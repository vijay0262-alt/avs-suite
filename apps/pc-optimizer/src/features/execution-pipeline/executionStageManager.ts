/**
 * Execution Stage Manager — manages pipeline stages.
 *
 * Future execution stages register through this manager.
 * No switch statements. Provider architecture only.
 */
import type {
  PipelineStage,
  StageHandler,
  StageContext,
  StageResult,
  ExecutionConfiguration,
} from './types';

export class ExecutionStageManager {
  private _handlers: Map<PipelineStage, StageHandler> = new Map();
  private _config: ExecutionConfiguration;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  registerHandler(handler: StageHandler): boolean {
    if (this._handlers.has(handler.stage)) return false;
    this._handlers.set(handler.stage, handler);
    return true;
  }

  unregisterHandler(stage: PipelineStage): boolean {
    return this._handlers.delete(stage);
  }

  getHandler(stage: PipelineStage): StageHandler | undefined {
    return this._handlers.get(stage);
  }

  hasHandler(stage: PipelineStage): boolean {
    return this._handlers.has(stage);
  }

  getRegisteredStages(): PipelineStage[] {
    return Array.from(this._handlers.keys());
  }

  async executeStage(stage: PipelineStage, context: StageContext): Promise<StageResult> {
    const handler = this._handlers.get(stage);
    if (!handler) {
      return {
        success: false,
        stage,
        data: {},
        error: `No handler registered for stage: ${stage}`,
      };
    }
    try {
      return await handler.execute(context);
    } catch (err) {
      return {
        success: false,
        stage,
        data: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  getEnabledStages(): PipelineStage[] {
    return this._config.enabledStages;
  }

  isStageEnabled(stage: PipelineStage): boolean {
    return this._config.enabledStages.includes(stage);
  }

  clear(): void {
    this._handlers.clear();
  }
}
