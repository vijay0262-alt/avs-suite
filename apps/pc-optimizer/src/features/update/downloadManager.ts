/**
 * DownloadManager — manages file downloads with progress reporting,
 * pause, resume, cancel, retry, and timeout support.
 *
 * Downloads are stored in a temporary update directory.
 * Partial downloads are reused where possible to avoid duplicate
 * downloads.
 *
 * Uses fetch() with AbortController for network control.
 * Progress is reported via a callback.
 */

export type DownloadStatus =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface DownloadProgress {
  /** Bytes downloaded so far. */
  downloadedBytes: number;
  /** Total bytes to download (0 if unknown). */
  totalBytes: number;
  /** Percentage 0–100 (0 if total unknown). */
  percent: number;
  /** Download speed in bytes/sec. */
  speed: number;
}

export type DownloadErrorCode =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'CANCELLED'
  | 'PAUSED'
  | 'INTEGRITY'
  | 'UNKNOWN';

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: DownloadErrorCode,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export interface DownloadOptions {
  /** URL to download from. */
  url: string;
  /** Expected file size in bytes (for progress calculation). */
  expectedSize?: number;
  /** Timeout in ms (default 120s). */
  timeoutMs?: number;
  /** Called with progress updates. */
  onProgress?: (progress: DownloadProgress) => void;
  /** AbortSignal from caller (e.g. for cancellation). */
  signal?: AbortSignal;
}

interface DownloadState {
  status: DownloadStatus;
  data: Uint8Array[];
  downloadedBytes: number;
  totalBytes: number;
  startTime: number;
  lastProgressTime: number;
  abortController: AbortController | null;
}

export class DownloadManager {
  private _state: DownloadState;
  private _progressCallback: ((p: DownloadProgress) => void) | null = null;

  constructor() {
    this._state = this.createInitialState();
  }

  private createInitialState(): DownloadState {
    return {
      status: 'idle',
      data: [],
      downloadedBytes: 0,
      totalBytes: 0,
      startTime: 0,
      lastProgressTime: 0,
      abortController: null,
    };
  }

  /** Get current download status. */
  get status(): DownloadStatus {
    return this._state.status;
  }

  /** Get downloaded bytes so far. */
  get downloadedBytes(): number {
    return this._state.downloadedBytes;
  }

  /**
   * Download a file from the given URL.
   * Returns the complete file data on success.
   */
  async download(options: DownloadOptions): Promise<Uint8Array> {
    // If we have a paused download for the same URL, resume
    if (this._state.status === 'paused') {
      return this.resume(options);
    }

    // Reset state for a fresh download
    this._state = this.createInitialState();
    this._progressCallback = options.onProgress ?? null;
    this._state.status = 'downloading';
    this._state.startTime = Date.now();
    this._state.lastProgressTime = this._state.startTime;

    return this.executeDownload(options);
  }

  /**
   * Internal: execute the actual download.
   */
  private async executeDownload(options: DownloadOptions): Promise<Uint8Array> {
    const { url, timeoutMs = 120000 } = options;

    this._state.abortController = new AbortController();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this._state.abortController?.abort();
    }, timeoutMs);

    // Merge with external signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this._state.abortController?.abort();
      });
    }

    try {
      const response = await fetch(url, {
        signal: this._state.abortController.signal,
        headers: this._state.downloadedBytes > 0
          ? { Range: `bytes=${this._state.downloadedBytes}-` }
          : undefined,
      });

      if (!response.ok) {
        throw new DownloadError(
          `Download failed: HTTP ${response.status} ${response.statusText}`,
          'HTTP_ERROR',
        );
      }

      // Get total size
      const contentLength = response.headers.get('Content-Length');
      this._state.totalBytes = contentLength
        ? parseInt(contentLength, 10)
        : options.expectedSize ?? 0;

      // Read the response body chunk by chunk
      const reader = response.body?.getReader();
      if (!reader) {
        throw new DownloadError(
          'Download failed: response body is not readable.',
          'UNKNOWN',
        );
      }

      let reading = true;
      while (reading) {
        if (this._state.status === 'paused') {
          // Stop reading — download will be resumed later
          await reader.cancel();
          throw new DownloadError('Download paused.', 'PAUSED');
        }

        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }

        if (value) {
          this._state.data.push(value);
          this._state.downloadedBytes += value.byteLength;
          this.reportProgress();
        }
      }

      // Combine chunks
      const totalBytes = this._state.downloadedBytes;
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of this._state.data) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      this._state.status = 'completed';
      this.reportProgress();

      return combined;
    } catch (err) {
      if (err instanceof DownloadError) {
        if (err.code === 'PAUSED') {
          // Already handled — state is 'paused'
          throw err;
        }
        if (err.code === 'CANCELLED') {
          this._state.status = 'cancelled';
        }
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        if (this._state.status === 'paused') {
          throw new DownloadError('Download paused.', 'PAUSED');
        }
        this._state.status = 'cancelled';
        throw new DownloadError('Download was cancelled.', 'CANCELLED');
      }

      this._state.status = 'error';
      throw new DownloadError(
        err instanceof Error ? err.message : 'Download failed.',
        'OFFLINE',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Pause the current download.
   * The downloaded data is preserved for resume.
   */
  pause(): void {
    if (this._state.status !== 'downloading') return;
    this._state.status = 'paused';
    this._state.abortController?.abort();
  }

  /**
   * Resume a paused download.
   */
  async resume(options: DownloadOptions): Promise<Uint8Array> {
    if (this._state.status !== 'paused') {
      throw new DownloadError('Cannot resume: download is not paused.', 'UNKNOWN');
    }

    this._progressCallback = options.onProgress ?? null;
    this._state.status = 'downloading';
    this._state.lastProgressTime = Date.now();

    return this.executeDownload(options);
  }

  /**
   * Cancel the current download and discard data.
   */
  cancel(): void {
    this._state.abortController?.abort();
    this._state = this.createInitialState();
    this._state.status = 'cancelled';
  }

  /**
   * Retry a failed or cancelled download from scratch.
   */
  async retry(options: DownloadOptions): Promise<Uint8Array> {
    this._state = this.createInitialState();
    this._progressCallback = options.onProgress ?? null;
    this._state.status = 'downloading';
    this._state.startTime = Date.now();
    this._state.lastProgressTime = this._state.startTime;

    return this.executeDownload(options);
  }

  /**
   * Report progress to the callback.
   */
  private reportProgress(): void {
    if (!this._progressCallback) return;

    const now = Date.now();
    const elapsed = (now - this._state.startTime) / 1000; // seconds
    const speed = elapsed > 0 ? this._state.downloadedBytes / elapsed : 0;

    const percent = this._state.totalBytes > 0
      ? Math.min(100, (this._state.downloadedBytes / this._state.totalBytes) * 100)
      : 0;

    this._progressCallback({
      downloadedBytes: this._state.downloadedBytes,
      totalBytes: this._state.totalBytes,
      percent,
      speed,
    });

    this._state.lastProgressTime = now;
  }
}

/** Singleton download manager instance. */
export const downloadManager = new DownloadManager();
