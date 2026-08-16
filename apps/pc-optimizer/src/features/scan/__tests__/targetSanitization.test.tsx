// @vitest-environment happy-dom
/**
 * M1 — target display sanitization regression tests.
 *
 * Verifies that PreviewPanel and RollbackConfirmationPanel only render
 * display_name and never fall back to raw canonical paths or asset data.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PreviewPanel } from '../PreviewPanel';
import { RollbackConfirmationPanel } from '../RollbackConfirmationPanel';
import type { RemediationPreview } from '../types';

afterEach(cleanup);

const mockPreview: RemediationPreview = {
  request_id: 'req-m1',
  plan_id: 'plan-m1',
  approval_token: 'tok-m1',
  total_actions: 2,
  action_types: { delete_file: 2 },
  affected_targets: [
    { display_name: 'Junk Temp Files' },
    { display_name: 'Old Log File' },
  ],
  estimated_size: 1536,
  safety_state_counts: { safe: 2 },
  fixability_counts: { auto_fixable: 2 },
  backup_required: false,
  rollback_supported: true,
  warnings: [],
  is_stale: false,
  generated_at: new Date().toISOString(),
};

describe('PreviewPanel target sanitization', () => {
  it('renders display_name for each affected target', () => {
    render(<PreviewPanel preview={mockPreview} onValidate={() => {}} onBack={() => {}} />);

    expect(screen.getByText('Junk Temp Files')).toBeDefined();
    expect(screen.getByText('Old Log File')).toBeDefined();
    expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
  });

  it('does not render canonical_path, asset_id, or backup_location from target objects', () => {
    const sensitivePreview = {
      ...mockPreview,
      affected_targets: [
        {
          display_name: 'Junk Temp Files',
          canonical_path: 'C:\\Users\\secret\\junk.txt',
          asset_id: 'a-1',
          backup_location: 'C:\\backups',
        } as unknown as { display_name: string; path?: string },
      ],
    } as unknown as RemediationPreview;

    render(<PreviewPanel preview={sensitivePreview} onValidate={() => {}} onBack={() => {}} />);

    expect(screen.queryByText(/C:\\\\Users/)).toBeNull();
    expect(screen.queryByText(/a-1/)).toBeNull();
    expect(screen.queryByText(/backups/)).toBeNull();
  });
});

describe('RollbackConfirmationPanel target sanitization', () => {
  it('renders display_name for affected targets', () => {
    render(
      <RollbackConfirmationPanel
        executionId="exec-m1"
        completedCount={1}
        totalCount={2}
        affectedTargets={[{ display_name: 'Junk Temp Files' }]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Junk Temp Files')).toBeDefined();
  });

  it('does not render raw paths, asset_id, or backup_location', () => {
    render(
      <RollbackConfirmationPanel
        executionId="exec-m1"
        completedCount={1}
        totalCount={2}
        affectedTargets={[
          {
            display_name: 'Junk Temp Files',
            canonical_path: 'C:\\Users\\secret\\junk.txt',
            asset_id: 'a-1',
            backup_location: 'C:\\backups',
          } as unknown as { display_name: string; path?: string },
        ]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByText(/C:\\\\Users/)).toBeNull();
    expect(screen.queryByText(/a-1/)).toBeNull();
    expect(screen.queryByText(/backups/)).toBeNull();
    expect(screen.getByText('Junk Temp Files')).toBeDefined();
  });

  it('handles string targets safely', () => {
    render(
      <RollbackConfirmationPanel
        executionId="exec-m1"
        completedCount={1}
        totalCount={2}
        affectedTargets={['Junk Temp Files']}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Junk Temp Files')).toBeDefined();
  });
});
