/**
 * ScanPanel.tsx — thin inline/panel wrapper around `ScanView`.
 */
import { ScanView, type ScanViewProps } from './ScanView';

export type ScanPanelProps = ScanViewProps;

export function ScanPanel(props: ScanPanelProps) {
  return (
    <ScanView
      {...props}
      className={`p-4 ${props.className ?? ''}`.trim()}
    />
  );
}
