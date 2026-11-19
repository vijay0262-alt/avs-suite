"""Domain utilities — PSL-based registrable domains + URL canonicalisation.

The canonicalisation functions (``canonical_url``, ``host_key``,
``url_hash``, ``host_hash``) are the desktop mirror of
``app/threat_intel/canonical.py`` on the license server — they MUST stay
behaviour-identical or feed hashes will not match.

Registrable-domain extraction uses a compact in-memory form of the vendored
Public Suffix List (``data/public_suffix_list.dat``, MPL-2.0). Longest-match
wins; wildcard (``*.``) and exception (``!``) rules are honoured, which is
what makes private-suffix hosts like ``x.github.io`` resolve correctly.
"""

from __future__ import annotations

import base64
import hashlib
import ipaddress
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_DEFAULT_PORTS = {"http": 80, "https": 443, "ftp": 21}
_URL_TAG = b"u:"
_HOST_TAG = b"h:"

# 6-byte digest prefix (48 bits, base64-encodes to exactly 8 chars) —
# must match the license server's canonical.py.
HASH_BYTES = 6

_DATA_DIR = Path(__file__).resolve().parent / "data"
_PSL_PATH = _DATA_DIR / "public_suffix_list.dat"


# ── Public Suffix List ────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_psl() -> tuple[frozenset, frozenset, frozenset]:
    """Parse the PSL into (exact rules, exceptions, wildcards)."""
    rules: set[str] = set()
    exceptions: set[str] = set()
    wildcards: set[str] = set()
    try:
        with open(_PSL_PATH, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("//"):
                    continue
                if line.startswith("!"):
                    exceptions.add(line[1:].lower())
                elif line.startswith("*."):
                    wildcards.add(line[2:].lower())
                else:
                    rules.add(line.lower())
    except OSError:
        # Packaged builds without data files degrade to the *.* fallback.
        pass
    return frozenset(rules), frozenset(exceptions), frozenset(wildcards)


def _idna(host: str) -> str:
    if not host:
        return host
    try:
        return host.encode("idna").decode("ascii").lower()
    except UnicodeError:
        out = []
        for label in host.split("."):
            try:
                out.append(label.encode("idna").decode("ascii"))
            except UnicodeError:
                continue
        return ".".join(out).lower()


def host_key(host: str) -> str:
    """Canonical host key: lowercase, no trailing dot, punycode, no port."""
    host = (host or "").strip().lower().rstrip(".")
    if not host:
        return ""
    if host.count(":") == 1 and not host.startswith("["):
        maybe_host, _, maybe_port = host.partition(":")
        if maybe_port.isdigit():
            host = maybe_host
    return _idna(host)


def registrable_domain(host: str) -> str:
    """Return the registrable (eTLD+1) domain for a host via the PSL.

    ``a.b.example.co.uk`` → ``example.co.uk``; ``x.github.io`` →
    ``x.github.io`` (github.io is a private suffix). Falls back to the
    last two labels when the PSL data file is unavailable.
    """
    host = host_key(host)
    if not host or is_ip(host):
        return host
    rules, exceptions, wildcards = _load_psl()
    labels = host.split(".")
    if len(labels) <= 1:
        return host

    best = 0  # length (labels) of the longest matching public suffix
    for i in range(len(labels)):
        cand = ".".join(labels[i:])
        if cand in exceptions:
            best = len(labels) - i - 1  # exception: suffix = cand minus leftmost
            break
        if cand in rules:
            best = len(labels) - i
            break
        # Wildcard "*.x" matches "label.x" — check cand's parent.
        parent = ".".join(labels[i + 1:])
        if parent and parent in wildcards:
            best = len(labels) - i
            break
    if best == 0:
        best = 1  # implicit '*' rule: TLD itself is the suffix
    idx = len(labels) - best - 1
    return ".".join(labels[max(0, idx):])


def public_suffix(host: str) -> str:
    """Return the public suffix portion of a host (everything after the
    registrable domain's first label). ``user.github.io`` → ``github.io``."""
    registrable = registrable_domain(host)
    if "." in registrable:
        return registrable.split(".", 1)[1]
    return ""


def is_ip(host: str) -> bool:
    """True if the host is a literal IPv4/IPv6 address."""
    host = (host or "").strip("[]")
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def is_ip_url(url: str) -> bool:
    """True if the URL's host is a literal IP address."""
    return is_ip(host_key_from_url(url))


def host_key_from_url(url: str) -> str:
    canon = canonical_url(url)
    if not canon:
        return ""
    return host_key(urlsplit(canon).hostname or "")


# ── Canonical URL + hashing (mirror of server-side canonical.py) ──────

def canonical_url(raw: str, include_query: bool = True) -> str:
    """Return the canonical URL string, or ``""`` if unparseable."""
    u = (raw or "").strip()
    if not u:
        return ""
    if u.startswith("//"):
        u = "http:" + u  # scheme-relative URL
    elif not _SCHEME_RE.match(u):
        u = "http://" + u
    try:
        sp = urlsplit(u)
        scheme = (sp.scheme or "http").lower()
        host = host_key(sp.hostname or "")
        if not host:
            return ""
        try:
            port = sp.port
        except ValueError:
            port = None
        netloc = host
        if port is not None and port != _DEFAULT_PORTS.get(scheme):
            netloc = f"{host}:{port}"
        path = sp.path or "/"
        out = f"{scheme}://{netloc}{path}"
        if include_query and sp.query:
            out += f"?{sp.query}"
        return out
    except Exception:
        return ""


def url_digest(canonical: str) -> bytes:
    """Raw 6-byte digest of a canonical URL (bundle wire format)."""
    return hashlib.sha256(_URL_TAG + canonical.encode("utf-8")).digest()[:HASH_BYTES]


def host_digest(host: str) -> bytes:
    """Raw 6-byte digest of a host (input normalised via host_key)."""
    host = host_key(host)
    return hashlib.sha256(_HOST_TAG + host.encode("utf-8")).digest()[:HASH_BYTES]


def url_hash(canonical: str) -> str:
    """base64url of :func:`url_digest` — convenience for tests/debug."""
    return base64.urlsafe_b64encode(url_digest(canonical)).decode("ascii")


def host_hash(host: str) -> str:
    """base64url of :func:`host_digest` — convenience for tests/debug."""
    return base64.urlsafe_b64encode(host_digest(host)).decode("ascii")


def url_lookup_digests(raw: str) -> set[bytes]:
    """URL-digest variants to check (full + query-stripped canonical)."""
    digests: set[bytes] = set()
    full = canonical_url(raw, include_query=True)
    if full:
        digests.add(url_digest(full))
        bare = canonical_url(raw, include_query=False)
        if bare != full:
            digests.add(url_digest(bare))
    return digests
