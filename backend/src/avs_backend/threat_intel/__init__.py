"""Threat-intel client package for AVS Scam Shield.

Local, offline-first URL/domain intelligence:

  * ``domains``   — Public Suffix List parsing, registrable-domain
    extraction, and the canonical URL scheme shared with the license
    server's bundle builder (``app/threat_intel/canonical.py``).
  * ``brands``    — brand registry with legitimate domains.
  * ``lookalike`` — typosquat / homoglyph / combosquat detection.
  * ``allowlist`` — top-20k popular registrable domains (suppresses
    heuristic-only false positives on real sites).
  * ``store``     — signed threat-intel bundle cache + sync client.

Everything is stdlib + ``cryptography`` (already a dependency); no new
packages are required.
"""
