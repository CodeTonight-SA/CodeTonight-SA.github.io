#!/usr/bin/env python3
"""Static checks for the CodeTonight home page.

Run:  python3 verify/check_site.py            (from the repo root)
Exit: 0 when every check passes, 1 otherwise. Standard library only.

Each check names the rule it enforces. The design rules come from the
Swiss Nihilism design language (system fonts, one orange accent, no
gradients, no shadows except the terminal, sharp corners). The URL rules
keep every fragment link that has ever been published working.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "main.js").read_text(encoding="utf-8")
SITEMAP = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
ROBOTS = (ROOT / "robots.txt").read_text(encoding="utf-8")

# Every id that has ever been linked from outside this page. Removing one
# breaks a link somewhere we cannot see, so all of them must survive.
LEGACY_IDS = [
    "main-content", "hero", "engine", "happi", "grasp", "open-work",
    "flagships", "pro-bono", "not-do", "team", "contact", "cta",
    "email", "interest", "message",
]
# The moat sections this rebuild adds.
NEW_IDS = ["moat", "legs", "break", "continuity", "honesty"]

# Phrases the page promises never to use (they appear once, struck through,
# inside the ban list itself).
BANNED = [
    "enterprise-grade", "load-bearing", "leverage", "synergy", "cutting-edge",
    "next-generation", "game-changing", "world-class", "empower", "supercharge",
    "seamless", "AI-powered", "trusted by industry leaders",
    "digital transformation",
]

EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]"
)

failures: list[str] = []


def check(ok: bool, name: str) -> None:
    print(("PASS " if ok else "FAIL ") + name)
    if not ok:
        failures.append(name)


def outside_ban_chips(html: str) -> str:
    return re.sub(r'<span class="ban-chip">.*?</span>', "", html, flags=re.S)


# --- Law 1: system fonts, never a web font -------------------------------
for name, text in (("index.html", INDEX), ("style.css", CSS), ("main.js", JS)):
    check(not re.search(r"fonts\.googleapis|fonts\.gstatic", text),
          f"no Google Fonts link in {name}")
    check(not re.search(r"['\"]Inter['\"]|JetBrains", text),
          f"no Inter / JetBrains Mono in {name}")

# --- Law 3 and Law 6: one accent, no gradients, shadow only on the terminal
check(not re.search(r"linear-gradient|radial-gradient", INDEX + CSS),
      "no CSS gradients")
shadow_lines = [ln for ln in CSS.splitlines() if "box-shadow" in ln]
check(all("terminal" in ln for ln in shadow_lines),
      "box-shadow only on the terminal panel")
radius_lines = [ln for ln in CSS.splitlines()
                if "border-radius" in ln and "border-radius: 0" not in ln]
check(all(re.search(r"dot|badge", ln) for ln in radius_lines),
      "border-radius only on status dots and badges")
check("data-theme" not in INDEX, "no multi-theme engine (one palette)")

# --- Law 7 / a11y holds ---------------------------------------------------
check(INDEX.count("<h1") == 1, "exactly one h1")
check('role="banner"' in INDEX and 'role="main"' in INDEX
      and 'role="contentinfo"' in INDEX, "banner / main / contentinfo landmarks")
check('href="#main-content"' in INDEX, "skip link targets #main-content")
check("prefers-reduced-motion" in CSS, "prefers-reduced-motion honoured")
check("@media print" in CSS, "print stylesheet present")
check("focus-visible" in CSS, "focus-visible outline defined")

# --- URLs that must keep working -----------------------------------------
for i in LEGACY_IDS:
    check(f'id="{i}"' in INDEX, f"legacy id #{i} present")
for i in NEW_IDS:
    check(f'id="{i}"' in INDEX, f"moat id #{i} present")
check('action="https://formspree.io/f/mrbnkdjd"' in INDEX,
      "contact form still posts to the same Formspree endpoint")
check("grasp-chi.vercel.app" not in INDEX.replace("grasp-web-chi.vercel.app", ""),
      "never references grasp-chi.vercel.app (a stranger's site)")

# --- Copy rules ------------------------------------------------------------
body = outside_ban_chips(INDEX)
for phrase in BANNED:
    check(phrase.lower() not in body.lower(), f"banned phrase absent: {phrase}")
check(not EMOJI.search(INDEX), "no emoji in the page")
check("HAPPI/1.4" in INDEX and "HAPPI/1.3 --" not in INDEX,
      "HAPPI version label is 1.4")

# --- One host across sitemap, robots and canonical -----------------------
hosts = set(re.findall(r"https://([a-z0-9.-]+)/(?:sitemap\.xml)?", SITEMAP + ROBOTS))
canon = re.search(r'rel="canonical" href="https://([a-z0-9.-]+)/"', INDEX)
og = re.search(r'property="og:url" content="https://([a-z0-9.-]+)/"', INDEX)
check(canon is not None and og is not None
      and hosts == {canon.group(1)} and og.group(1) == canon.group(1),
      "sitemap, robots, canonical and og:url agree on one host")
cname = ROOT / "CNAME"
if cname.exists():
    check(canon is not None and cname.read_text().strip() == canon.group(1),
          "CNAME matches the canonical host")
check("<lastmod>" in SITEMAP, "sitemap carries lastmod")

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("all checks passed")
