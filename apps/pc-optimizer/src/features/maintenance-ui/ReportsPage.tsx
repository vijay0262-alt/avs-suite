/**
 * ReportsPage — the reports and analytics page.
 *
 * Uses the ReportsView component which generates reports from
 * the existing ExecutionReportBuilder service.
 */
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { ReportsView } from '../maintenance-ui/components/ReportsView';

export default function ReportsPage() {
  return (
    <div data-testid="page-reports">
      <PageHeader
        title="Reports"
        description="Generate detailed maintenance reports with analytics and insights."
        actions={<HelpButton text="Reports aggregate data from all maintenance operations — junk cleaning, registry fixes, startup changes, and more. Use them to track system health improvements over time." />}
      />
      <ReportsView />
    </div>
  );
}
