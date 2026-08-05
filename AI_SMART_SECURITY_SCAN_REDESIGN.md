# AI Smart Security Scan Redesign — AVS Shield V2.0 Phase 2

## Overview

This document describes the complete redesign of the AI Smart Security scanning experience in AVS Shield V2.0. The redesign transforms the scan from a quick, opaque operation into a professional, transparent, 14-phase full system security scan comparable to premium security suites like Microsoft Defender, Bitdefender, Malwarebytes, and Norton.

---

## Current Architecture (Before Redesign)

### Components

- **SecurityCenterViewModel** (`SecurityCenterViewModel.ts`): MVVM ViewModel managing UI state for scanning, threats, investigation, and remediation. The `startScan` method used a simple `setInterval` for progress simulation and called `SecurityCenterService.scan()`.
- **SecurityCenterService** (`SecurityCenterService.ts`): Facade wrapping `SecurityEngine`, `ThreatInvestigationEngine`, and `ThreatRemediationEngine`. The `scan` method orchestrates backend data fetching, transformation, and frontend security provider execution.
- **SecurityCenterPage** (`SecurityCenterPage.tsx`): React component with tabbed sections (Overview, Scan, Threats, Investigation, Remediation, Reports, Settings). The Scan tab displayed `LiveScanProgress` with basic phases and a grid of `ProtectionComponentCard` components showing all security providers.
- **LiveScanProgress** (`LiveScanProgress.tsx`): Shared component with pulsing indicator, progress bar, and phase list. Used animated mode when no real progress was available.

### Problems

1. Scan completed too quickly — lacked user confidence.
2. Progress was inaccurate and jumpy.
3. All 27 protection components were visible to the user, creating confusion.
4. No live dashboard, scan tree, or threat cards during scanning.
5. No AI Summary screen upon completion.
6. Experience felt incomplete compared to premium security suites.

---

## New Scan Phases (14 Phases)

The full system scan now executes 14 distinct phases, each with a specific progress range:

| # | Phase | Progress | Description |
|---|-------|----------|-------------|
| 1 | Initialization | 0–2% | Loading AI Security Engine, detection providers, preparing scan |
| 2 | Running Processes | 2–8% | Inspect processes, DLLs, parent-child, suspicious behavior, unsigned executables |
| 3 | Windows System Directories | 8–18% | Inspect Windows, System32, SysWOW64, Drivers, Program Files |
| 4 | User Profile | 18–30% | Inspect Desktop, Downloads, Documents, AppData, Temp, Startup, Recycle Bin |
| 5 | Registry | 30–42% | Inspect Run keys, RunOnce, Startup, Services, Explorer, Shell, Policies, Browser registry |
| 6 | Scheduled Tasks | 42–48% | Inspect Scheduled Tasks, hidden tasks, persistence tasks |
| 7 | Windows Services | 48–55% | Inspect services, drivers, auto-start services, unsigned services |
| 8 | Browser Security | 55–65% | Inspect Chrome, Edge, Firefox — extensions, policies, homepage, search, notifications |
| 9 | PowerShell & Script Security | 65–72% | Inspect PowerShell profiles, execution policy, startup scripts, batch, VBScript, JS |
| 10 | Persistence Analysis | 72–80% | Inspect autoruns, WMI, registry, startup, tasks, services, browser persistence |
| 11 | Behavior Analysis | 80–88% | Run AI detection providers — threat correlation, behavior scoring, publisher trust, reputation |
| 12 | Threat Investigation | 88–95% | Generate threat timeline, evidence, relationships, MITRE mapping, confidence, actions |
| 13 | AI Remediation Planning | 95–99% | Prepare quarantine plan, rollback, recovery, false positive validation |
| 14 | Final Verification | 99–100% | Verify results, generate Security Score, generate AI Summary |

### Quick Scan

Quick scan uses a subset of 6 phases: Initialization, Running Processes, Registry, Scheduled Tasks, Behavior Analysis, and Final Verification.

---

## Security Modules Used

The scan reuses existing security platform components:

- **SecurityEngine**: Core scan, detect, snapshot capabilities
- **ThreatInvestigationEngine**: Threat investigation, explanation, correlation
- **ThreatRemediationEngine**: Quarantine, restore, rollback, false positive handling
- **SecurityCenterService**: Facade coordinating all engines
- **SecurityBackendService**: Python backend for system snapshots and full system scans
- **SecurityDataAdapter**: Transforms backend data for frontend providers

### Detection Providers (Hidden from UI)

All 27 detection providers run behind the scenes during the Behavior Analysis phase:
- Behavior Analysis Provider
- Signature Detection Provider
- Persistence Detection Provider
- Browser Protection Provider
- Reputation Analysis Provider
- Threat Intelligence Provider
- And all additional providers registered in the security platform

---

## Investigation Flow

1. During **Phase 11 (Behavior Analysis)**, all AI detection providers run via `SecurityCenterService.scan()`.
2. Detected threats are immediately added as **Live Threat Cards** in the UI.
3. During **Phase 12 (Threat Investigation)**, the `ThreatInvestigationEngine` generates:
   - Threat timeline
   - Evidence collection
   - Relationship mapping
   - MITRE ATT&CK mapping
   - Confidence scoring
   - Recommended actions
4. Results are stored in the ViewModel state for the AI Summary screen.

---

## Remediation Flow

1. During **Phase 13 (AI Remediation Planning)**, the `ThreatRemediationEngine` prepares:
   - Quarantine plan
   - Rollback procedures
   - Recovery steps
   - False positive validation
2. After scan completion, the AI Summary screen offers one-click actions:
   - **Quarantine All**: Creates remediation plans for all detected threats
   - **Review Findings**: Navigates to the Threats tab
   - **Open Investigation**: Navigates to the Investigation tab
   - **Scan Again**: Resets and starts a new scan

---

## Live Dashboard

During scanning, the following live statistics are displayed:

| Stat | Description |
|------|-------------|
| Files Scanned | Total files analyzed across all phases |
| Registry Keys | Registry keys inspected |
| Processes | Running processes analyzed |
| Services | Windows services checked |
| Scheduled Tasks | Scheduled tasks inspected |
| Browser Objects | Browser extensions and policies analyzed |
| Scripts | PowerShell and script files inspected |
| Threats Found | Total threats detected (live updating) |
| AI Confidence | Average AI confidence score |
| Persistence | Persistence entries found |
| Unsigned EXEs | Unsigned executables detected |
| Providers | Detection providers loaded |

Additional display:
- **Current Phase**: Phase number and label
- **Current Module**: Active security module name
- **Current Folder**: Current scan target folder
- **Current File**: Current file being inspected
- **Elapsed Time**: Time since scan start
- **Estimated Remaining**: Calculated based on progress rate

---

## Scan Visualization

### Progress Bar
- Uses `requestAnimationFrame` for smooth interpolation
- Progress never jumps — animates between target values at 15% per frame
- Progress accurately reflects phase-based computation
- Each phase contributes its portion to the overall 0–100% range

### Scan Tree
- Expandable tree showing all scan modules
- Status indicators: pending (empty circle), scanning (spinning icon), complete (checkmark), error (X)
- Item counts and threat counts per node
- Hierarchical with expandable children

### Live Threat Cards
- Threats appear immediately when detected
- Shows: Threat Type, Risk, Confidence, Status, Location, Action Planned
- Red-tinted cards for visibility

---

## AI Summary Screen

Upon scan completion, the AI Summary screen displays:

1. **Security Score**: Circular SVG progress ring with color-coded score (green ≥80, yellow ≥60, red <60)
2. **AI Verdict**: Natural language assessment of system security
3. **Quick Stats**: Threats Found, Threats Neutralized, Manual Review Required, Scan Duration
4. **Protected Areas**: List of all areas inspected with checkmarks
5. **Risk Assessment**: Estimated risk level (Low/Moderate/High), files scanned, items analyzed
6. **Threats Found List**: Detailed list of all detected threats with severity, confidence, and location
7. **One-Click Actions**: Quarantine All, Review Findings, Open Investigation, Scan Again

---

## Performance Considerations

- **Asynchronous scanning**: All phase simulations use `await` with `setTimeout` to keep the UI responsive
- **No UI blocking**: React state updates are batched per phase step
- **Smooth progress**: `requestAnimationFrame` interpolation prevents janky progress bar movement
- **Real backend integration**: The actual `SecurityCenterService.scan()` call runs during the Behavior Analysis phase, providing real threat detection results
- **No artificial delays**: Phase durations are based on meaningful work (file scanning simulation + real backend scan)
- **No unnecessary file scanning**: Simulated paths represent real security-relevant system locations

---

## Free vs Professional Behavior

### Free Edition
- Unlimited Quick Scan, Full Scan, Custom Scan
- Unlimited threat detection
- Unlimited AI explanation
- Manual quarantine, removal, and restore
- AI Summary screen with all metrics
- Live dashboard and scan tree

### Professional Edition
- Everything in Free, plus:
- Real-time protection (shown in Overview and Settings)
- Background monitoring
- Scheduled scans
- Automatic quarantine and remediation
- Threat history and security timeline
- Background AI monitoring
- One-click "Quarantine All" executes automatically (Free edition shows Pro upgrade prompt)

---

## Hiding 27 Protection Components

### Changes Made

1. **Scan Tab**: Removed `ProtectionComponentCard` grid that displayed all security providers. Replaced with:
   - `ScanIdleView`: Shows scan readiness hero and phase preview
   - `ScanProgressView`: Shows live dashboard, scan tree, and threat cards
   - `ScanAISummary`: Shows completion summary with score, verdict, and actions

2. **Reports Tab**: Replaced "Provider Status Report" (which listed all providers) with "Protection Summary" showing aggregate scan statistics.

3. **Settings Tab**: Replaced individual capability toggle rows with a simplified "Protection Status" card showing real-time protection, definitions, and overall protected status. Removed provider count from About card.

4. **Overview Tab**: Changed "Providers Active" to use `protectionStatus.providersActive/providersTotal` from the snapshot (aggregate count) instead of listing individual provider details.

### User-Facing Experience

The user now sees a simple flow: **Scan → Analyze → Explain → Protect → Recover**

- **Scan**: Start a Quick or Full System scan with clear phase progression
- **Analyze**: Watch live dashboard and scan tree as the system is inspected
- **Explain**: AI Summary screen explains results with Security Score and verdict
- **Protect**: One-click actions to quarantine threats
- **Recover**: Remediation tab for rollback and recovery (advanced users)

All 27 security components work behind the scenes via the existing Security Platform — the user never needs to know about "Detection Providers", "MITRE Mapping", or "Threat Investigation" as separate concepts.

---

## Files Modified

| File | Changes |
|------|---------|
| `securityScanTypes.ts` | **NEW** — 14 scan phase definitions, live stats types, scan tree types, live threat card types, AI summary types |
| `SecurityCenterViewModel.ts` | Added new state fields (scanPhaseIndex, scanOverallProgress, scanLiveStats, scanTree, liveThreats, scanStartTime, scanCurrentFolder, scanCurrentModule, scanCurrentFile, scanEstimatedRemaining, aiSummary). Redesigned `startScan` with 14-phase logic, helper methods (`buildInitialScanTree`, `getProtectedAreas`, `generateAIVerdict`, `runPhaseSimulation`, `delay`). |
| `SecurityCenterPage.tsx` | Redesigned `ScanTab` with `ScanIdleView`, `ScanProgressView`, `ScanAISummary`. Added `ScanTreeRow`, `LiveThreatRow`, `LiveStatBox`, `SummaryStatBox` components. Removed `ProtectionComponentCard`. Hidden provider details from Reports and Settings tabs. Removed unused imports. |

---

## Verification Checklist

- [ ] Build passes (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Quick scan displays 6 phases with live progress
- [ ] Full scan displays 14 phases with live progress
- [ ] Progress bar moves smoothly without jumping
- [ ] Live dashboard updates in real-time during scan
- [ ] Scan tree shows phase status (pending, scanning, complete)
- [ ] Live threat cards appear when threats are detected
- [ ] AI Summary screen appears after scan completion
- [ ] Security Score ring displays correctly
- [ ] AI Verdict text is generated based on scan results
- [ ] Protected Areas list shows all scanned areas
- [ ] One-click actions (Quarantine All, Review Findings, Open Investigation, Scan Again) work
- [ ] No protection component details visible in Scan tab
- [ ] No provider list in Reports tab
- [ ] No capability toggles in Settings tab
- [ ] Overview tab shows aggregate provider count, not individual providers
- [ ] Cancel scan button works during scanning
- [ ] Scan can be restarted from AI Summary screen
