/**
 * ComingSoon — shared placeholder for pages whose features have not been
 * implemented yet. Renders the branded shell so navigation always feels
 * complete during development.
 */
import { Card } from '@avs/ui';
import { PageHeader } from './PageHeader';

export interface ComingSoonProps {
  title: string;
  description?: string;
  testId?: string;
}

export function ComingSoon({ title, description, testId }: ComingSoonProps) {
  return (
    <div data-testid={testId ?? `page-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="text-sm font-medium text-text-secondary">
            This module has been fully scaffolded. Business logic will be implemented in a future
            iteration behind the same module boundary.
          </p>
          <p className="text-xs text-text-muted">
            Contract lives in <code className="font-mono">packages/shared/src/rpc</code> and the
            Python handler stub lives in <code className="font-mono">backend/src/avs_backend/</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
