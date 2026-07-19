"""Reporting - Generate optimization reports.

Generates optimization reports including:
- System Information
- Health Score
- Optimizations Performed
- Space Saved
- Memory Optimized
- Startup Changes
- Privacy Items Cleaned
- Duration
- Warnings

Output formats:
- HTML
- Text
"""

from __future__ import annotations

import logging
import platform
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import psutil

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ReportData:
    """Data for optimization report."""

    system_info: dict[str, Any]
    health_score: float
    health_status: str
    optimizations: list[dict[str, Any]]
    total_space_saved: int
    total_memory_freed: int
    startup_changes: list[dict[str, Any]]
    privacy_items_cleaned: int
    duration_ms: int
    warnings: list[str]
    errors: list[str]
    generated_at: str


def get_system_info() -> dict[str, Any]:
    """Get system information for report."""
    try:
        return {
            "os": f"{platform.system()} {platform.release()}",
            "osVersion": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "pythonVersion": platform.python_version(),
            "hostname": platform.node(),
            "cpuCores": psutil.cpu_count(logical=True),
            "cpuPhysicalCores": psutil.cpu_count(logical=False),
            "totalMemory": psutil.virtual_memory().total,
            "totalMemoryGB": round(psutil.virtual_memory().total / 1024 / 1024 / 1024, 2),
        }
    except Exception as e:
        logger.error(f"Failed to get system info: {e}")
        return {}


def generate_html_report(data: ReportData) -> str:
    """Generate HTML report.

    Args:
        data: ReportData object

    Returns:
        HTML string
    """
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AVS PC Optimizer - Optimization Report</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #34495e;
            margin-top: 30px;
        }}
        .health-score {{
            font-size: 48px;
            font-weight: bold;
            color: {get_health_score_color(data.health_score)};
            text-align: center;
            padding: 20px;
            background-color: #ecf0f1;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .health-status {{
            text-align: center;
            font-size: 24px;
            color: {get_health_score_color(data.health_score)};
            margin-bottom: 20px;
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }}
        .info-item {{
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }}
        .info-label {{
            font-weight: bold;
            color: #7f8c8d;
            font-size: 12px;
            text-transform: uppercase;
        }}
        .info-value {{
            font-size: 18px;
            color: #2c3e50;
        }}
        .optimization-item {{
            background-color: #f8f9fa;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid #27ae60;
        }}
        .warning {{
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }}
        .error {{
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }}
        .summary {{
            background-color: #d4edda;
            border-left: 4px solid #28a745;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
        }}
        .footer {{
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🖥️ AVS PC Optimizer - Optimization Report</h1>
        
        <div class="health-status">System Health: {data.health_status.upper()}</div>
        <div class="health-score">{data.health_score:.1f}%</div>
        
        <h2>📊 Summary</h2>
        <div class="summary">
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Space Saved</div>
                    <div class="info-value">{format_bytes(data.total_space_saved)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Memory Freed</div>
                    <div class="info-value">{format_bytes(data.total_memory_freed)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Privacy Items Cleaned</div>
                    <div class="info-value">{data.privacy_items_cleaned}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Duration</div>
                    <div class="info-value">{data.duration_ms / 1000:.1f} seconds</div>
                </div>
            </div>
        </div>
        
        <h2>💻 System Information</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Operating System</div>
                <div class="info-value">{data.system_info.get('os', 'Unknown')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Processor</div>
                <div class="info-value">{data.system_info.get('processor', 'Unknown')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">CPU Cores</div>
                <div class="info-value">{data.system_info.get('cpuCores', 0)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Total RAM</div>
                <div class="info-value">{data.system_info.get('totalMemoryGB', 0)} GB</div>
            </div>
        </div>
        
        <h2>⚡ Optimizations Performed</h2>
"""

    for opt in data.optimizations:
        html += f"""
        <div class="optimization-item">
            <strong>{opt.get('module', 'Unknown')}</strong> - {opt.get('operation', 'Unknown')}<br>
            <small>{opt.get('timestamp', '')}</small>
        </div>
"""

    if data.startup_changes:
        html += """
        <h2>🚀 Startup Changes</h2>
"""
        for change in data.startup_changes:
            html += f"""
        <div class="optimization-item">
            <strong>{change.get('name', 'Unknown')}</strong> - {change.get('action', 'Unknown')}<br>
            <small>{change.get('timestamp', '')}</small>
        </div>
"""

    if data.warnings:
        html += """
        <h2>⚠️ Warnings</h2>
"""
        for warning in data.warnings:
            html += f"""
        <div class="warning">{warning}</div>
"""

    if data.errors:
        html += """
        <h2>❌ Errors</h2>
"""
        for error in data.errors:
            html += f"""
        <div class="error">{error}</div>
"""

    html += f"""
        <div class="footer">
            <p>Report generated on {data.generated_at}</p>
            <p>AVS PC Optimizer - Phase 2B</p>
        </div>
    </div>
</body>
</html>
"""

    return html


def generate_text_report(data: ReportData) -> str:
    """Generate text report.

    Args:
        data: ReportData object

    Returns:
        Text string
    """
    text = f"""
{'=' * 60}
AVS PC OPTIMIZER - OPTIMIZATION REPORT
{'=' * 60}

Generated: {data.generated_at}

{'=' * 60}
SYSTEM HEALTH
{'=' * 60}
Health Score: {data.health_score:.1f}%
Status: {data.health_status.upper()}

{'=' * 60}
SUMMARY
{'=' * 60}
Space Saved: {format_bytes(data.total_space_saved)}
Memory Freed: {format_bytes(data.total_memory_freed)}
Privacy Items Cleaned: {data.privacy_items_cleaned}
Duration: {data.duration_ms / 1000:.1f} seconds

{'=' * 60}
SYSTEM INFORMATION
{'=' * 60}
Operating System: {data.system_info.get('os', 'Unknown')}
Processor: {data.system_info.get('processor', 'Unknown')}
CPU Cores: {data.system_info.get('cpuCores', 0)}
Total RAM: {data.system_info.get('totalMemoryGB', 0)} GB

{'=' * 60}
OPTIMIZATIONS PERFORMED
{'=' * 60}
"""

    for opt in data.optimizations:
        text += f"- {opt.get('module', 'Unknown')}: {opt.get('operation', 'Unknown')} ({opt.get('timestamp', '')})\n"

    if data.startup_changes:
        text += f"""
{'=' * 60}
STARTUP CHANGES
{'=' * 60}
"""
        for change in data.startup_changes:
            text += f"- {change.get('name', 'Unknown')}: {change.get('action', 'Unknown')} ({change.get('timestamp', '')})\n"

    if data.warnings:
        text += f"""
{'=' * 60}
WARNINGS
{'=' * 60}
"""
        for warning in data.warnings:
            text += f"- {warning}\n"

    if data.errors:
        text += f"""
{'=' * 60}
ERRORS
{'=' * 60}
"""
        for error in data.errors:
            text += f"- {error}\n"

    text += f"""
{'=' * 60}
AVS PC Optimizer - Phase 2B
{'=' * 60}
"""

    return text


def generate_report(
    health_score: float,
    health_status: str,
    optimizations: list[dict[str, Any]],
    total_space_saved: int,
    total_memory_freed: int,
    startup_changes: list[dict[str, Any]],
    privacy_items_cleaned: int,
    duration_ms: int,
    warnings: list[str],
    errors: list[str],
) -> ReportData:
    """Generate report data.

    Args:
        health_score: Current health score
        health_status: Health status string
        optimizations: List of optimizations performed
        total_space_saved: Total space saved in bytes
        total_memory_freed: Total memory freed in bytes
        startup_changes: List of startup changes
        privacy_items_cleaned: Number of privacy items cleaned
        duration_ms: Total duration in milliseconds
        warnings: List of warnings
        errors: List of errors

    Returns:
        ReportData object
    """
    system_info = get_system_info()

    return ReportData(
        system_info=system_info,
        health_score=health_score,
        health_status=health_status,
        optimizations=optimizations,
        total_space_saved=total_space_saved,
        total_memory_freed=total_memory_freed,
        startup_changes=startup_changes,
        privacy_items_cleaned=privacy_items_cleaned,
        duration_ms=duration_ms,
        warnings=warnings,
        errors=errors,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


def format_bytes(bytes_value: int) -> str:
    """Format bytes to human-readable string.

    Args:
        bytes_value: Bytes to format

    Returns:
        Formatted string
    """
    if bytes_value == 0:
        return "0 B"

    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(bytes_value) < 1024.0:
            return f"{bytes_value:.1f} {unit}"
        bytes_value /= 1024.0

    return f"{bytes_value:.1f} PB"


def get_health_score_color(score: float) -> str:
    """Get color for health score.

    Args:
        score: Health score (0-100)

    Returns:
        CSS color string
    """
    if score >= 90:
        return "#27ae60"  # Green
    elif score >= 75:
        return "#2ecc71"  # Light green
    elif score >= 60:
        return "#f39c12"  # Orange
    elif score >= 40:
        return "#e67e22"  # Dark orange
    else:
        return "#e74c3c"  # Red
