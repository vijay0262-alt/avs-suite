import { Card, Button } from '@avs/ui';
import { useTheme } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import type { ThemeMode } from '@avs/shared/types';

const THEMES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

/**
 * SettingsPage — the only page that ships with interactive controls
 * in this initial scaffold. Additional sections (Language, Updates,
 * License, Advanced) will be plugged in as their subsystems arrive.
 */
export default function SettingsPage() {
  const { mode, setMode } = useTheme();

  return (
    <div data-testid="page-settings">
      <PageHeader
        title="Settings"
        description="Configure appearance, updates, and advanced behaviour."
      />

      <div className="space-y-4">
        <Card title="Appearance">
          <div className="flex flex-wrap items-center gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.id}
                variant={mode === t.id ? 'primary' : 'secondary'}
                onClick={() => setMode(t.id)}
                data-testid={`settings-theme-${t.id}`}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Theme is stored locally and re-applied on next launch.
          </p>
        </Card>

        <Card title="Language">
          <p className="text-sm text-text-secondary">
            English is currently the default. Additional locales will be enabled once
            translations complete.
          </p>
        </Card>

        <Card title="Updates">
          <p className="text-sm text-text-secondary">
            The application checks for updates automatically on the stable channel. Update
            configuration will be exposed here in a future build.
          </p>
        </Card>

        <Card title="License">
          <p className="text-sm text-text-secondary">
            Currently running the Free edition. Activation is not enabled in this build of the
            scaffold.
          </p>
        </Card>
      </div>
    </div>
  );
}
