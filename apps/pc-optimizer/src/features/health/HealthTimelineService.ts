/**
 * Health Timeline Service (Part 9).
 *
 * Tracks health score over time. Future Dashboard enhancements
 * can display a 30-day timeline (no chart required yet).
 *
 * Only the underlying data model and service are built here.
 */

export interface HealthTimelineEntry {
  /** ISO timestamp of the health score reading. */
  timestamp: string;
  /** Overall health score (0–100). */
  score: number;
  /** Score zone at the time of reading. */
  scoreZone: string;
  /** Number of issues detected at the time of reading. */
  issueCount: number;
}

export interface HealthTimelineStore {
  add(entry: HealthTimelineEntry): void;
  getAll(): HealthTimelineEntry[];
  getSince(timestamp: string): HealthTimelineEntry[];
  clear(): void;
  getCount(): number;
}

/**
 * In-memory implementation. Future versions can replace with
 * a persistent store.
 */
export class InMemoryHealthTimelineStore implements HealthTimelineStore {
  private entries: HealthTimelineEntry[] = [];
  private maxEntries = 10_000;

  add(entry: HealthTimelineEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getAll(): HealthTimelineEntry[] {
    return [...this.entries];
  }

  getSince(timestamp: string): HealthTimelineEntry[] {
    const since = new Date(timestamp).getTime();
    return this.entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  clear(): void {
    this.entries = [];
  }

  getCount(): number {
    return this.entries.length;
  }
}

export class HealthTimelineService {
  constructor(private store: HealthTimelineStore = new InMemoryHealthTimelineStore()) {}

  /**
   * Record a health score reading.
   * Called after each health score computation.
   */
  recordHealth(score: number, scoreZone: string, issueCount: number): HealthTimelineEntry {
    const entry: HealthTimelineEntry = {
      timestamp: new Date().toISOString(),
      score,
      scoreZone,
      issueCount,
    };
    this.store.add(entry);
    return entry;
  }

  /**
   * Get the full timeline.
   */
  getTimeline(): HealthTimelineEntry[] {
    return this.store.getAll();
  }

  /**
   * Get timeline entries from the last N days.
   */
  getRecentDays(days: number): HealthTimelineEntry[] {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.store.getSince(since.toISOString());
  }

  /**
   * Get the last 30 days of health data (for future Dashboard chart).
   */
  getLast30Days(): HealthTimelineEntry[] {
    return this.getRecentDays(30);
  }

  /**
   * Get a simplified timeline (one entry per day, most recent score for each day).
   */
  getDailySummary(days: number): HealthTimelineEntry[] {
    const recent = this.getRecentDays(days);
    const dailyMap = new Map<string, HealthTimelineEntry>();
    for (const entry of recent) {
      const day = entry.timestamp.slice(0, 10); // YYYY-MM-DD
      dailyMap.set(day, entry); // last entry for each day wins
    }
    return Array.from(dailyMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  getCount(): number {
    return this.store.getCount();
  }

  clear(): void {
    this.store.clear();
  }
}

export const healthTimelineService = new HealthTimelineService();
