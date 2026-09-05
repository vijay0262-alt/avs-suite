/**
 * UpgradePage — upgrade to AVS AI Shield Professional.
 *
 * Shows feature comparison between FREE and PRO tiers,
 * with pricing and upgrade CTA.
 */
import { Card, Button, Badge, GaugeCard, StatTile } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import {
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
  ShieldCheckIcon,
  BoltIcon,
  ChartBarIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  DocumentArrowDownIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const PRO_FEATURES = [
  { label: 'AI Smart Optimization', icon: BoltIcon, free: false, pro: true },
  { label: 'AI Predictive Health', icon: ChartBarIcon, free: false, pro: true },
  { label: 'AI Hardware Intelligence', icon: CpuChipIcon, free: 'Limited', pro: 'Full' },
  { label: 'AI Process Intelligence', icon: CpuChipIcon, free: 'Limited', pro: 'Full' },
  { label: 'AI Threat Investigation', icon: ShieldCheckIcon, free: 'Basic', pro: 'Advanced' },
  { label: 'AI Remediation & Quarantine', icon: ShieldCheckIcon, free: false, pro: true },
  { label: 'AI Daily Briefing', icon: SparklesIcon, free: false, pro: true },
  { label: 'Export Center (JSON, CSV, HTML)', icon: DocumentArrowDownIcon, free: false, pro: true },
  { label: 'Advanced Security Scanning', icon: ShieldCheckIcon, free: 'Quick only', pro: 'All modes' },
  { label: 'Startup Manager', icon: RocketLaunchIcon, free: 'View only', pro: 'Full control' },
  { label: 'Duplicate File Finder', icon: ChartBarIcon, free: false, pro: true },
  { label: 'Software Uninstaller', icon: RocketLaunchIcon, free: false, pro: true },
  { label: 'AVS AI Assistant', icon: SparklesIcon, free: true, pro: true },
  { label: 'Dashboard & Health Score', icon: ChartBarIcon, free: true, pro: true },
];

export default function UpgradePage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upgrade to Professional"
        description="Unlock the full power of AI-driven PC health, performance, and security"
      />

      {/* Hero Banner */}
      <Card variant="glass" className="overflow-hidden">
        <div className="flex flex-col items-center text-center py-8">
          <div className="rounded-[var(--avs-radius-xl)] bg-gradient-brand p-6">
            <SparklesIcon className="h-12 w-12 text-white" />
          </div>
          <h2 className="mt-4 text-section-title font-bold text-[var(--avs-text-primary)]">AVS AI Shield Professional</h2>
          <p className="mt-2 text-small text-[var(--avs-text-secondary)] max-w-md">
            &ldquo;AVS AI Shield doesn&apos;t just monitor your PC&mdash;it understands it.&rdquo;
          </p>
          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-statistic font-bold text-[var(--avs-text-primary)]">$49.99</span>
            <span className="text-small text-[var(--avs-text-muted)]">/year</span>
          </div>
          <p className="mt-1 text-caption text-[var(--avs-text-muted)]">30-day money-back guarantee</p>
          <Button
            size="lg"
            className="mt-6"
            onClick={() => navigate('/license')}
            leftIcon={<ArrowRightIcon className="h-4 w-4" />}
          >
            Upgrade Now
          </Button>
        </div>
      </Card>

      {/* Feature Comparison */}
      <Card title="Feature Comparison" variant="glass">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--avs-border)]">
                <th className="text-left py-3 px-4 text-small font-semibold text-[var(--avs-text-primary)]">Feature</th>
                <th className="text-center py-3 px-4 text-small font-semibold text-[var(--avs-text-secondary)]">FREE</th>
                <th className="text-center py-3 px-4 text-small font-semibold text-[var(--avs-brand-primary)]">PRO</th>
              </tr>
            </thead>
            <tbody>
              {PRO_FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <tr key={i} className="border-b border-[var(--avs-border)]/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
                        <span className="text-small text-[var(--avs-text-primary)]">{feature.label}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {feature.free === true ? (
                        <CheckIcon className="h-5 w-5 text-[var(--avs-success)] inline" />
                      ) : feature.free === false ? (
                        <XMarkIcon className="h-5 w-5 text-[var(--avs-text-muted)] inline" />
                      ) : (
                        <span className="text-caption text-[var(--avs-text-muted)]">{feature.free}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {feature.pro === true ? (
                        <CheckIcon className="h-5 w-5 text-[var(--avs-brand-primary)] inline" />
                      ) : (
                        <Badge tone="brand">{feature.pro}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Hero stats — System Mechanic style */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="upgrade-hero-section">
        {/* Gauge */}
        <GaugeCard
          title="Unlock All"
          value={100}
          unit="%"
          tone="success"
          icon={<SparklesIcon className="h-6 w-6" />}
          description="$49.99/year · 30-day guarantee"
          data-testid="upgrade-hero-gauge"
        />

        {/* Key stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="AI Smart Optimize"
            value="Unlimited"
            hint="Evidence-based"
            icon={<BoltIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Predictive Health"
            value="Unlimited"
            hint="Trend forecasting"
            icon={<ChartBarIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Hardware Intel"
            value="Full"
            hint="AI analysis"
            icon={<CpuChipIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Security"
            value="Advanced"
            hint="All scan modes"
            icon={<ShieldCheckIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Export Center"
            value="Included"
            hint="JSON, CSV, HTML"
            icon={<DocumentArrowDownIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Support"
            value="Priority"
            hint="Dedicated help"
            icon={<SparklesIcon className="h-5 w-5" />}
            variant="glass"
          />
        </div>
      </div>

      {/* CTA */}
      <Card variant="glass" className="text-center">
        <p className="text-small text-[var(--avs-text-secondary)]">Ready to unlock the full power of AVS AI Shield?</p>
        <Button size="lg" className="mt-4" onClick={() => navigate('/license')}>
          Activate Your License
        </Button>
      </Card>
    </div>
  );
}
