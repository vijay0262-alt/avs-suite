/**
 * Performance measurement utilities
 */

export interface PerformanceMetrics {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private marks: Map<string, number> = new Map();

  startMark(name: string): void {
    this.marks.set(name, performance.now());
  }

  endMark(name: string, metadata?: Record<string, unknown>): number {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`Performance mark "${name}" not found`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.marks.delete(name);

    const metric: PerformanceMetrics = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`, metadata || '');

    return duration;
  }

  measure<T>(name: string, fn: () => Promise<T> | T, metadata?: Record<string, unknown>): Promise<T> {
    this.startMark(name);
    const result = fn();
    
    if (result instanceof Promise) {
      return result.finally(() => {
        this.endMark(name, metadata);
      });
    } else {
      this.endMark(name, metadata);
      return Promise.resolve(result);
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getMetricsByName(name: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.name === name);
  }

  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;
    
    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  clear(): void {
    this.metrics = [];
    this.marks.clear();
  }

  generateReport(): string {
    const report: string[] = [];
    report.push('=== Performance Report ===');
    report.push(`Total measurements: ${this.metrics.length}`);
    report.push('');

    // Group by name
    const grouped = new Map<string, PerformanceMetrics[]>();
    for (const metric of this.metrics) {
      if (!grouped.has(metric.name)) {
        grouped.set(metric.name, []);
      }
      grouped.get(metric.name)!.push(metric);
    }

    for (const [name, metrics] of grouped) {
      const avg = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const min = Math.min(...metrics.map(m => m.duration));
      const max = Math.max(...metrics.map(m => m.duration));
      
      report.push(`${name}:`);
      report.push(`  Count: ${metrics.length}`);
      report.push(`  Average: ${avg.toFixed(2)}ms`);
      report.push(`  Min: ${min.toFixed(2)}ms`);
      report.push(`  Max: ${max.toFixed(2)}ms`);
      report.push('');
    }

    return report.join('\n');
  }
}

export const performanceMonitor = new PerformanceMonitor();
