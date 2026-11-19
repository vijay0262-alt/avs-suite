"""Popular-domain allowlist (top ~20k registrable domains).

Derived from the Majestic Million ranking (CC BY 3.0) and reduced to
registrable domains via the vendored PSL. Its only job is to suppress
*heuristic-only* suspicion on genuinely popular sites — an explicit
blocklist or threat-intel match always overrides it.

Vendored snapshot: ``data/popular_domains.txt``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from avs_backend.threat_intel.domains import host_key, registrable_domain

_POPULAR_PATH = Path(__file__).resolve().parent / "data" / "popular_domains.txt"


@lru_cache(maxsize=1)
def _popular() -> frozenset:
    try:
        with open(_POPULAR_PATH, "r", encoding="utf-8") as f:
            return frozenset(line.strip() for line in f if line.strip())
    except OSError:
        return frozenset()


def is_popular(host_or_registrable: str) -> bool:
    """True if the registrable domain is in the top-domains allowlist."""
    registrable = registrable_domain(host_or_registrable)
    return registrable in _popular()


def popular_count() -> int:
    return len(_popular())
