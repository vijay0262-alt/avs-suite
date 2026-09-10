/**
 * HelpCenterPage — comprehensive help and support page.
 *
 * Includes:
 *   - Quick links to common actions
 *   - FAQ section
 *   - Support contact information
 *   - Documentation links
 *   - Keyboard shortcuts
 */
import { Card, GaugeCard, StatTile } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import {
  QuestionMarkCircleIcon,
  LifebuoyIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const QUICK_LINKS = [
  { label: 'Run a Health Scan', path: '/dashboard', icon: ShieldCheckIcon, description: 'Analyze health, performance, and security with AI' },
  { label: 'Open AVS AI Assistant', path: '/ai-assistant', icon: ChatBubbleLeftRightIcon, description: 'Ask the AI assistant about any PC question' },
  { label: 'Run Smart Optimize', path: '/ai-smart-optimize', icon: BoltIcon, description: 'Get evidence-based AI optimization recommendations' },
  { label: 'AI Process Intelligence', path: '/process-intelligence', icon: CpuChipIcon, description: 'Understand every process and its impact on your PC' },
];

const FAQS = [
  {
    q: 'What is AVS AI Shield?',
    a: 'AVS AI Shield is an AI-powered PC Health, Performance & Security Platform. It does not just monitor your PC—it understands it—using sensor evidence, confidence scores, and explainable AI.',
  },
  {
    q: 'What is AI Active Protection?',
    a: 'AI Active Protection combines Protection (real-time monitoring, behavior analysis), Investigation (explainable AI, threat timeline, correlation), Remediation (safe quarantine, rollback, recovery), and Intelligence (process, hardware, and predictive analytics).',
  },
  {
    q: 'What is AI Smart Optimization?',
    a: 'AI Smart Optimization analyzes your system using evidence-based metrics and recommends the safest, highest-impact optimizations. It never tweaks hardware or makes changes without your approval.',
  },
  {
    q: 'What is AI Predictive Health?',
    a: 'Predictive Health analyzes trend history to detect degrading system performance before it becomes user-visible. It forecasts potential failures using sensor evidence and confidence scores.',
  },
  {
    q: 'What is AI Process Intelligence?',
    a: 'AI Process Intelligence explains every running process and its impact on system health, performance, and security, backed by live sensor evidence.',
  },
  {
    q: 'What is AI Hardware Intelligence?',
    a: 'AI Hardware Intelligence analyzes, explains, and recommends actions for your hardware health. It never modifies hardware, BIOS, fans, or clock speeds.',
  },
  {
    q: 'Is my data sent to the cloud?',
    a: 'No. All AI analysis runs locally on your device. AVS AI Shield does not send your system data to external servers.',
  },
  {
    q: 'What\'s the difference between FREE and PRO?',
    a: 'FREE includes basic scanning, dashboard, AI Assistant, hardware information, and limited analysis. PRO unlocks AI Smart Optimization, AI Predictive Health, AI Process Intelligence, advanced security, unlimited cleaning, and priority support.',
  },
  {
    q: 'How do I restore quarantined files?',
    a: 'Go to Security Center > Remediation tab. Select the quarantined item and click Restore. You can also use the Recovery Center for system restore points.',
  },
];

const SHORTCUTS = [
  { keys: 'Ctrl + H', action: 'Run Health Scan' },
  { keys: 'Ctrl + S', action: 'Quick Security Scan' },
  { keys: 'Ctrl + O', action: 'Smart Optimize' },
  { keys: 'Ctrl + ,', action: 'Open Settings' },
  { keys: 'Ctrl + ?', action: 'Open Help' },
];

export default function HelpCenterPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help Center"
        description="Get help, find answers, and learn how to get the most out of AVS AI Shield"
      />

      {/* Hero status section — System Mechanic style */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="help-hero-section">
        {/* Gauge */}
        <GaugeCard
          title="Help Center"
          value={100}
          unit="%"
          tone="brand"
          icon={<LifebuoyIcon className="h-6 w-6" />}
          description="Ready to assist you"
          data-testid="help-hero-gauge"
        />

        {/* Key stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <StatTile
            label="Quick Actions"
            value={QUICK_LINKS.length.toString()}
            hint="Common tasks"
            icon={<BoltIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="FAQs"
            value={FAQS.length.toString()}
            hint="Answered questions"
            icon={<QuestionMarkCircleIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Shortcuts"
            value={SHORTCUTS.length.toString()}
            hint="Keyboard hotkeys"
            icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Docs"
            value="Available"
            hint="Online documentation"
            icon={<LifebuoyIcon className="h-5 w-5" />}
            variant="glass"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Card key={link.path} variant="glass" className="cursor-pointer hover:border-[var(--avs-brand-primary)] transition-colors" onClick={() => navigate(link.path)}>
              <div className="flex items-center gap-3">
                <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <Icon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
                </div>
                <div className="flex-1">
                  <p className="text-small font-semibold text-[var(--avs-text-primary)]">{link.label}</p>
                  <p className="text-caption text-[var(--avs-text-muted)]">{link.description}</p>
                </div>
                <ArrowRightIcon className="h-4 w-4 text-[var(--avs-text-muted)]" />
              </div>
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <Card title="Frequently Asked Questions" variant="glass">
        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4">
              <div className="flex items-start gap-2">
                <QuestionMarkCircleIcon className="h-5 w-5 text-[var(--avs-brand-primary)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-small font-semibold text-[var(--avs-text-primary)]">{faq.q}</p>
                  <p className="mt-1 text-small text-[var(--avs-text-secondary)]">{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Support Contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="glass">
          <div className="flex items-center gap-3">
            <EnvelopeIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
            <div>
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">Email Support</p>
              <a href="mailto:help@avsshield.com" className="text-small text-[var(--avs-brand-primary)] hover:underline">help@avsshield.com</a>
            </div>
          </div>
        </Card>

        <Card variant="glass">
          <div className="flex items-center gap-3">
            <GlobeAltIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
            <div>
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">Website</p>
              <a href="https://www.avsshield.com" target="_blank" rel="noopener noreferrer" className="text-small text-[var(--avs-brand-primary)] hover:underline">www.avsshield.com</a>
            </div>
          </div>
        </Card>

        <Card variant="glass">
          <div className="flex items-center gap-3">
            <LifebuoyIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
            <div>
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">Documentation</p>
              <a href="https://www.avsshield.com/docs" target="_blank" rel="noopener noreferrer" className="text-small text-[var(--avs-brand-primary)] hover:underline">View Docs</a>
            </div>
          </div>
        </Card>
      </div>

      {/* Keyboard Shortcuts */}
      <Card title="Keyboard Shortcuts" variant="glass">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SHORTCUTS.map((sc) => (
            <div key={sc.keys} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-3 py-2">
              <span className="text-small text-[var(--avs-text-secondary)]">{sc.action}</span>
              <kbd className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-caption font-mono text-[var(--avs-text-primary)]">{sc.keys}</kbd>
            </div>
          ))}
        </div>
      </Card>

      {/* About */}
      <Card variant="glass">
        <div className="flex items-center gap-4">
          <div className="rounded-[var(--avs-radius-xl)] bg-gradient-brand p-4">
            <ShieldCheckIcon className="h-8 w-8 text-white" />
          </div>
          <div>
            <p className="text-small font-bold text-[var(--avs-text-primary)]">AVS AI Shield</p>
            <p className="text-caption text-[var(--avs-text-muted)]">Advanced Vision Software LLC · Sheridan, WY</p>
            <p className="text-caption text-[var(--avs-text-muted)]">AI-Powered PC Health, Performance & Security Platform</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
