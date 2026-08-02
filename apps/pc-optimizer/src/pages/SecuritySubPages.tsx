/**
 * SecuritySubPages — redirect wrappers for security sub-routes.
 *
 * These routes all point to the unified Security Center,
 * but with the appropriate tab pre-selected via URL hash.
 * This ensures every sidebar item is functional.
 */
import { Navigate } from 'react-router-dom';

export function QuickScanPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'scan', mode: 'quick' }} />;
}

export function FullScanPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'scan', mode: 'full' }} />;
}

export function CustomScanPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'scan', mode: 'custom' }} />;
}

export function AIActiveProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'overview' }} />;
}

export function SpywareProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'spyware' }} />;
}

export function MalwareProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'malware' }} />;
}

export function AdwareProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'adware' }} />;
}

export function RansomwareProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'ransomware' }} />;
}

export function BrowserProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'browser_hijacker' }} />;
}

export function ThreatInvestigationPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'investigation' }} />;
}

export function QuarantinePage() {
  return <Navigate to="/security-center" replace state={{ tab: 'remediation' }} />;
}

export function SecurityReportsPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'reports' }} />;
}

export function TrojanProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'trojans' }} />;
}

export function PUPProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'pup' }} />;
}

export function CryptoMinerProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'crypto_miner' }} />;
}

export function ScriptProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'unsafe_script' }} />;
}

export function KeyloggerProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'keylogger' }} />;
}

export function RootkitProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'rootkit' }} />;
}

export function BackdoorProtectionPage() {
  return <Navigate to="/security-center" replace state={{ tab: 'threats', category: 'backdoor' }} />;
}
