import { Card } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { constants } from '@avs/shared';

export default function AboutPage() {
  const { APP_METADATA } = constants;
  return (
    <div data-testid="page-about">
      <PageHeader title="About" description={APP_METADATA.name} />
      <Card>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-text-muted">Product</dt>
            <dd className="text-text-primary">{APP_METADATA.name}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Vendor</dt>
            <dd className="text-text-primary">{APP_METADATA.vendor}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Support</dt>
            <dd className="text-brand-primary">{APP_METADATA.supportEmail}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Website</dt>
            <dd className="text-brand-primary">{APP_METADATA.websiteUrl}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-text-muted">Copyright</dt>
            <dd className="text-text-secondary">{APP_METADATA.copyright}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
