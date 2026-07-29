/**
 * Base Action — abstract base class for action implementations.
 *
 * Provides common behavior for all actions.
 * Every future action can extend BaseAction.
 */
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionResult,
  ActionState,
  ActionExplanation,
} from './types';

export abstract class BaseAction {
  readonly definition: DashboardActionDefinition;
  protected _state: ActionState = 'available';
  protected _createdAt: string;
  protected _lastStateChange: string;
  protected _error: string | null = null;

  constructor(definition: DashboardActionDefinition) {
    this.definition = definition;
    this._createdAt = new Date().toISOString();
    this._lastStateChange = this._createdAt;
  }

  get id(): string {
    return this.definition.id;
  }

  get state(): ActionState {
    return this._state;
  }

  get error(): string | null {
    return this._error;
  }

  get isAvailable(): boolean {
    return this._state === 'available';
  }

  get isExecuting(): boolean {
    return this._state === 'executing';
  }

  get isCompleted(): boolean {
    return this._state === 'completed';
  }

  get isFailed(): boolean {
    return this._state === 'failed';
  }

  protected setState(state: ActionState, error?: string): void {
    this._state = state;
    this._lastStateChange = new Date().toISOString();
    if (error !== undefined) this._error = error;
  }

  getExplanation(): ActionExplanation | undefined {
    return this.definition.explanation;
  }

  abstract execute(context: ActionContext): Promise<ActionResult>;

  cancel(): void {
    if (this._state === 'executing' || this._state === 'pending') {
      this.setState('cancelled');
    }
  }

  reset(): void {
    this._state = 'available';
    this._error = null;
    this._lastStateChange = new Date().toISOString();
  }
}
