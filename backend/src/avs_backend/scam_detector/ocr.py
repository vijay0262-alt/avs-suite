"""Screenshot OCR via Windows' built-in Windows.Media.Ocr WinRT API.

Free — no Tesseract, no cloud, no pip deps. Works on Windows 10+ through
PowerShell. Returns "" on non-Windows or any failure (caller decides).
"""

from __future__ import annotations

import base64
import logging
import os
import platform
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

_OCR_TIMEOUT = 40

_POWERSHELL = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# WinRT types must be projected explicitly in Windows PowerShell.
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and
                 $_.GetParameters().Count -eq 1 -and
                 $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation``1*' })[0]
if (-not $asTaskGeneric) { throw 'AsTask<T> reflection lookup failed' }

function Await-Op($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage('en') }
if (-not $engine) { throw 'No OCR engine available' }

$file = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:AVS_OCR_PATH)) `
  ([Windows.Storage.StorageFile])
$stream = Await-Op ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) `
  ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) `
  ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-Op ($decoder.GetSoftwareBitmapAsync()) `
  ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = Await-Op ($engine.RecognizeAsync($bitmap)) `
  ([Windows.Media.Ocr.OcrResult])
$stream.Dispose()
[Console]::Out.Write($result.Text)
"""

_OCR_B64 = base64.b64encode(_POWERSHELL.encode("utf-16-le")).decode("ascii")


def ocr_image(path: str) -> str:
    """Extract text from an image file. Returns "" on failure."""
    if platform.system() != "Windows":
        log.info("OCR unavailable on non-Windows platform")
        return ""
    p = Path(path)
    if not p.is_file():
        log.warning("OCR path not found: %s", path)
        return ""
    if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"}:
        log.warning("OCR unsupported image type: %s", p.suffix)
        return ""
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive",
             "-ExecutionPolicy", "Bypass", "-EncodedCommand", _OCR_B64],
            capture_output=True, timeout=_OCR_TIMEOUT,
            env={**os.environ, "AVS_OCR_PATH": str(p)},
        )
        text = proc.stdout.decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")[:200]
            log.warning("OCR failed (rc=%s): %s", proc.returncode, err)
            return ""
        return text
    except Exception as e:
        log.warning("OCR error: %s", e)
        return ""
