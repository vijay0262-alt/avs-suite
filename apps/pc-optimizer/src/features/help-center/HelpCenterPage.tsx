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
import { Card } from '@avs/ui';
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
  { label: 'Run a Health Scan', path: '/dashboard', icon: ShieldCheckIcon, description: 'Analyze your PC health with AI' },
  { label: 'Open AVS AI Assistant', path: '/ai-assistant', icon: ChatBubbleLeftRightIcon, description: 'Ask questions about your PC' },
  { label: 'Run Smart Optimize', path: '/ai-smart-optimize', icon: BoltIcon, description: 'Optimize your PC with AI recommendations' },
  { label: 'View Hardware Info', path: '/hardware-center', icon: CpuChipIcon, description: 'Check hardware health and status' },
];

const FAQS = [
  {
    q: 'What is AI Smart Optimization?',
    a: 'AI Smart Optimization analyzes your system using evidence-based metrics and recommends the safest, highest-impact optimizations. It never makes changes without your approval.',
  },
  {
    q: 'How does the AI Security Center work?',
    a: 'The Security Center uses multiple detection providers (behavior, signature, persistence, browser protection, reputation) to identify threats. Every detection includes evidence and a confidence score.',
  },
  {
    q: 'What is AI Predictive Health?',
    a: 'Predictive Health analyzes trend history to detect degrading system performance before it becomes visible. It forecasts potential issues using sensor evidence.',
  },
  {
    q: 'Is my data sent to the cloud?',
    a: 'No. All AI analysis runs locally on your device. AVS Shield does not send your system data to external servers.',
  },
  {
    q: 'What\'s the difference between FREE and PRO?',
    a: 'FREE includes basic scanning, dashboard, and AVS AI Assistant. PRO adds Smart Optimization, Predictive Health, Advanced Security, Export Center, and more.',
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
        description="Get help, find answers, and learn how to get the most out of AVS Shield"
      />

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
            <p className="text-small font-bold text-[var(--avs-text-primary)]">AVS Shield</p>
            <p className="text-caption text-[var(--avs-text-muted)]">Advanced Vision Software LLC · Sheridan, WY</p>
            <p className="text-caption text-[var(--avs-text-muted)]">AI-Powered PC Health, Performance & Security Platform</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
