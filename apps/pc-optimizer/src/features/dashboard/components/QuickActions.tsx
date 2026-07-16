import { Card } from '@avs/ui';
import { CpuChipIcon, ServerIcon, ShieldCheckIcon, DocumentTextIcon, ChartBarIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

export interface QuickActionsProps {
  onNavigate: (path: string) => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const navigate = useNavigate();

  const actions = [
    {
      id: 'junk-cleaner',
      name: 'Junk Cleaner',
      description: 'Remove temporary files and free up space',
      icon: CpuChipIcon,
      color: 'text-brand-primary',
      bgColor: 'bg-brand-primary/10',
      path: '/junk-cleaner',
    },
    {
      id: 'startup-manager',
      name: 'Startup Manager',
      description: 'Manage applications that run at startup',
      icon: ServerIcon,
      color: 'text-semantic-success',
      bgColor: 'bg-semantic-success/10',
      path: '/startup',
    },
    {
      id: 'privacy-cleaner',
      name: 'Privacy Cleaner',
      description: 'Clear browsing history and privacy traces',
      icon: ShieldCheckIcon,
      color: 'text-semantic-warning',
      bgColor: 'bg-semantic-warning/10',
      path: '/privacy',
    },
    {
      id: 'disk-analyzer',
      name: 'Disk Analyzer',
      description: 'Analyze disk usage and find large files',
      icon: ChartBarIcon,
      color: 'text-semantic-danger',
      bgColor: 'bg-semantic-danger/10',
      path: '/disk-analyzer',
    },
    {
      id: 'duplicate-finder',
      name: 'Duplicate Finder',
      description: 'Find and remove duplicate files',
      icon: DocumentDuplicateIcon,
      color: 'text-semantic-info',
      bgColor: 'bg-semantic-info/10',
      path: '/duplicate-finder',
    },
    {
      id: 'system-info',
      name: 'System Information',
      description: 'View detailed system specifications',
      icon: DocumentTextIcon,
      color: 'text-text-secondary',
      bgColor: 'bg-surface-muted',
      path: '/system-info',
    },
  ];

  const handleActionClick = (path: string) => {
    onNavigate(path);
    navigate(path);
  };

  return (
    <Card title="Quick Actions">
      <div className="grid grid-cols-2 gap-3" role="list" aria-label="Quick actions">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action.path)}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-border hover:border-border-hover hover:bg-surface-hover transition-colors text-left focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface"
            data-testid={`quick-action-${action.id}`}
            role="listitem"
            aria-label={`${action.name}: ${action.description}`}
          >
            <div className={`p-2 rounded-md ${action.bgColor}`}>
              <action.icon className={`h-5 w-5 ${action.color}`} aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">{action.name}</div>
              <div className="text-xs text-text-secondary mt-1">{action.description}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
