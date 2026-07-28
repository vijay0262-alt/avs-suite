/**
 * ReportsPage — the reports and analytics page.
 *
 * Uses the ReportsView component which generates reports from
 * the existing ExecutionReportBuilder service.
 */
import { PageHeader } from '../../components/PageHeader';
import { ReportsView } from '../maintenance-ui/components/ReportsView';

export default function ReportsPage() {
  return (
    <div data-testid="page-reports">
      <PageHeader
        title="Reports"
        description="Generate detailed maintenance reports with analytics and insights."
      />
      <ReportsView />
    </div>
  );
}
