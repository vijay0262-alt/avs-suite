/**
 * Tests for DownloadManager — download lifecycle, progress, cancel.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DownloadManager, DownloadError } from '../downloadManager';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('DownloadManager', () => {
  let manager: DownloadManager;

  beforeEach(() => {
    manager = new DownloadManager();
    vi.clearAllMocks();
  });

  function mockResponse(chunks: Uint8Array[], totalSize: number) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Length': String(totalSize) }),
      body: makeReadableStream(chunks),
    };
  }

  it('downloads data successfully', async () => {
    const chunk1 = new TextEncoder().encode('hello ');
    const chunk2 = new TextEncoder().encode('world');
    mockFetch.mockResolvedValue(mockResponse([chunk1, chunk2], 11));

    const data = await manager.download({ url: 'https://example.com/file.exe' });

    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.byteLength).toBe(11);
    expect(new TextDecoder().decode(data)).toBe('hello world');
  });

  it('reports progress during download', async () => {
    const chunk1 = new Uint8Array(100);
    const chunk2 = new Uint8Array(200);
    const progressCallback = vi.fn();
    mockFetch.mockResolvedValue(mockResponse([chunk1, chunk2], 300));

    await manager.download({
      url: 'https://example.com/file.exe',
      onProgress: progressCallback,
    });

    expect(progressCallback).toHaveBeenCalled();
    const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0];
    expect(lastCall.downloadedBytes).toBe(300);
    expect(lastCall.totalBytes).toBe(300);
    expect(lastCall.percent).toBe(100);
  });

  it('throws DownloadError on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      body: null,
    });

    await expect(manager.download({ url: 'https://example.com/missing' })).rejects.toThrow(DownloadError);
  });

  it('cancels download and discards data', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    // Start download then cancel
    const promise = manager.download({ url: 'https://example.com/file.exe' });
    manager.cancel();

    await expect(promise).rejects.toThrow();
    expect(manager.status).toBe('cancelled');
  });

  it('throws DownloadError on network failure', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(manager.download({ url: 'https://example.com/file.exe' })).rejects.toThrow(DownloadError);
    try {
      await manager.download({ url: 'https://example.com/file.exe' });
    } catch (err) {
      expect((err as DownloadError).code).toBe('OFFLINE');
    }
  });

  it('handles empty response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Length': '0' }),
      body: makeReadableStream([]),
    });

    const data = await manager.download({ url: 'https://example.com/empty' });
    expect(data.byteLength).toBe(0);
  });

  it('handles unknown content length', async () => {
    const chunk = new Uint8Array(50);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(), // No Content-Length
      body: makeReadableStream([chunk]),
    });

    const data = await manager.download({ url: 'https://example.com/file' });
    expect(data.byteLength).toBe(50);
  });
});
