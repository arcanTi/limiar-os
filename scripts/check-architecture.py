#!/usr/bin/env python3
"""Fail CI when source dependencies cross the repository's layer boundaries."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
violations: list[str] = []


def check_files(folder: Path, forbidden: tuple[str, ...], label: str) -> None:
    for path in sorted(folder.rglob("*")):
        if path.suffix not in {".py", ".js", ".ts"} or "__pycache__" in path.parts:
            continue
        source = path.read_text(encoding="utf-8")
        for pattern in forbidden:
            if re.search(pattern, source):
                violations.append(f"{path.relative_to(ROOT)}: {label} ({pattern})")


check_files(
    ROOT / "backend" / "domain",
    (r"fastapi|starlette", r"from \.\.(application|repositories|routers|services|db)\b"),
    "domain must not depend on outer layers",
)
check_files(
    ROOT / "backend" / "application",
    (r"fastapi|starlette", r"from \.\.(repositories|routers|services|db|dependencies)\b"),
    "application must depend on ports, not adapters",
)
check_files(
    ROOT / "backend" / "repositories",
    (r"fastapi|starlette", r"from \.\.?routers\b"),
    "repositories must be transport-independent",
)
check_files(
    ROOT / "backend" / "services",
    (r"from \.\.db\b", r"from \.\.repositories\b"),
    "cross-transport services must depend on application boundaries",
)
check_files(
    ROOT / "frontend" / "src" / "domain",
    (r"(?:\.\./)+(?:application|infrastructure|ui|pages)/",),
    "frontend domain must not import outer layers",
)
check_files(
    ROOT / "frontend" / "src" / "application",
    (r"(?:\.\./)+(?:infrastructure|ui|pages)/",),
    "frontend application must not import adapters or UI",
)
check_files(
    ROOT / "frontend" / "src" / "ui",
    (r"(?:\.\./)+infrastructure/",),
    "UI receives infrastructure through the composition root",
)

# HTTP routers are transport adapters and may not execute persistence directly.
for path in sorted((ROOT / "backend" / "routers").glob("*.py")):
    source = path.read_text(encoding="utf-8")
    if "conn.execute" in source or re.search(r"from \.\.db\b", source):
        violations.append(f"{path.relative_to(ROOT)}: router executes persistence directly")

asgi_source = (ROOT / "backend" / "asgi.py").read_text(encoding="utf-8")
if re.search(r"from \.repositories\b", asgi_source):
    violations.append("backend/asgi.py: ASGI transport imports a repository directly")

if violations:
    sys.exit("architecture boundary violations:\n- " + "\n- ".join(violations))
print("architecture boundaries: ok")
