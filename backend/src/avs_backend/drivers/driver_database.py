"""Driver manufacturer database — curated download URLs for major hardware vendors.

Provides manufacturer-specific download page URLs for common driver categories.
When the driver scanner finds outdated drivers, this database maps them to
the manufacturer's official download page so users can get the latest version
directly from the source.

This is a curated, offline database — no external API calls required.
The database covers the most common hardware manufacturers and device classes.
"""

from __future__ import annotations

import logging
import re
from typing import Any

log = logging.getLogger("avs.driver_db")

# ── Manufacturer download URLs ─────────────────────────────────────────────
# Maps manufacturer name patterns to their driver download pages.
# The key is a lowercase substring to match against the manufacturer/provider name.

MANUFACTURER_URLS: dict[str, dict[str, str]] = {
    # GPU manufacturers
    "nvidia": {
        "url": "https://www.nvidia.com/Download/index.aspx",
        "name": "NVIDIA",
        "auto_detect": "https://www.nvidia.com/Download/index.aspx?lang=en-us",
    },
    "advanced micro devices": {
        "url": "https://www.amd.com/en/support",
        "name": "AMD",
        "auto_detect": "https://www.amd.com/en/support/auto-detect-tool",
    },
    "amd": {
        "url": "https://www.amd.com/en/support",
        "name": "AMD",
        "auto_detect": "https://www.amd.com/en/support/auto-detect-tool",
    },
    "intel": {
        "url": "https://www.intel.com/content/www/us/en/download-center/home.html",
        "name": "Intel",
        "auto_detect": "https://www.intel.com/content/www/us/en/support/detect.html",
    },
    "intel corporation": {
        "url": "https://www.intel.com/content/www/us/en/download-center/home.html",
        "name": "Intel",
        "auto_detect": "https://www.intel.com/content/www/us/en/support/detect.html",
    },

    # Audio
    "realtek": {
        "url": "https://www.realtek.com/Download",
        "name": "Realtek",
        "auto_detect": None,
    },
    "creative": {
        "url": "https://support.creative.com/Downloads/",
        "name": "Creative",
        "auto_detect": None,
    },
    "conexant": {
        "url": "https://www.conexant.com/support/",
        "name": "Conexant",
        "auto_detect": None,
    },

    # Network
    "realtek semiconductor": {
        "url": "https://www.realtek.com/Download",
        "name": "Realtek",
        "auto_detect": None,
    },
    "broadcom": {
        "url": "https://www.broadcom.com/support/download-search",
        "name": "Broadcom",
        "auto_detect": None,
    },
    "qualcomm": {
        "url": "https://www.qualcomm.com/products/support",
        "name": "Qualcomm",
        "auto_detect": None,
    },
    "atheros": {
        "url": "https://www.qualcomm.com/products/support",
        "name": "Qualcomm Atheros",
        "auto_detect": None,
    },
    "mediatek": {
        "url": "https://www.mediatek.com/downloads",
        "name": "MediaTek",
        "auto_detect": None,
    },

    # Chipset
    "asus": {
        "url": "https://www.asus.com/support/Download-Center/",
        "name": "ASUS",
        "auto_detect": None,
    },
    "asrock": {
        "url": "https://www.asrock.com/support/download.asp",
        "name": "ASRock",
        "auto_detect": None,
    },
    "gigabyte": {
        "url": "https://www.gigabyte.com/Support/Download",
        "name": "Gigabyte",
        "auto_detect": None,
    },
    "msi": {
        "url": "https://www.msi.com/support/download",
        "name": "MSI",
        "auto_detect": None,
    },
    "dell": {
        "url": "https://www.dell.com/support/home/drivers",
        "name": "Dell",
        "auto_detect": "https://www.dell.com/support/home/detect",
    },
    "hp": {
        "url": "https://support.hp.com/drivers",
        "name": "HP",
        "auto_detect": "https://support.hp.com/us-en/drivers",
    },
    "lenovo": {
        "url": "https://pcsupport.lenovo.com/",
        "name": "Lenovo",
        "auto_detect": "https://pcsupport.lenovo.com/us/en/lenovosystemupdate",
    },
    "acer": {
        "url": "https://www.acer.com/us-en/support/drivers-and-manuals",
        "name": "Acer",
        "auto_detect": None,
    },

    # Storage
    "samsung": {
        "url": "https://www.samsung.com/us/support/downloads/",
        "name": "Samsung",
        "auto_detect": None,
    },
    "western digital": {
        "url": "https://support.wdc.com/downloads.aspx",
        "name": "Western Digital",
        "auto_detect": None,
    },
    "wd": {
        "url": "https://support.wdc.com/downloads.aspx",
        "name": "Western Digital",
        "auto_detect": None,
    },
    "seagate": {
        "url": "https://www.seagate.com/support/downloads/",
        "name": "Seagate",
        "auto_detect": None,
    },

    # Input devices
    "logitech": {
        "url": "https://www.logitech.com/support",
        "name": "Logitech",
        "auto_detect": None,
    },
    "microsoft": {
        "url": "https://support.microsoft.com/en-us/windows/update-drivers-manually-in-windows-ec8d7d7d-0a44-4f12-a9f0-bc1f2f2b1f6e",
        "name": "Microsoft",
        "auto_detect": None,
    },

    # Other
    "synaptics": {
        "url": "https://www.synaptics.com/products",
        "name": "Synaptics",
        "auto_detect": None,
    },
    "elan": {
        "url": "https://www.elan-tech.com/support/",
        "name": "ELAN",
        "auto_detect": None,
    },
}

# Device class to category mapping for better UI display
DEVICE_CLASS_CATEGORIES: dict[str, str] = {
    "Display": "Graphics",
    "Media": "Audio",
    "Network": "Network",
    "Net": "Network",
    "System": "Chipset",
    "Processor": "Chipset",
    "Battery": "Power",
    "Biometric": "Security",
    "Bluetooth": "Bluetooth",
    "Camera": "Camera",
    "DiskDrive": "Storage",
    "HDC": "Storage",
    "Keyboard": "Input",
    "Mouse": "Input",
    "Printer": "Printer",
    "SmartCardReader": "Security",
    "Sound": "Audio",
    "USB": "System",
    "Monitor": "Display",
}


def _match_manufacturer(manufacturer: str, provider: str) -> dict[str, str] | None:
    """Match a manufacturer/provider string against the database.

    Returns the manufacturer info dict or None if no match.
    """
    search_str = f"{manufacturer} {provider}".lower().strip()
    if not search_str:
        return None

    # Try exact substring matches — longest first for specificity
    for key in sorted(MANUFACTURER_URLS.keys(), key=len, reverse=True):
        if key in search_str:
            return MANUFACTURER_URLS[key]

    return None


def enrich_driver_info(driver: dict[str, Any]) -> dict[str, Any]:
    """Add manufacturer download URL and category to a driver info dict.

    This is called by the driver scanner to enrich each driver entry with
    manufacturer-specific information.
    """
    manufacturer = driver.get("Manufacturer", "") or ""
    provider = driver.get("ProviderName", "") or ""
    device_class = driver.get("DeviceClass", "") or ""

    # Add category
    category = DEVICE_CLASS_CATEGORIES.get(device_class, device_class or "Other")
    driver["Category"] = category

    # Add manufacturer info
    mfg_info = _match_manufacturer(manufacturer, provider)
    if mfg_info:
        driver["ManufacturerName"] = mfg_info["name"]
        driver["DownloadUrl"] = mfg_info["url"]
        if mfg_info.get("auto_detect"):
            driver["AutoDetectUrl"] = mfg_info["auto_detect"]
    else:
        driver["ManufacturerName"] = manufacturer or provider or "Unknown"
        driver["DownloadUrl"] = None
        driver["AutoDetectUrl"] = None

    return driver


def get_manufacturer_list() -> list[dict[str, Any]]:
    """Get the full list of supported manufacturers."""
    seen = set()
    result = []
    for key, info in MANUFACTURER_URLS.items():
        name = info["name"]
        if name not in seen:
            seen.add(name)
            result.append({
                "name": name,
                "url": info["url"],
                "autoDetect": info.get("auto_detect"),
            })
    return sorted(result, key=lambda x: x["name"])
