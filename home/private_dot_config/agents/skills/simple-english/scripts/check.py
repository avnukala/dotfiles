#!/usr/bin/env python3
"""Check prose against simple-English rules.

Usage: check.py [file ...]   (reads stdin when no file is given)
Exit 1 on hard violations: contraction, semicolon, paragraph over 6 sentences.
Everything else, including sentences over 30 words, prints as `warn`.

The checker resolves its word list relative to this file. It works from any
supported agent or from a shell.
"""
import re
import sys
from pathlib import Path

REF = Path(__file__).resolve().parent.parent / "reference"
MAX_WORDS, WARN_WORDS, MAX_SENTENCES = 30, 20, 6

KNOWN = {
    w.strip().lower()
    for f in ("ngsl-words.txt",)
    for w in (REF / f).read_text().split()
}
BLOAT = {"leverage", "utilize", "robust", "seamless", "seamlessly", "elegant", "very",
         "really", "just", "quite", "basically", "simply", "insight", "synergy"}
LY_OK = {"only", "early", "family", "apply", "supply", "reply", "rely", "imply", "daily",
         "assembly", "italy", "july", "likely", "ally", "fly", "july", "bully"}
IRREGULAR = ("given|taken|shown|seen|written|broken|chosen|driven|known|made|done|built|"
             "sent|held|kept|found|read|put|got|gotten|lost|left|told|begun|spoken")
NOT_ING = {"nothing", "something", "anything", "everything", "string", "thing", "morning",
           "building", "during", "king", "ring", "spring", "wing", "bring", "sing", "swing"}

CONTRACTION = re.compile(
    r"\b\w+n['’]t\b|\b\w+['’](?:ll|re|ve|d|m)\b|\b(?:it|that|there|here|what|who|he|she|let|how|where)['’]s\b",
    re.I)
PASSIVE = re.compile(rf"\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|{IRREGULAR})\b", re.I)
PERFECT = re.compile(rf"\b(?:has|have|had)\s+(?:\w+ly\s+)?(\w+ed|been|{IRREGULAR})\b", re.I)
PROGRESSIVE = re.compile(r"\b(?:am|is|are|was|were|be|been)\s+(\w{3,}ing)\b", re.I)
TOKEN = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?")
SKIP = "§"  # placeholder for code, URLs, math: counts as a word, never vocab-checked


def known(w: str) -> bool:
    if w in KNOWN:
        return True
    for suffix, cut in (("s", 1), ("es", 2), ("ies", 3), ("ed", 2), ("d", 1), ("ing", 3), ("er", 2), ("ly", 2)):
        if w.endswith(suffix):
            base = w[:-cut]
            if base in KNOWN or base + "e" in KNOWN or (cut == 3 and base + "y" in KNOWN):
                return True
            if len(base) > 2 and base[-1] == base[-2] and base[:-1] in KNOWN:
                return True
    return False


def clean(text: str) -> list[tuple[int, str, bool]]:
    """Return (start_line, paragraph, is_heading) with code, URLs, math, tables removed."""
    text = re.sub(r"\A---\n.*?\n---\n", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r"(```|~~~).*?(\1|\Z)", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r"\$\$.*?\$\$", SKIP, text, flags=re.S)
    text = re.sub(r"`[^`\n]*`|\$[^$\n]+\$|https?://\S+", SKIP, text)
    paras, cur, start = [], [], 0
    def flush():
        nonlocal cur
        if cur:
            paras.append((start, "\n".join(cur), False))
        cur = []
    for n, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if not s or s.startswith("|") or re.fullmatch(r"[-*_]{3,}", s):
            flush()
        elif s.startswith("#"):
            flush()
            paras.append((n, s.lstrip("# "), True))
        elif re.match(r"([-*+]|\d+[.)])\s", s):
            flush()
            cur, start = [re.sub(r"^([-*+]|\d+[.)])\s+", "", s)], n
        else:
            if not cur:
                start = n
            cur.append(s)
    flush()
    return paras


def main(name: str, text: str) -> int:
    hard = soft = 0
    introduced: set[str] = set()
    seen: set[str] = set()

    def report(level: str, line: int, kind: str, msg: str):
        nonlocal hard, soft
        hard += level == "error"
        soft += level == "warn"
        print(f"{name}:{line}: {level} {kind}: {msg}")

    for start, para, heading in clean(text):
        for m in re.finditer(r"\*\*([^*]+)\*\*", para):
            introduced.update(w.lower() for w in TOKEN.findall(m.group(1)))
        para = re.sub(r"\*+|^>\s*", "", para)
        para = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", para)
        flat = re.sub(r"\b(e\.g|i\.e|etc|vs)\.", lambda m: m.group(1).replace(".", ""), para)
        sentences = [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z§\"(\[])", flat) if s.strip()]
        if not heading and len(sentences) > MAX_SENTENCES:
            report("error", start, "paragraph", f"{len(sentences)} sentences, max {MAX_SENTENCES}")
        offset = 0
        for sent in sentences:
            line = start + flat[:flat.find(sent, offset)].count("\n")
            offset = flat.find(sent, offset) + len(sent)
            words = [t for t in sent.split() if re.search(r"[A-Za-z0-9§]", t)]
            if not heading and len(words) > MAX_WORDS:
                report("warn", line, "length", f"{len(words)} words, max {MAX_WORDS}: {sent[:60]}...")
            elif not heading and len(words) > WARN_WORDS:
                report("warn", line, "length", f"{len(words)} words, split if this is an instruction")
            if ";" in sent:
                report("error", line, "semicolon", "write two sentences or add a connector")
            for m in CONTRACTION.finditer(sent):
                report("error", line, "contraction", m.group(0))
            for rx, kind in ((PASSIVE, "passive"), (PERFECT, "perfect tense"), (PROGRESSIVE, "progressive")):
                for m in rx.finditer(sent):
                    if kind == "progressive" and m.group(1).lower() in NOT_ING:
                        continue
                    report("warn", line, kind, m.group(0))
            for first, tok in enumerate(TOKEN.finditer(sent)):
                w = tok.group(0).lower().replace("’", "'")
                if w in BLOAT:
                    report("warn", line, "wording", f"cut or replace: {w}")
                elif w.endswith("ly") and w not in LY_OK:
                    report("warn", line, "adverb", w)
                if w in seen or w in introduced or "'" in w:
                    continue
                raw = tok.group(0)
                prev = sent[:tok.start()].rstrip()
                mid_name = raw[0].isupper() and prev and not prev.endswith((".", "!", "?", ":", "(", '"'))
                if raw.isupper() or mid_name or known(w):
                    continue
                seen.add(w)
                report("warn", line, "vocab", f"{raw} (plain word, bold first use, or keep if exact term)")
    if not hard and not soft:
        print(f"{name}: clean")
    elif not hard:
        print(f"{name}: no hard violations, {soft} warnings to review")
    return 1 if hard else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(main("<stdin>", sys.stdin.read()))
    sys.exit(max(main(a, Path(a).read_text()) for a in args))
