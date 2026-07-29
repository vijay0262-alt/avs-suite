/**
 * Device Profile Engine — core profile generation.
 *
 * Uses the ProfileBuilder to generate device profiles from context,
 * knowledge, and predictions. Reuses existing AI modules.
 *
 * It does NOT execute optimizations.
 * It does NOT change recommendation logic.
 * It ONLY creates intelligent device profiles.
 */
import type {
  AIContext,
  KnowledgeObject,
  PredictionList,
  DeviceProfile,
  ProfileConfiguration,
} from './types';
import { ProfileBuilder } from './profileBuilder';
import { ProfileHistory } from './profileHistory';
import { ProfileRegistry } from './profileRegistry';
import { ProfileEventEmitter } from './profileEvents';

export class DeviceProfileEngine {
  private _builder: ProfileBuilder;
  private _history: ProfileHistory;
  private _registry: ProfileRegistry;
  private _events: ProfileEventEmitter;
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
    this._history = new ProfileHistory(config);
    this._registry = new ProfileRegistry();
    this._events = new ProfileEventEmitter();
    this._builder = new ProfileBuilder(config, this._history, this._registry, this._events);
  }

  generateProfile(
    context: AIContext,
    knowledge: KnowledgeObject,
    predictions: PredictionList | null,
  ): DeviceProfile | null {
    return this._builder.build(context, knowledge, predictions);
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
    this._builder.updateConfig(config);
  }

  get config(): ProfileConfiguration {
    return this._config;
  }

  get history(): ProfileHistory {
    return this._history;
  }

  get registry(): ProfileRegistry {
    return this._registry;
  }

  get events(): ProfileEventEmitter {
    return this._events;
  }
}
