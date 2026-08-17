# SC-8C14 — Product Decision Required

## Status: BLOCKED — Product Owner Direction Required

SC-8C14 cannot proceed until the Product Owner / Technical Lead selects a direction.

---

## 1. Phase 2 Recommendation Summary

SC-8C14 Phase 2 analyzed 6 speculative candidates against actual source code. No candidate addresses an active security invariant violation — the post-SC-8C13 architecture is production-ready with zero violations.

Two directions have the strongest repository evidence:

| Direction | Candidate | Type | Phases | Risk | Confidence |
|-----------|-----------|------|--------|------|------------|
| Architecture-focused | B: Security Center Legacy Backend Cleanup | Dead code removal + 1 new read-only RPC | 2–3 | Low | Medium |
| Product-focused | License Activation Integration | Enable Professional edition revenue | 3–4 | Medium | Medium |

**Neither direction has been declared authoritative. Product Owner decision required.**

---

## 2. Architecture-Focused Option: Security Center Legacy Backend Cleanup

### Objective

Remove dead legacy Security Center execution infrastructure remaining after SC-8C12, create a canonical quarantine list RPC, and reduce architectural complexity by ~70% in the security-remediation codebase.

### What would be done

- Delete 6 dead backend RPC handlers (`security.quarantine`, `security.quarantine.restore`, `security.quarantine.delete`, `security.remediation.plan`, `security.remediation.execute`, `security.remediation.rollback`)
- Delete 6 dead frontend RPC wrapper methods in `securityBackendService.ts`
- Delete 6 dead RPC constants from `packages/shared/src/rpc/index.ts`
- Delete dead classes: `ThreatApprovalManager`, `ThreatRollbackManager`, `ThreatQuarantineManager`, `ThreatRestoreManager`, `ThreatDeletionManager`
- Refactor `ThreatRemediationEngine` to remove dead execution methods
- Create canonical `scan_core.security_remediation.quarantine_list` RPC to replace transitional `security.quarantine.list`
- Update tests that depend on deleted classes

### What would NOT be done

- `security.enableSmartScreen/Defender/Firewall` are NOT dead — they are actively called by `dashboard.service.ts` and `ProtectionCenterPage.tsx`. They must NOT be deleted.
- `security.quarantine.list` is transitional but production-reachable — it must NOT be deleted until a canonical replacement is created and wired.
- `ThreatRemediationEngine` read-only domain methods (plan listing, quarantine summary, false-positive tracking, reports, history, dashboard, configuration) are ACTIVE and must be preserved.
- `ThreatRemediationPlanner` (candidate plan creation) is ACTIVE and must be preserved.
- `ThreatSafetyValidator` (candidate plan validation) is internal and must be preserved.
- `ThreatFalsePositiveTracker`, `ThreatRemediationHistory`, `ThreatRemediationReportGenerator`, `ThreatRecoveryProvider` are active read-only domain functionality and must be preserved.
- `scan_core` internals remain frozen — no changes to `RemediationCoordinator`, `SafetyGate`, executors, or `ActionType`.
- No new `ActionType` values.
- No new executors.

### Benefits

1. **Architectural clarity** — ~70% reduction in security-remediation codebase complexity
2. **Dead code elimination** — removes 6 dead RPC handlers, 6 dead frontend methods, 5+ dead classes
3. **Canonical consistency** — replaces transitional `security.quarantine.list` with canonical `scan_core.security_remediation.quarantine_list`
4. **Low risk** — execution paths already disconnected by SC-8C12, no production behavior change
5. **Direct continuation** — completes the work SC-8C12 Phase 5 explicitly documented as remaining limitations
6. **No scan_core changes** — baseline remains frozen
7. **No UX impact** — read-only views unchanged

### Risks

1. **Test compatibility** — some tests depend on deleted classes (`threatRemediation.test.ts`)
2. **Transitional RPC replacement** — must create and wire canonical `quarantine_list` RPC before deleting `security.quarantine.list`
3. **False-positive tracking dependency** — `ThreatFalsePositiveTracker` is used by active `markFalsePositive()` and must be preserved
4. **Low urgency** — no security violation is being fixed; this is cleanup only

### Complexity

**MEDIUM** — 2–3 phases

### Dependencies

- SC-8C12 completed ✅
- `scan_core` architecture available ✅
- No external dependencies

### Expected phase count

**2–3 phases:**
- Phase 1: Delete dead backend RPCs + dead frontend methods + dead RPC constants + dead classes
- Phase 2: Create canonical `quarantine_list` RPC, wire `SecurityCenterService`, remove transitional `security.quarantine.list`
- Phase 3 (optional): Final audit, regression testing, production readiness verification

---

## 3. Product-Focused Option: License Activation Integration

### Objective

Replace `NullLicensingService` placeholder with real license activation, enabling Professional edition enforcement and revenue generation.

### What would be done

- Wire `SdkActivationService` to a real license server backend
- Replace `NullLicensingService` as the default activation service
- Implement license server backend (or integrate with existing external service)
- Complete activation flow: activate, deactivate, validate, refresh
- Implement offline mode with grace period
- Implement device fingerprinting and multi-device licensing
- Wire entitlement/feature gating to real license state
- Complete activation UI (`ActivationPage.tsx` already exists)
- Implement error handling for invalid keys, expired licenses, network failures

### What would NOT be done

- `scan_core` internals remain frozen
- No changes to `RemediationCoordinator`, `SafetyGate`, executors, or `ActionType`
- No changes to canonical remediation flow
- No changes to Security Center, Dashboard, or Smart Optimization remediation

### Benefits

1. **Revenue enablement** — unlocks Professional edition purchases
2. **Feature gating** — enables real edition enforcement (Free vs Professional)
3. **High customer value** — users can activate and unlock Pro features
4. **Infrastructure exists** — `@avs/licensing` package, `SdkActivationService`, `ActivationPage.tsx`, encrypted license storage, device ID provider, offline grace period architecture all exist
5. **Security value** — enables edition enforcement and license validation
6. **Product requirements exist** — documented in `COMMERCIAL_CHECKLIST.md`

### Risks

1. **License server dependency** — requires a backend license server that does not yet exist
2. **Cryptographic operations** — license key validation, encryption, device fingerprinting
3. **Offline mode complexity** — grace period, expiration, re-validation
4. **External dependency** — may require EV code signing certificate for trust
5. **Payment integration** — may require payment processor integration (future)
6. **Higher complexity** — full-stack work across frontend, backend, and external service

### Complexity

**HIGH** — 3–4 phases

### Dependencies

- License server backend (NOT YET BUILT) ❌
- EV code signing certificate (NOT YET OBTAINED) ❌
- `@avs/licensing` package infrastructure ✅
- `SdkActivationService` code ✅
- `ActivationPage.tsx` UI ✅

### Expected phase count

**3–4 phases:**
- Phase 1: License server backend implementation (or external service integration)
- Phase 2: Wire `SdkActivationService` to real backend, replace `NullLicensingService`
- Phase 3: Complete activation flow, offline mode, error handling, entitlement gating
- Phase 4: Testing, validation, production deployment

---

## 4. Benefits Comparison

| Criterion | Architecture (Candidate B) | Product (License Activation) |
|-----------|---------------------------|------------------------------|
| Security value | Low (cleanup) | High (edition enforcement) |
| User value | None | High (enables Pro edition) |
| Revenue impact | None | High (enables purchases) |
| Architectural value | Medium (70% complexity reduction) | Medium (completes licensing infrastructure) |
| Maintainability | Medium improvement | Medium improvement |
| Visible UX impact | None | Yes (activation UI) |
| Long-term benefit | Medium | High (revenue + feature gating) |
| Completes prior work | Yes (SC-8C12 remaining items) | Yes (V1.2 roadmap item) |

---

## 5. Risks Comparison

| Criterion | Architecture (Candidate B) | Product (License Activation) |
|-----------|---------------------------|------------------------------|
| Risk level | Low | Medium |
| Primary risk | Test compatibility | License server dependency |
| External dependencies | None | License server, EV certificate |
| Regression risk | Low | Medium |
| Baseline risk | None | None |

---

## 6. Complexity Comparison

| Criterion | Architecture (Candidate B) | Product (License Activation) |
|-----------|---------------------------|------------------------------|
| Complexity | MEDIUM | HIGH |
| Frontend impact | Delete 6 methods, refactor 1 class | Complete activation flow |
| Backend impact | Delete 6 RPCs, add 1 RPC | Build license server |
| Persistence impact | None | License storage (exists) |
| RPC impact | Delete 6 constants, add 1 RPC | New license APIs |
| Test impact | Medium (test updates) | High (new tests) |
| Phase count | 2–3 | 3–4 |

---

## 7. Dependencies Comparison

| Criterion | Architecture (Candidate B) | Product (License Activation) |
|-----------|---------------------------|------------------------------|
| Internal dependencies | SC-8C12 ✅ | `@avs/licensing` ✅, `SdkActivationService` ✅, `ActivationPage.tsx` ✅ |
| External dependencies | None | License server ❌, EV certificate ❌ |
| Ready to start? | ✅ Yes | ❌ External dependencies required |

---

## 8. Expected Phase Count

| Option | Phases | Justification |
|--------|--------|---------------|
| Architecture (Candidate B) | 2–3 | Delete dead code (1 phase) + replace transitional RPC (1 phase) + optional audit (1 phase) |
| Product (License Activation) | 3–4 | License server (1 phase) + wire SDK (1 phase) + complete flow (1 phase) + testing/deployment (1 phase) |

---

## 9. Exact Decision Required from Product Owner

The Product Owner / Technical Lead must answer:

### Decision 1: Primary objective

**What is the primary objective of SC-8C14?**

- [ ] A: Architecture cleanup (Security Center Legacy Backend Cleanup)
- [ ] B: Product feature delivery (License Activation Integration)
- [ ] C: Both — split into SC-8C14 (cleanup) + SC-8C15 (license activation)
- [ ] D: Neither — defer SC-8C14, handle cleanup as maintenance tasks
- [ ] E: Other — ____________________

### Decision 2: Architecture cleanup scope

**If A or C is selected, should Candidates A (Health Scan Modals) and E (Smart Optimization Dead Code) be included?**

- [ ] Yes — include all cleanup in SC-8C14
- [ ] No — handle A and E as separate maintenance tasks
- [ ] Other — ____________________

### Decision 3: scan_core freeze

**Should scan_core internals remain frozen?**

- [ ] Yes — no changes to RemediationCoordinator, SafetyGate, executors, ActionType
- [ ] No — allow changes (requires separate justification)

### Decision 4: New RPCs

**Should new read-only RPCs be allowed (e.g., `scan_core.security_remediation.quarantine_list`)?**

- [ ] Yes — read-only RPCs only
- [ ] No — no new RPCs
- [ ] Other — ____________________

### Decision 5: License server

**If B or C is selected, how should the license server be handled?**

- [ ] Build a new license server backend in this repository
- [ ] Integrate with an external license service
- [ ] Defer license activation until server is available
- [ ] Other — ____________________

### Decision 6: Definition of Done

**What is the Definition of Done for SC-8C14?**

- [ ] For architecture cleanup: All dead code removed, canonical quarantine_list RPC created, all tests pass, no regression
- [ ] For license activation: Real activation works end-to-end, Professional edition enforced, offline mode works, all tests pass
- [ ] Other — ____________________

---

## 10. Recommended Default Based on Repository Evidence

**RECOMMENDED DEFAULT — NOT AUTHORITATIVE**

Based strictly on repository evidence (not product preference):

### If immediate readiness is prioritized: Architecture (Candidate B)

**Rationale:**
- Ready to start immediately — no external dependencies
- SC-8C12 explicitly documented remaining limitations
- Low risk, no baseline impact
- Completes prior work
- 2–3 phases

### If customer value is prioritized: License Activation

**Rationale:**
- Highest customer value — enables Professional edition and revenue
- Infrastructure already exists (60% complete)
- Product requirements documented
- 3–4 phases
- BUT requires external dependencies (license server, EV certificate)

### Evidence-based default

**Architecture (Candidate B)** is the evidence-based default because:
1. It is ready to start immediately (no external dependencies)
2. It has the lowest risk
3. It directly completes documented SC-8C12 remaining work
4. It does not require product infrastructure that doesn't exist yet
5. License Activation can follow as SC-8C15 once the license server is available

**However, this recommendation is NOT authoritative. The Product Owner may legitimately prioritize revenue enablement over architecture cleanup.**

---

## 11. Statement That Recommendation Is NOT Authoritative

**The recommendation in Section 10 is NOT an authoritative specification.**

It is an evidence-based default proposed for Product Owner review. It does not:
- Constitute a product decision
- Authorize implementation
- Create an authoritative specification
- Bind the Product Owner to any direction

**No SC-8C14 specification can be created until the Product Owner explicitly selects a direction.**

---

## Next Steps

1. Product Owner reviews this document
2. Product Owner makes decisions 1–6 above
3. An authoritative `SC8C14_SPECIFICATION.md` is created based on the decision
4. An authoritative `SC8C14_PHASE_PLAN.md` is created
5. Only then can SC-8C14 implementation begin

---

## Confirmation

- **Production files modified:** NONE
- **Tests modified:** NONE
- **SC-8C14 implementation started:** NO
- **SC-8C15 started:** NO
- **No production code, tests, or configuration were modified**
- **This document is a decision request ONLY**

---

**End of SC-8C14 Product Decision Required Document**
