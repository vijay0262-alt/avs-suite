# Antivirus False Positive Investigation — avs-backend.exe

**Date**: 2026-07-20  
**Scope**: `avs-backend.exe` (PyInstaller-built Python JSON-RPC backend)  
**Status**: Investigation complete, recommendations documented

---

## Executive Summary

`avs-backend.exe` is a PyInstaller single-file executable produced from `backend/avs-backend.spec`. Several characteristics of the current build are known to trigger antivirus heuristics. This document identifies the likely causes and provides both immediate and long-term mitigation strategies. No code signing is currently configured; that is the single most effective remediation.

---

## Current Build Configuration

### PyInstaller Spec (`backend/avs-backend.spec`)

| Setting | Current Value | Risk Level |
|---------|--------------|------------|
| `console` | `True` | Medium |
| `upx` | `True` | **High** |
| `codesign_identity` | `None` | **High** |
| `icon` | `None` | Low |
| `name` | `avs-backend` | Low |
| `debug` | `False` | Low |
| `onefile` | Effective single EXE (`exe` bundles all) | Medium |
| `hiddenimports` | Lists cleaner / privacy / startup modules | Low |

### Electron Builder (`apps/pc-optimizer/electron-builder.yml`)

| Setting | Current Value | Risk Level |
|---------|--------------|------------|
| `win.sign` | `null` | **High** |
| `publisherName` | Set, but unsigned | Medium |
| `extraResources` | `backend/dist/backend-py` bundled in app | Low |

### Project Metadata (`backend/pyproject.toml`)

- `version = "0.1.0"`
- No embedded file-version/product-version in executable
- No `companyName`, `fileDescription`, or `legalCopyright` embedded

---

## Likely Causes of False Positives

### 1. UPX Compression (`upx=True`)

UPX-packed executables are routinely flagged because the compressed bootloader decrypts code in memory, which matches the behavior profile of many packers used by malware. Most consumer AV engines have generic signatures for UPX-packed binaries.

**Recommendation**: Disable UPX (`upx=False`) or unpack after building. This will increase file size but dramatically reduces false-positive rates.

### 2. No Code Signing (`codesign_identity=None`, `win.sign: null`)

Unsigned executables that request elevated privileges, spawn child processes, access system directories, and touch the registry are treated with higher suspicion. AV vendors heavily weight reputation built on Authenticode signatures.

**Recommendation**: Obtain a Code Signing certificate (EV preferred) and configure PyInstaller `codesign_identity` / Electron Builder `sign` to sign `avs-backend.exe` and the installer. Signed executables rarely trigger false positives after the first few installs establish reputation.

### 3. Console Window + System Operations (`console=True`)

A console executable that performs low-level system operations (registry reads, file deletion, temp cleanup, startup management) can trigger behavioral heuristics. A hidden console (`console=False`) is less conspicuous, provided the Electron main process can still capture stdout/stderr.

**Recommendation**: If feasible, set `console=False` and redirect logs to a file. If stdio is required for the JSON-RPC transport, keep `console=True` but document this as an acceptable risk.

### 4. Single-File PyInstaller Bundle

The `exe` target in the current spec bundles Python runtime, interpreter, and all modules into one executable. PyInstaller's bootloader unpacks to a temporary directory at runtime and runs from there, which AV heuristics may classify as suspicious.

**Recommendation**: Use `onedir` mode (PyInstaller `--onedir`) instead of onefile. Although this produces a folder rather than a single EXE, it avoids the unpack-to-temp behavior and reduces false positives. The Electron `extraResources` path is already a directory (`backend/dist/backend-py`), so the backend packaging can align with this model.

### 5. Missing Version Information Resources

The executable has no embedded Windows VERSIONINFO resource. AV engines and SmartScreen use publisher/version metadata as reputation signals.

**Recommendation**: Create a `version.txt` (PyInstaller `--version-file`) with:
- `CompanyName`
- `FileDescription`
- `FileVersion`
- `InternalName`
- `LegalCopyright`
- `OriginalFilename`
- `ProductName`
- `ProductVersion`

### 6. Aggressive Backend Capabilities

The backend legitimately performs actions commonly associated with malware:
- Deletes files (junk cleaner, duplicate finder)
- Reads/Writes registry (startup manager)
- Scans directories recursively (disk analyzer, duplicate finder)
- Spawns processes / accesses system directories

These are necessary for the product, but combined with no signature and UPX packing, they raise heuristic scores.

---

## Immediate Mitigations (No External Dependencies)

1. **Disable UPX** in `backend/avs-backend.spec`:
   ```python
   upx=False,
   upx_exclude=[],
   ```

2. **Add VERSIONINFO** via a `version.txt` file and reference it in the spec:
   ```python
   exe = EXE(
       ...
       version='version.txt',
       icon='assets/icon.ico',
   )
   ```

3. **Add an Icon** to the executable (even a generic one improves reputation):
   ```python
   icon='assets/icon.ico',
   ```

4. **Consider one-dir mode** if onefile is not strictly required.

5. **Document behavior** for users and provide an "Allow in Windows Defender" guide.

---

## Long-Term Recommendations

1. **Purchase and apply an EV Code Signing certificate** for both the executable and the NSIS installer. This is the most impactful step.

2. **Submit to Microsoft Defender and major AV vendors** for whitelisting after signing.

3. **Use Windows SmartScreen reputation** by distributing through a signed installer and collecting positive reputation.

4. **Avoid UPX entirely** in production builds.

5. **Consider separate executables** for high-privilege operations vs. low-privilege operations, so only the necessary component triggers UAC/AV scrutiny.

---

## Files Referenced

- `backend/avs-backend.spec`
- `backend/pyproject.toml`
- `apps/pc-optimizer/electron-builder.yml`

---

## Conclusion

The dominant false-positive drivers are **UPX compression** and **lack of code signing**. Disabling UPX is a zero-cost immediate win. Code signing is the definitive fix and should be prioritized before public distribution.
