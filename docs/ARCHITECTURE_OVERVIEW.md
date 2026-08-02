# AVS Suite — Architecture Overview

**How every subsystem connects. Single source of truth for architecture.**
Last updated: 2026-08-02

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        AVS Suite Monorepo                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Electron Desktop App                            │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │                   React Renderer (Vite)                      │ │  │
│  │  │                                                              │ │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │  │
│  │  │  │ Dashboard │  │ Security │  │ Hardware │  │   AI     │   │ │  │
│  │  │  │          │  │ Dashboard│  │  Center  │  │ Workspace│   │ │  │
│  │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │ │  │
│  │  │       │              │              │              │         │ │  │
│  │  │  ┌────▼──────────────▼──────────────▼──────────────▼──────┐  │ │  │
│  │  │  │              MVVM ViewModels (@avs/core)               │  │ │  │
│  │  │  │   useViewModel → useSyncExternalStore → re-render      │  │ │  │
│  │  │  └───────────────────────┬───────────────────────────────┘  │ │  │
│  │  │                          │ RPC                               │ │  │
│  │  │  ┌───────────────────────▼───────────────────────────────┐  │ │  │
│  │  │  │              Feature Modules (61 folders)              │  │ │  │
│  │  │  │  AI Engines │ Security │ Hardware │ Smart Optimize     │  │ │  │
│  │  │  └───────────────────────┬───────────────────────────────┘  │ │  │
│  │  └──────────────────────────┼──────────────────────────────────┘ │  │
│  │                             │ IPC (preload bridge)                │  │
│  │  ┌──────────────────────────▼──────────────────────────────────┐ │  │
│  │  │              Electron Main Process                          │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │  │
│  │  │  │ PythonBridge │  │  IPC Handlers│  │  Updater    │        │ │  │
│  │  │  │ (JSON-RPC    │  │  (context    │  │  (SDK-based)│        │ │  │
│  │  │  │  over stdio) │  │   bridge)    │  │             │        │ │  │
│  │  │  └──────┬───────┘  └─────────────┘  └─────────────┘        │ │  │
│  │  └─────────┼───────────────────────────────────────────────────┘ │  │
│  └────────────┼──────────────────────────────────────────────────────┘  │
│               │                                                          │
│  ┌────────────▼──────────────────────────────────────────────────────┐  │
│  │              Python Backend (PyInstaller)                          │  │
│  │                                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│  │
│  │  │ Cleaner  │ │ Startup  │ │ Privacy  │ │ Dashboard│ │ Performance│ │
│  │  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤│  │
│  │  │ Disk An. │ │ Dup Find │ │ Uninstall│ │ Sys Info │ │ Registry ││  │
│  │  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤│  │
│  │  │ Undo     │ │ Licensing│ │ Settings │ │ Reporting│ │ Scheduler││  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘│  │
│  │                                                                    │  │
│  │  AVS License SDK ──► AVS License Server (FastAPI + PostgreSQL)    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Shared Packages                                 │  │
│  │  @avs/core │ @avs/ui │ @avs/shared │ @avs/licensing │ @avs/updater│  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Other Apps                                      │  │
│  │  @avs/customer-portal (Next.js) │ @avs/security │ @avs/vpn │ ...  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Connections

### AI Platform

```
                    ┌─────────────────────────┐
                    │    AI Orchestration      │
                    │   (coordinates all AI)   │
                    └───────────┬─────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  AI Context      │  │  AI Insights    │  │  AI Recommend.  │
│  Engine          │  │  Engine         │  │  Engine         │
│                  │  │                  │  │                  │
│  • Provenance    │  │  • Generates    │  │  • Evidence-     │
│  • Evidence      │──▶│    insights     │──▶│    based recs   │
│  • Confidence    │  │  • Confidence   │  │  • Actionable    │
│  • Traceability  │  │    scores       │  │  • Safe          │
└────────┬────────┘  └─────────────────┘  └─────────────────┘
         │
         │    ┌─────────────────┐  ┌─────────────────┐
         ├───▶│  AI Predictions │  │  AI Knowledge   │
         │    │  Engine         │  │  Base           │
         │    │  • Forecasts    │  │  • Threat KB    │
         │    │  • Trends       │  │  • Hardware KB  │
         │    │  • Reliability  │  │  • Process KB   │
         │    └─────────────────┘  └─────────────────┘
         │
         │    ┌─────────────────┐  ┌─────────────────┐
         ├───▶│  AI Process     │  │  AI Device      │
         │    │  Intelligence   │  │  Profile        │
         │    │  • Process      │  │  • Hardware     │
         │    │    analysis     │  │    profile      │
         │    │  • Impact       │  │  • Capabilities │
         │    │  • Risk assess. │  │  • Limitations  │
         │    └─────────────────┘  └─────────────────┘
         │
         │    ┌─────────────────┐
         └───▶│  AI Health      │
              │  Engine         │
              │  • Analyzers    │
              │  • Scoring      │
              │  • Reports      │
              └─────────────────┘
```

**Core principle**: The AI must never invent information. Every insight, recommendation, or answer must be traceable back to one or more context providers, with supporting evidence and a confidence score.

**Connections**:
- AI Context Engine → feeds all other AI engines (insights, recommendations, predictions)
- AI Insights → consumed by Dashboard, Security Dashboard, Hardware Center
- AI Recommendations → consumed by Smart Optimize, Dashboard, Copilot
- AI Predictions → consumed by Dashboard Intelligence, Hardware Center (planned)
- AI Process Intelligence → engine complete, UI not yet built
- AI Health Engine → consumed by Dashboard health score
- AI Workspace → Copilot uses AI Assistant + Context Engine + Insights

---

### Hardware Platform

```
┌─────────────────────────────────────────────────────────┐
│                  Hardware Center UI                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │ Overview │  │ Live     │  │ Alerts   │  │ Export   ││
│  │ Section  │  │ Graphs   │  │ Panel    │  │ Menu     ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘│
│       └──────────────┴──────────────┴──────────────┘    │
│                          │                               │
│              HardwareDashboardViewModel                   │
│              (useViewModel ← @avs/core)                  │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Hardware     │  │ Hardware     │  │ Hardware     │
│ Scanner      │  │ Monitor      │  │ Manager      │
│              │  │              │  │              │
│ • Scans HW   │  │ • Live data  │  │ • Coordinates│
│ • Collects   │  │ • Polling    │  │ • Registry   │
│   info       │  │ • Events     │  │ • Repository │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                ┌────────▼────────┐
                │ Hardware Health │
                │ Engine (AI)     │
                │                 │
                │ • Analyzes      │
                │ • Explains      │
                │ • Recommends    │
                │ • No modific.   │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ Hardware AI     │
                │ Engine          │
                │                 │
                │ • AI analysis   │
                │ • Context prov. │
                └─────────────────┘
```

**Connections**:
- Hardware Center → AI Context Engine (provides hardware context)
- Hardware Center → Dashboard (health score contribution)
- Hardware Health Engine → AI Insights (generates hardware insights)
- Hardware AI Engine → AI Recommendations (generates hardware recommendations)
- Hardware Center → Python Backend (system info via RPC)
- Hardware Center → AI Predictions (hardware failure forecasts, planned)

---

### Security Platform

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Security Dashboard UI                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│  │Overview│ │Protect.│ │Threat  │ │Provider│ │Analyt. │ │Command ││
│  │Panel   │ │Status  │ │Timeline│ │Health  │ │Panel   │ │Center  ││
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘│
│      └──────────┴──────────┴──────────┴──────────┴──────────┘     │
│                              │                                      │
│              SecurityDashboardViewModel                             │
│              (useViewModel ← @avs/core)                             │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Real-Time       │  │  Security       │  │  Security       │
│  Protection      │  │  Center         │  │  Investigation  │
│  Engine          │  │                 │  │                 │
│  ┌────────────┐ │  │  20+ Detection  │  │  • Correlation  │
│  │ Protection │ │  │  Providers:     │  │  • Explanation  │
│  │ Manager    │ │  │  • Adware       │  │  • Confidence   │
│  │ (10 mon.)  │ │  │  • Spyware      │  │  • Severity     │
│  ├────────────┤ │  │  • Hijacker     │  │  • Timeline     │
│  │ Rule Engine│ │  │  • Crypto Miner │  │  • Knowledge KB │
│  ├────────────┤ │  │  • PUP          │  │  • Recommend.   │
│  │ Scheduler  │ │  │  • PowerShell   │  │  • Reports      │
│  ├────────────┤ │  │  • Macro        │  │  • Evidence     │
│  │ State Mach.│ │  │  • Script       │  │  • Context      │
│  ├────────────┤ │  │  • Persistence  │  └─────────────────┘
│  │ Statistics │ │  │  • Network Beh. │
│  ├────────────┤ │  │  • File Rep.    │  ┌─────────────────┐
│  │ Telemetry  │ │  │  • Unsigned Ex. │  │  Security       │
│  ├────────────┤ │  │  • Susp. Proc.  │  │  Remediation    │
│  │ Session    │ │  │  • Service An.  │  │                 │
│  ├────────────┤ │  │  • Startup Abuse│  │  • Quarantine   │
│  │ Notificat. │ │  │  • Sched. Task  │  │  • Deletion     │
│  ├────────────┤ │  │  • Threat Intel │  │  • Rollback     │
│  │ Action Q.  │ │  │  • Pub. Trust   │  │  • Restore     │
│  ├────────────┤ │  │  • Browser Prot.│  │  • Safety Val. │
│  │ Health     │ │  │  • Signature    │  │  • False Pos.  │
│  ├────────────┤ │  │                 │  │  • Approval    │
│  │ History    │ │  │  Security Engine│  │  • Policy      │
│  └────────────┘ │  │  Security Manager│  │  • History    │
│                 │  │  Security Scanner│  │  • Reports    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Connections**:
- Security Dashboard ViewModel → Real-Time Protection Engine (monitors, stats, health)
- Security Dashboard ViewModel → Security Center (detection results, threats)
- Security Dashboard ViewModel → Security Investigation (threat analysis, timeline)
- Security Dashboard ViewModel → Security Remediation (quarantine, restore actions)
- Security Center → AI Context Engine (provides security context)
- Security Investigation → AI Insights (generates threat insights)
- Security Investigation → AI Knowledge Base (threat knowledge lookup)
- Security Remediation → Undo/Restore backend (file backup/restore via RPC)
- Real-Time Protection → Protection Events → Security Center (event-driven detection)
- Security Center → Security Investigation (detected threats → investigation pipeline)
- Security Investigation → Security Remediation (analyzed threats → remediation actions)

---

### Optimization Platform

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Optimize System                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Planner                                │   │
│  │  • Evaluates recommendations                             │   │
│  │  • Creates optimization plans                            │   │
│  │  • Prioritizes by impact × safety                        │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                           │                                     │
│     ┌─────────────────────┼─────────────────────┐              │
│     │                     │                     │              │
│     ▼                     ▼                     ▼              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │ Adaptive │    │ Automation   │    │ Maintenance  │         │
│  │ Optimiz. │    │ Engine       │    │ Engine       │         │
│  │          │    │              │    │              │         │
│  │ Learns  │    │ Schedules    │    │ Runs maint.  │         │
│  │ patterns │    │ auto tasks   │    │ tasks        │         │
│  └──────────┘    └──────────────┘    └──────────────┘         │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │ Profiles │    │ Goals        │    │ Simulation   │         │
│  │          │    │              │    │              │         │
│  │ Gaming,  │    │ Optimization │    │ Simulate     │         │
│  │ Work,    │    │ goals &      │    │ before       │         │
│  │ Battery  │    │ tracking     │    │ executing    │         │
│  └──────────┘    └──────────────┘    └──────────────┘         │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │ Recovery │    │ Timeline     │    │ Intelligence │         │
│  │          │    │              │    │              │         │
│  │ Rollback │    │ History of   │    │ AI-driven    │         │
│  │ & restore│    │ optimiz.     │    │ optimization │         │
│  └──────────┘    └──────────────┘    └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
         │                                        │
         ▼                                        ▼
┌─────────────────┐                    ┌─────────────────┐
│ Execution       │                    │ AI Smart        │
│ Pipeline        │                    │ Optimization AI │
│                 │                    │                 │
│ • Task execution│                    │ • AI planning   │
│ • Progress track│                    │ • Evidence-based│
│ • Results       │                    │ • Safe recs     │
└────────┬────────┘                    └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Python Backend  │
│ • cleaner.clean │
│ • startup.*     │
│ • privacy.*     │
│ • undo.*        │
└─────────────────┘
```

**Connections**:
- Smart Optimize Planner → AI Recommendations Engine (gets recommendations)
- Smart Optimize Planner → AI Insights (gets system insights)
- Smart Optimize → Execution Pipeline (executes plans)
- Execution Pipeline → Python Backend (performs actual operations)
- Execution Pipeline → Undo/Restore (creates backups before operations)
- Smart Optimize Timeline → Maintenance History (records results)
- Smart Optimize Recovery → Undo/Restore (rollback on failure)
- Automation Engine → Scheduler (schedules recurring optimizations)
- AI Smart Optimization AI → AI Context Engine (gets context for decisions)

---

### Dashboard

```
┌─────────────────────────────────────────────────────┐
│                  Dashboard Page                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Health   │  │ Health   │  │ Issues   │          │
│  │ Score    │  │ Breakdown│  │ List     │          │
│  │ Card     │  │          │  │          │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       └──────────────┴──────────────┘               │
│                      │                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Recom-   │  │ Quick    │  │ Module   │          │
│  │ mendat.  │  │ Actions  │  │ Cards    │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       └──────────────┴──────────────┘               │
│                      │                               │
│  ┌──────────┐  ┌──────────┐                         │
│  │ Live     │  │ Health   │                         │
│  │ Status   │  │ Scan     │                         │
│  │ (2s poll)│  │ Modal    │                         │
│  └────┬─────┘  └──────────┘                         │
│       │                                              │
│       │    DashboardViewModel                        │
│       │    ← useViewModel(@avs/core)                 │
└───────┼──────────────────────────────────────────────┘
        │
        ├──▶ Python Backend: dashboard.metrics, dashboard.live
        ├──▶ Module Registry: list() → module cards
        ├──▶ Health Score Service: getScore() → health score
        ├──▶ AI Health Engine: analyzers → scoring
        ├──▶ AI Recommendations: getRecommendations() → recs
        ├──▶ Dashboard Intelligence: widgets → dashboard widgets
        └──▶ Smart Optimize: oneClickOptimize() → quick actions
```

**Connections**:
- Dashboard → Python Backend (metrics, live data via RPC)
- Dashboard → Module Registry (module cards, health contributions)
- Dashboard → Health Score Service (aggregate health score)
- Dashboard → AI Health Engine (category scoring, analyzers)
- Dashboard → AI Recommendations (recommendation cards)
- Dashboard → Dashboard Intelligence (widgets, actions)
- Dashboard → Smart Optimize (one-click optimize)
- Dashboard → Onboarding (welcome dialog, tips)
- Dashboard → Notifications (event-driven alerts)

---

### Copilot

```
┌─────────────────────────────────────────────────────┐
│                  AI Copilot                          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  AI Assistant                                 │   │
│  │  • Templates                                  │   │
│  │  • Context engine                             │   │
│  │  • Provenance tracking                        │   │
│  └───────────────────┬──────────────────────────┘   │
│                      │                               │
│  ┌───────────────────▼──────────────────────────┐   │
│  │  AI Workspace                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Command  │  │ Report   │  │ Actions  │   │   │
│  │  │ Center   │  │ Studio   │  │          │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Tools    │  │ Multimod.│  │ Personal.│   │   │
│  │  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ├──▶ AI Context Engine (gets system context)
         ├──▶ AI Insights (gets generated insights)
         ├──▶ AI Recommendations (gets recommendations)
         ├──▶ AI Knowledge Base (gets knowledge)
         ├──▶ AI Predictions (gets forecasts)
         ├──▶ AI Process Intelligence (gets process analysis)
         ├──▶ Hardware Center (gets hardware info)
         ├──▶ Security Dashboard (gets security status)
         └──▶ Smart Optimize (gets optimization suggestions)
```

**Connections**:
- Copilot → AI Context Engine (collects context from all providers)
- Copilot → AI Insights (generates insights from context)
- Copilot → AI Recommendations (generates actionable recommendations)
- Copilot → AI Knowledge Base (lookup knowledge for explanations)
- Copilot → AI Predictions (forecast data for proactive suggestions)
- Copilot → All feature modules (via context providers)
- AI Workspace → Copilot (workspace provides UI shell for copilot)
- AI Workspace → Report Studio (generates reports from AI analysis)
- AI Workspace → Actions (executes AI-recommended actions)
- AI Workspace → Tools (provides tools for AI to use)
- AI Workspace → Multimodal (handles multiple input types)

---

### Execution Engine

```
┌─────────────────────────────────────────────────────┐
│                  Execution Pipeline                   │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Task     │  │ Progress │  │ Results  │          │
│  │ Queue    │──▶│ Tracking │──▶│ Collection│         │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  Sources:                                            │
│  ├── Smart Optimize (optimization plans)             │
│  ├── Automation Engine (scheduled tasks)             │
│  ├── Dashboard (quick actions)                       │
│  ├── Security Remediation (quarantine, delete)       │
│  └── Manual (user-initiated actions)                 │
│                                                      │
│  Destinations:                                       │
│  ├── Python Backend (RPC calls)                      │
│  ├── Undo/Restore (backup before changes)            │
│  └── Maintenance History (record results)            │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Execution Pipeline → Python Backend (executes RPC calls)
- Execution Pipeline → Undo/Restore (creates backups before destructive ops)
- Execution Pipeline → Maintenance History (records all execution results)
- Smart Optimize → Execution Pipeline (submits optimization plans)
- Automation Engine → Execution Pipeline (submits scheduled tasks)
- Security Remediation → Execution Pipeline (submits quarantine/deletion tasks)

---

### Recovery

```
┌─────────────────────────────────────────────────────┐
│                  Recovery / Undo System               │
│                                                      │
│  Frontend:                                           │
│  ├── features/undo/undoService.ts (RPC wrapper)     │
│  ├── ExecutionDetailDialog (Restore & Rollback UI)  │
│  └── Smart Optimize Recovery                         │
│                                                      │
│  Backend (Python):                                   │
│  ├── undo/ (8 RPC endpoints)                         │
│  │   ├── undo.backup.file                            │
│  │   ├── undo.backup.directory                       │
│  │   ├── undo.backup.registry                        │
│  │   ├── undo.backup.restorePoint                    │
│  │   ├── undo.restore                                │
│  │   ├── undo.check                                  │
│  │   ├── undo.list                                   │
│  │   └── undo.delete                                 │
│  └── Security Remediation                            │
│      ├── ThreatRollbackManager                       │
│      ├── ThreatRestoreManager                        │
│      └── ThreatQuarantineManager                     │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Undo Service → Python Backend (8 RPC methods)
- Execution Detail Dialog → Undo Service (restore UI)
- Smart Optimize Recovery → Undo Service (rollback failed optimizations)
- Security Remediation → Undo Service (restore quarantined files)
- Security Remediation → Threat Rollback Manager (security-specific rollback)

---

### Timeline

```
┌─────────────────────────────────────────────────────┐
│                  Timeline / History                    │
│                                                      │
│  Maintenance History Page                            │
│  ├── Analytics & charts                              │
│  ├── Searchable table                                │
│  ├── Detail dialog                                   │
│  └── Restore & rollback                              │
│                                                      │
│  Sources:                                            │
│  ├── Execution Pipeline (all execution results)      │
│  ├── Smart Optimize Timeline (optimization history)  │
│  ├── Security Investigation (threat history)         │
│  ├── Security Remediation (remediation history)      │
│  ├── Real-Time Protection (protection history)       │
│  ├── Hardware Center (hardware history)              │
│  └── AI Predictions (prediction history)             │
│                                                      │
│  Backend:                                            │
│  ├── history/ (SQLite cleaning history)              │
│  └── Python modules (per-module history)             │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Maintenance History → Execution Pipeline (gets execution records)
- Maintenance History → Smart Optimize Timeline (gets optimization history)
- Maintenance History → Undo/Restore (restore from history)
- Security Dashboard → Security Investigation (threat timeline)
- Security Dashboard → Real-Time Protection (protection history)
- Hardware Center → Hardware History (hardware events)
- AI Predictions → Prediction History (forecast accuracy tracking)

---

### Reports

```
┌─────────────────────────────────────────────────────┐
│                  Reports System                       │
│                                                      │
│  Reports Page                                        │
│  ├── Report generation                               │
│  ├── Analytics                                       │
│  └── Insights                                        │
│                                                      │
│  AI Workspace → Report Studio                        │
│  ├── AI-generated reports                            │
│  ├── Multimodal output                               │
│  └── Personalization                                 │
│                                                      │
│  Security Dashboard → Protection Reports Panel       │
│  ├── Security report                                 │
│  ├── Weekly report                                   │
│  ├── Threat summary                                  │
│  ├── Investigation summary                           │
│  ├── Remediation summary                             │
│  └── Protection history                              │
│                                                      │
│  Export formats: JSON, CSV, TXT                      │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Reports Page → Execution Pipeline (execution data)
- Reports Page → AI Insights (insight generation)
- Reports Page → Optimization Report Builder (report generation)
- AI Workspace Report Studio → AI Context Engine (context for reports)
- AI Workspace Report Studio → AI Insights (insights for reports)
- Security Dashboard → Security Investigation (threat reports)
- Security Dashboard → Security Remediation (remediation reports)

---

### Settings

```
┌─────────────────────────────────────────────────────┐
│                  Settings System                      │
│                                                      │
│  Settings Page (10+ sections):                       │
│  ├── Appearance (theme: light/dark/system)           │
│  ├── Language (i18n-ready, English only)             │
│  ├── Edition (Free/Professional display)             │
│  ├── Version (version, build, channel)               │
│  ├── Update Preferences (manual check)               │
│  ├── Telemetry (disabled, future)                    │
│  ├── Account                                         │
│  ├── Entitlement                                     │
│  ├── Subscription                                    │
│  ├── Features (feature flag display)                 │
│  ├── Developer                                       │
│  ├── Onboarding (reset tips)                         │
│  └── Shortcuts (keyboard shortcuts)                  │
│                                                      │
│  Config Sync → Configuration synchronization         │
│  Feature Engine → Feature flag management            │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Settings → Edition Manager (edition display)
- Settings → Update Manager (update preferences)
- Settings → Feature Engine (feature flag display)
- Settings → License Service (account, entitlement, subscription)
- Settings → Config Sync (sync settings across devices, planned)
- Settings → i18n (language selection)

---

### Licensing

```
┌─────────────────────────────────────────────────────┐
│                  Licensing System                     │
│                                                      │
│  Frontend:                                           │
│  ├── EditionManager.tsx (React context)              │
│  ├── FeatureGate.ts (feature access checks)          │
│  ├── UpgradeDialog.tsx (upsell UI)                   │
│  ├── ActivationPage.tsx (license activation UI)      │
│  └── useFeatureGuard.ts (hook for gating)            │
│                                                      │
│  Package:                                            │
│  ├── @avs/licensing (interfaces)                     │
│  │   ├── ILicenseManager                             │
│  │   ├── IActivationService                          │
│  │   ├── IFeatureManager                             │
│  │   ├── LicenseModel / LicenseState                 │
│  │   └── NullLicensingService (placeholder)          │
│  └── @avs/shared/featureFlags                        │
│      ├── FEATURES registry (30+ flags)               │
│      ├── isFeatureEnabled()                          │
│      └── shouldHideFeature()                         │
│                                                      │
│  Electron:                                           │
│  ├── electron/licensing/ (bridge, IPC, startup)      │
│  └── preload.ts → window.avs.license                 │
│                                                      │
│  Backend:                                            │
│  ├── backend/licensing/ (Python RPC handlers)        │
│  └── AVS License SDK → AVS License Server            │
│      (FastAPI + PostgreSQL)                          │
└─────────────────────────────────────────────────────┘
```

**Connections**:
- Edition Manager → Feature Gate (resolves current edition)
- Feature Gate → Feature Flags (checks FEATURES registry)
- Sidebar → Feature Gate (gates nav entries)
- All Pages → useFeatureGuard (gates UI elements)
- Activation Page → License Service (activation/deactivation)
- License Service → Electron IPC → Python Backend → AVS License SDK → License Server
- Update Manager → License SDK (update check via SDK)
- Module Registry → Feature Permissions (module-level gating)

---

## Data Flow Summary

```
User Action → React Component → ViewModel → RPC Client
    → IPC (preload) → Electron Main → Python Bridge (JSON-RPC stdio)
    → Python Backend → Windows APIs (psutil, WMI, winreg, SQLite)
    → Response → Back up the chain → ViewModel.setState()
    → useSyncExternalStore → React re-render
```

## AI Data Flow

```
Context Providers (Hardware, Security, Process, Performance, etc.)
    → AI Context Engine (collects, packages with provenance + evidence)
    → AI Insights Engine (generates insights with confidence scores)
    → AI Recommendations Engine (creates evidence-based recommendations)
    → AI Predictions Engine (forecasts with confidence intervals)
    → Consumed by: Dashboard, Copilot, Smart Optimize, Security Dashboard
```

## Security Data Flow

```
Real-Time Protection Engine (10 monitors)
    → Protection Events (event bus)
    → Security Center (20+ detection providers analyze events)
    → Security Investigation (correlate, explain, score severity)
    → Security Remediation (quarantine, delete, rollback)
    → Security Dashboard (display results, timeline, analytics)
    → AI Context Engine (security context for AI)
```

## Edition Gating Flow

```
App Startup → License Server (via SDK) → License State
    → Edition Manager → Current Edition (free/professional)
    → Feature Gate → isFeatureEnabled(flag, edition)
    → UI Components → Show/Hide/Lock features
    → Sidebar → Gate nav entries
```
