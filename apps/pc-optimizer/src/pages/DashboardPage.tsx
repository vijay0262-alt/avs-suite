import { Card, StatTile, ProgressBar, Badge, Button } from '@avs/ui';
import {
  BoltIcon,
  CircleStackIcon,
  CpuChipIcon,
  RectangleStackIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';

/**
 * DashboardPage — the primary landing screen.
 *
 * NOTE: Values are intentional zeros/placeholders. The scaffold ships
 * the UI layout; live metrics arrive when the metrics module is wired
 * (`rpc.metrics.*`).
 */
export default function DashboardPage() {
  return (
    <div data-testid="page-dashboard">
      <PageHeader
        title="Dashboard"
        description="An at-a-glance view of your PC's health and quick actions to keep it running fast."
        actions={
          <Button leftIcon={<BoltIcon className="h-4 w-4" />} data-testid="dashboard-quick-scan">
            Quick Scan
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="CPU Usage" value="—" hint="Live metric" icon={<CpuChipIcon className="h-5 w-5" />} />
        <StatTile label="RAM Usage" value="—" hint="Live metric" icon={<RectangleStackIcon className="h-5 w-5" />} />
        <StatTile label="Disk Usage" value="—" hint="All volumes" icon={<CircleStackIcon className="h-5 w-5" />} />
        <StatTile label="Junk Files" value="—" hint="Since last scan" icon={<TrashIcon className="h-5 w-5" />} />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          title="Health Score"
          actions={<Badge tone="brand">Beta</Badge>}
          className="xl:col-span-2"
        >
          <div className="flex items-center gap-6">
            <div className="text-5xl font-semibold text-text-primary">—</div>
            <div className="flex-1 space-y-2">
              <ProgressBar value={0} label="Cleanliness" tone="brand" />
              <ProgressBar value={0} label="Performance" tone="success" />
              <ProgressBar value={0} label="Privacy" tone="warning" />
            </div>
          </div>
        </Card>

        <Card title="Quick Actions">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-text-secondary">
              <TrashIcon className="h-4 w-4" /> Clean junk files
            </li>
            <li className="flex items-center gap-2 text-text-secondary">
              <RocketLaunchIcon className="h-4 w-4" /> Manage startup entries
            </li>
            <li className="flex items-center gap-2 text-text-secondary">
              <ShieldCheckIcon className="h-4 w-4" /> Clear privacy traces
            </li>
          </ul>
        </Card>
      </section>

      <section className="mt-6">
        <Card title="Recent Activity">
          <p className="text-sm text-text-muted">No activity yet. Run a scan to get started.</p>
        </Card>
      </section>
    </div>
  );
}
