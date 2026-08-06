/**
 * FirstScanDialog — shown after login if the user hasn't completed
 * their first system health scan yet.
 *
 * Prompts the user to run a full system scan so the AI features
 * (Assistant, Daily Briefing, Smart Optimize) have real data to work with.
 *
 * On "Start Scan", navigates to /dashboard and triggers the health scan
 * via a URL state parameter. The Dashboard page detects this and auto-starts.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@avs/ui';
import { Modal } from '../dashboard/components/Modal';
import {
  SparklesIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  CircleStackIcon,
  BoltIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { onboardingService } from './OnboardingService';

interface FirstScanDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FirstScanDialog({ open, onClose }: FirstScanDialogProps) {
  const navigate = useNavigate();

  const handleStartScan = useCallback(() => {
    onboardingService.completeFirstScan();
    onClose();
    navigate('/dashboard', { state: { action: 'auto-scan' } });
  }, [onClose, navigate]);

  const handleSkip = useCallback(() => {
    onClose();
    navigate('/dashboard');
  }, [onClose, navigate]);

  return (
    <Modal
      open={open}
      title="Welcome! Let's run your first system scan"
      onClose={handleSkip}
      size="md"
      actions={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="first-scan-skip">
            Skip for now
          </Button>
          <Button variant="primary" size="sm" onClick={handleStartScan} data-testid="first-scan-start">
            Start Scan
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="first-scan-content">
        <div className="flex items-center gap-3">
          <div className="flex p-3 rounded-xl bg-brand-primary/10">
            <SparklesIcon className="h-8 w-8 text-brand-primary" aria-hidden />
          </div>
          <div>
            <p className="text-small text-text-secondary">
              To get the most out of AVS Shield, we recommend running a quick system scan first.
            </p>
          </div>
        </div>

        <p className="text-small text-text-secondary">
          The scan analyzes your PC for junk files, startup issues, privacy traces,
          performance bottlenecks, and security status. It takes about 30 seconds and is
          completely safe — nothing is changed until you approve.
        </p>

        <div className="grid grid-cols-2 gap-3 pt-2">
          {[
            { icon: CircleStackIcon, label: 'Junk & Temp Files', desc: 'Free up disk space' },
            { icon: BoltIcon, label: 'Startup Optimization', desc: 'Speed up boot time' },
            { icon: ShieldCheckIcon, label: 'Privacy & Security', desc: 'Check protection status' },
            { icon: CpuChipIcon, label: 'Performance Analysis', desc: 'Find bottlenecks' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-2 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-3"
            >
              <item.icon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-small font-medium text-text-primary">{item.label}</div>
                <div className="text-caption text-text-muted">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-caption text-text-muted text-center pt-1">
          After the scan, AI features like Smart Optimize and AI Assistant will have real data to provide personalized recommendations.
        </p>
      </div>
    </Modal>
  );
}
