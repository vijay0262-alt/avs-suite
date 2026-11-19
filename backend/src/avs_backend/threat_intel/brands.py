"""Brand registry for impersonation and lookalike detection.

Each brand maps to the set of legitimate *registrable* domains. A host
whose registrable domain is in this set (or is a subdomain of one — e.g.
``support.paypal.com`` → ``paypal.com``) is treated as legitimate for
that brand.

``allow_cc`` brands additionally accept ``brand.<cc>``,
``brand.com.<cc>`` and ``brand.co.<cc>`` where ``<cc>`` is a two-letter
country code (amazon.co.uk, google.de, …). This is deliberately
constrained to well-known second-level patterns so ``paypal.xyz`` never
qualifies.

Detection semantics (see lookalike.py): a brand token must be an actual
hostname label or hyphen-separated token — ``pineapple.com`` can no
longer match ``apple`` because token matching is used instead of raw
substring search.
"""

from __future__ import annotations

BRANDS: dict[str, dict] = {
    "paypal": {
        "domains": {"paypal.com", "paypal.me", "paypalobjects.com", "paypal.com.br"},
        "allow_cc": True,
    },
    "google": {
        "domains": {
            "google.com", "gmail.com", "youtube.com", "googleapis.com",
            "googleusercontent.com", "gstatic.com", "googlevideo.com",
            "withgoogle.com", "googlesource.com", "blogger.com",
        },
        "allow_cc": True,
    },
    "microsoft": {
        "domains": {
            "microsoft.com", "microsoftonline.com", "office.com",
            "office365.com", "live.com", "outlook.com", "windows.com",
            "msn.com", "bing.com", "xbox.com", "azure.com",
            "windowsazure.com", "sharepoint.com", "microsoftstore.com",
        },
        "allow_cc": True,
    },
    "apple": {
        "domains": {"apple.com", "icloud.com", "itunes.com", "apple-dns.net", "mzstatic.com"},
        "allow_cc": True,
    },
    "amazon": {
        "domains": {
            "amazon.com", "amazonaws.com", "aws.amazon.com",
            "amazonvideo.com", "primevideo.com", "audible.com",
        },
        "allow_cc": True,
    },
    "facebook": {
        "domains": {"facebook.com", "fb.com", "fb.me", "fbcdn.net", "messenger.com", "meta.com"},
        "allow_cc": False,
    },
    "instagram": {
        "domains": {"instagram.com", "cdninstagram.com", "instagr.am"},
        "allow_cc": False,
    },
    "whatsapp": {
        "domains": {"whatsapp.com", "whatsapp.net", "wa.me"},
        "allow_cc": False,
    },
    "twitter": {
        "domains": {"twitter.com", "x.com", "t.co", "twimg.com"},
        "allow_cc": False,
    },
    "linkedin": {
        "domains": {"linkedin.com", "licdn.com", "lnkd.in"},
        "allow_cc": False,
    },
    "netflix": {
        "domains": {"netflix.com", "nflxvideo.net", "nflximg.net", "nflxso.net", "nflxext.com"},
        "allow_cc": False,
    },
    "spotify": {
        "domains": {"spotify.com", "scdn.co", "spotilocal.com"},
        "allow_cc": False,
    },
    "dropbox": {
        "domains": {"dropbox.com", "dropboxusercontent.com", "dropboxstatic.com"},
        "allow_cc": False,
    },
    "github": {
        "domains": {"github.com", "githubusercontent.com", "github.io", "githubassets.com", "githubapp.com"},
        "allow_cc": False,
    },
    "steam": {
        "domains": {"steampowered.com", "steamcommunity.com", "steamstatic.com", "steamgames.com"},
        "allow_cc": False,
    },
    "ebay": {
        "domains": {"ebay.com", "ebaystatic.com", "ebayimg.com"},
        "allow_cc": True,
    },
    "chase": {
        "domains": {"chase.com", "jpmorgan.com", "jpmorganchase.com"},
        "allow_cc": False,
    },
    "bankofamerica": {
        "domains": {"bankofamerica.com", "bofa.com", "ml.com"},
        "allow_cc": False,
    },
    "wellsfargo": {
        "domains": {"wellsfargo.com", "wf.com"},
        "allow_cc": False,
    },
    "citibank": {
        "domains": {"citibank.com", "citi.com", "citigroup.com"},
        "allow_cc": False,
    },
    "usps": {
        "domains": {"usps.com"},
        "allow_cc": False,
    },
    "fedex": {
        "domains": {"fedex.com"},
        "allow_cc": True,
    },
    "dhl": {
        "domains": {"dhl.com", "dhlexpress.com"},
        "allow_cc": True,
    },
    "ups": {
        "domains": {"ups.com"},
        "allow_cc": False,
    },
    "irs": {
        "domains": {"irs.gov"},
        "allow_cc": False,
    },
    "coinbase": {
        "domains": {"coinbase.com", "cbhq.net"},
        "allow_cc": False,
    },
    "binance": {
        "domains": {"binance.com", "binance.us", "bnbstatic.com"},
        "allow_cc": False,
    },
    "adobe": {
        "domains": {"adobe.com", "adobecreativecloud.com", "adobecc.com", "behance.net"},
        "allow_cc": False,
    },
    "zoom": {
        "domains": {"zoom.us", "zoom.com"},
        "allow_cc": False,
    },
    "discord": {
        "domains": {"discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media"},
        "allow_cc": False,
    },
    "telegram": {
        "domains": {"telegram.org", "t.me", "telegram.me", "tdesktop.com"},
        "allow_cc": False,
    },
    "tiktok": {
        "domains": {"tiktok.com", "tiktokv.com", "tiktokcdn.com", "musical.ly"},
        "allow_cc": False,
    },
    "roblox": {
        "domains": {"roblox.com", "rbxcdn.com"},
        "allow_cc": False,
    },
    "epicgames": {
        "domains": {"epicgames.com", "unrealengine.com", "fortnite.com"},
        "allow_cc": False,
    },
    "norton": {
        "domains": {"norton.com", "nortonlifelock.com", "lifelock.com"},
        "allow_cc": False,
    },
    "mcafee": {
        "domains": {"mcafee.com"},
        "allow_cc": False,
    },
    "avast": {
        "domains": {"avast.com", "avg.com", "ccleaner.com"},
        "allow_cc": False,
    },
    "avsshield": {
        "domains": {"avsshield.com"},
        "allow_cc": False,
    },
    "cashapp": {
        "domains": {"cash.app", "squareup.com", "square.com"},
        "allow_cc": False,
    },
    "venmo": {
        "domains": {"venmo.com"},
        "allow_cc": False,
    },
    "zelle": {
        "domains": {"zellepay.com"},
        "allow_cc": False,
    },
    "walmart": {
        "domains": {"walmart.com", "wal.co"},
        "allow_cc": False,
    },
    "costco": {
        "domains": {"costco.com"},
        "allow_cc": True,
    },
    "att": {
        "domains": {"att.com"},
        "allow_cc": False,
    },
    "verizon": {
        "domains": {"verizon.com", "verizonwireless.com"},
        "allow_cc": False,
    },
    "tmobile": {
        "domains": {"t-mobile.com", "tmobile.com"},
        "allow_cc": False,
    },
    "comcast": {
        "domains": {"comcast.com", "xfinity.com"},
        "allow_cc": False,
    },
    "openai": {
        "domains": {"openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com"},
        "allow_cc": False,
    },
    "nvidia": {
        "domains": {"nvidia.com"},
        "allow_cc": False,
    },
}


def is_legitimate_for_brand(brand: str, registrable: str) -> bool:
    """True if ``registrable`` is an official domain for ``brand``.

    Handles the ``allow_cc`` two-letter ccTLD allowance:
    ``brand.co.uk``, ``brand.com.br``, ``brand.de``.
    """
    info = BRANDS.get(brand)
    if not info or not registrable:
        return False
    if registrable in info["domains"]:
        return True
    if info.get("allow_cc"):
        labels = registrable.split(".")
        if len(labels) >= 2 and labels[0] == brand and len(labels[-1]) == 2:
            # brand.<cc>, brand.com.<cc>, brand.co.<cc>
            middle = labels[1:-1]
            if all(part in {"com", "co", "org", "net"} for part in middle):
                return True
    return False


def any_legitimate(registrable: str) -> str | None:
    """Return the brand name if ``registrable`` is an official domain."""
    for brand in BRANDS:
        if is_legitimate_for_brand(brand, registrable):
            return brand
    return None
