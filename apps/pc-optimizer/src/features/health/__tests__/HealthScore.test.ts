// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthScoreService } from '../HealthScoreService';
import { optimizationEventBus } from '../OptimizationEventBus';
import type { HealthContribution, HealthContributionProvider, ModuleId } from '../HealthContribution';

function makeProvider(moduleId: ModuleId, moduleName: string, penalty: number, maxPenalty = 100): HealthContributionProvider {
  return {
    async getContribution(): Promise<HealthContribution> {
      return {
        moduleId,
        moduleName,
        currentPenalty: penalty,
        maxPenalty,
        resolvedPenalty: 0,
        detail: `${moduleName} detail`,
        canAutoFix: true,
        actionPath: `/${moduleId}`,
      };
    },
  };
}

describe('HealthScoreService', () => {
  let service: HealthScoreService;

  beforeEach(() => {
    service = new HealthScoreService();
  });

  it('returns 100 when no providers are registered', async () => {
    const result = await service.computeHealth();
    expect(result.overallScore).toBe(100);
    expect(result.contributions).toEqual([]);
    expect(result.totalPenalty).toBe(0);
  });

  it('subtracts penalties from 100', async () => {
    service.registerProvider('junk', makeProvider('junk', 'Junk Cleaner', 15));
    service.registerProvider('registry', makeProvider('registry', 'Registry Cleaner', 10));
    const result = await service.computeHealth();
    expect(result.overallScore).toBe(75);
    expect(result.totalPenalty).toBe(25);
    expect(result.contributions).toHaveLength(2);
  });

  it('clamps overall score to minimum 0', async () => {
    service.registerProvider('junk', makeProvider('junk', 'Junk Cleaner', 60));
    service.registerProvider('registry', makeProvider('registry', 'Registry Cleaner', 50));
    const result = await service.computeHealth();
    expect(result.overallScore).toBe(0);
  });

  it('clamps overall score to maximum 100', async () => {
    service.registerProvider('junk', makeProvider('junk', 'Junk Cleaner', 0));
    const result = await service.computeHealth();
    expect(result.overallScore).toBe(100);
  });

  it('handles provider errors gracefully', async () => {
    service.registerProvider('junk', {
      async getContribution(): Promise<HealthContribution> {
        throw new Error('provider failed');
      },
    });
    service.registerProvider('registry', makeProvider('registry', 'Registry Cleaner', 10));
    const result = await service.computeHealth();
    expect(result.contributions).toHaveLength(1);
    expect(result.overallScore).toBe(90);
  });

  it('unregisters providers', async () => {
    service.registerProvider('junk', makeProvider('junk', 'Junk Cleaner', 20));
    service.unregisterProvider('junk');
    const result = await service.computeHealth();
    expect(result.overallScore).toBe(100);
    expect(result.contributions).toEqual([]);
  });

  it('caches contributions after compute', async () => {
    service.registerProvider('junk', makeProvider('junk', 'Junk Cleaner', 15));
    await service.computeHealth();
    expect(service.getCachedContributions()).toHaveLength(1);
    expect(service.getLastComputeTimestamp()).toBeGreaterThan(0);
  });
});

describe('OptimizationEventBus', () => {
  beforeEach(() => {
    optimizationEventBus.clear();
  });

  it('delivers events to subscribers', () => {
    const listener = vi.fn();
    optimizationEventBus.subscribe(listener);
    optimizationEventBus.emit({
      moduleId: 'junk',
      action: 'clean',
      bytesRecovered: 1024,
      itemsProcessed: 5,
      timestamp: Date.now(),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'junk',
      action: 'clean',
    }));
  });

  it('does not deliver to unsubscribed listeners', () => {
    const listener = vi.fn();
    const unsub = optimizationEventBus.subscribe(listener);
    unsub();
    optimizationEventBus.emit({
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('swallows listener errors', () => {
    const goodListener = vi.fn();
    optimizationEventBus.subscribe(() => { throw new Error('boom'); });
    optimizationEventBus.subscribe(goodListener);
    optimizationEventBus.emit({
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('delivers to multiple subscribers', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    optimizationEventBus.subscribe(l1);
    optimizationEventBus.subscribe(l2);
    optimizationEventBus.emit({
      moduleId: 'privacy',
      action: 'clean',
      timestamp: Date.now(),
    });
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });
});
