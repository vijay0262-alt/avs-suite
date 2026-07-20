/**
 * WiperPage — secure file shredder and drive free-space wiper.
 */
import { useEffect, useMemo, useState, useRef } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { WiperViewModel } from './WiperViewModel';
import { wiperService } from './wiper.service';

export default function WiperPage() {
  const vm = useMemo(() => new WiperViewModel(wiperService), []);
  const state = useViewModel(vm);
  const [pathText, setPathText] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const addPaths = (items: string[]) => {
    vm.setPaths([...new Set([...state.paths, ...items])]);
    setPathText('');
  };

  const removePath = (idx: number) => {
    const next = [...state.paths];
    next.splice(idx, 1);
    vm.setPaths(next);
  };

  return (
    <div data-testid="page-drive-wiper">
      <PageHeader
        title="Drive Wiper"
        description="Securely shred files and folders or wipe free space on a selected drive."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* File Shredder */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Secure File Shredder</h2>

          <div className="flex flex-col gap-3 mb-4">
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Paste one or more file/folder paths, or use Browse..."
              value={pathText}
              onChange={(e) => setPathText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const raw = pathText.split('\n').map((s) => s.trim()).filter(Boolean);
                  addPaths(raw);
                }}
              >
                Add Paths
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse…
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).map(
                    (f) => (f as unknown as { path?: string }).path ?? f.webkitRelativePath ?? f.name
                  );
                  if (files.length) addPaths(files);
                }}
              />
            </div>
          </div>

          {state.paths.length > 0 && (
            <div className="mb-4 max-h-40 overflow-auto rounded-md border border-border bg-surface">
              {state.paths.map((p, i) => (
                <div key={`${p}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate text-text-secondary" title={p}>
                    {p}
                  </span>
                  <button className="text-red-400 hover:text-red-300" onClick={() => removePath(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Overwrite passes</label>
              <input
                type="number"
                min={1}
                max={35}
                value={state.passes}
                onChange={(e) => vm.setPasses(Math.max(1, Math.min(35, Number(e.target.value))))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="zeros"
                type="checkbox"
                checked={state.zeros}
                onChange={(e) => vm.setZeros(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor="zeros" className="text-sm text-text-secondary">
                Use zeros instead of random bytes
              </label>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => vm.shred()}
            disabled={state.busy || state.paths.length === 0}
          >
            {state.busy ? 'Shredding…' : 'Shred Selected Items'}
          </Button>
        </Card>

        {/* Drive Wiper */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Free-Space Wiper</h2>

          {state.loading ? (
            <p className="text-sm text-text-secondary">Loading drives…</p>
          ) : (
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-1">Target drive</label>
              <select
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                value={state.selectedDrive}
                onChange={(e) => vm.setSelectedDrive(e.target.value)}
              >
                {state.drives.map((d) => (
                  <option key={d.letter} value={d.letter}>
                    {d.letter} {d.label ? `(${d.label})` : ''} — {vm.formatBytes(d.freeBytes)} free
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-sm text-text-muted mb-4">
            This overwrites empty disk space with temporary filler files, then deletes them. It does
            not erase existing files and is safe for normal drives.
          </p>

          <Button
            variant="primary"
            onClick={() => setConfirmWipe(true)}
            disabled={state.busy || !state.selectedDrive}
          >
            {state.busy ? 'Wiping…' : 'Wipe Free Space'}
          </Button>
        </Card>
      </div>

      {state.error && (
        <Card className="mt-6">
          <p className="text-red-500">{state.error}</p>
        </Card>
      )}

      {state.message && (
        <Card className="mt-6">
          <p className="text-green-500 mb-2">{state.message}</p>
          {state.lastResults && state.lastResults.some((r) => !r.success) && (
            <div className="max-h-40 overflow-auto">
              {state.lastResults.filter((r) => !r.success).map((r, i) => (
                <p key={i} className="text-xs text-red-400 truncate" title={r.path}>
                  {r.path}: {r.message}
                </p>
              ))}
            </div>
          )}
          {state.lastWipe && (
            <p className="text-sm text-text-secondary">
              {vm.formatBytes(state.lastWipe.bytesProcessed)} of filler written and removed on {state.lastWipe.drive}
            </p>
          )}
        </Card>
      )}

      {confirmWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Wipe free space?</h3>
            <p className="text-sm text-text-secondary mb-6">
              This will create large temporary files on {state.selectedDrive} to overwrite free space, then remove them. It can take a long time on large drives.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmWipe(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmWipe(false);
                  void vm.wipeFreeSpace();
                }}
              >
                Wipe Free Space
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
