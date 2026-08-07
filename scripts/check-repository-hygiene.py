#!/usr/bin/env python3
"""Reject generated, local, sensitive, or assistant-owned repository files."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path, PurePosixPath
from shutil import which

ROOT = Path(__file__).resolve().parent.parent
MAX_TRACKED_BYTES = 10 * 1024 * 1024
GIT = which("git")
if GIT is None:
    message = "git executable not found"
    raise RuntimeError(message)

FORBIDDEN_PARTS = {
    ".agents",
    ".claude",
    "__pycache__",
    "dist",
    "graphify-out",
    "node_modules",
    "uploads",
}
FORBIDDEN_NAMES = {
    ".DS_Store",
    "CLAUDE.md",
    "skills-lock.json",
    "tailwind-sheet.css",
}
DATABASE_SUFFIXES = (".db", ".db-shm", ".db-wal")


def git(*args: str) -> str:
    result = subprocess.run(  # noqa: S603 - executable and arguments are internal constants
        (GIT, *args),
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def tracked_paths() -> list[PurePosixPath]:
    return [PurePosixPath(value) for value in git("ls-files").splitlines() if value]


def path_problem(path: PurePosixPath) -> str | None:
    lowered = path.as_posix().lower()
    if "claude" in lowered:
        return "Claude-owned path"
    if path.name in FORBIDDEN_NAMES:
        return "local or generated file"
    if FORBIDDEN_PARTS.intersection(path.parts):
        return "local or generated directory"
    if path.name.startswith(".env") and path.name != ".env.example":
        return "environment/secrets file"
    if lowered.endswith(DATABASE_SUFFIXES) or ".db.bak-" in lowered:
        return "runtime database"
    if path.suffix in {".pyc", ".pyo"}:
        return "Python bytecode"
    return None


def conflict_markers() -> list[str]:
    result = subprocess.run(  # noqa: S603 - executable and arguments are internal constants
        (
            GIT,
            "grep",
            "-n",
            "-E",
            r"^(<<<<<<< .+|=======|>>>>>>> .+)$",
            "--",
            ":(exclude)frontend/package-lock.json",
        ),
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode not in {0, 1}:
        raise RuntimeError(result.stderr.strip() or "git grep failed")
    return result.stdout.splitlines()


def main() -> int:
    violations: list[str] = []
    for path in tracked_paths():
        problem = path_problem(path)
        if problem:
            violations.append(f"{path}: {problem}")
            continue
        absolute = ROOT / path.as_posix()
        if absolute.is_file() and absolute.stat().st_size > MAX_TRACKED_BYTES:
            violations.append(
                f"{path}: tracked file exceeds {MAX_TRACKED_BYTES // (1024 * 1024)} MiB"
            )

    ignored_tracked = git("ls-files", "-ci", "--exclude-standard").splitlines()
    violations.extend(f"{path}: tracked but ignored" for path in ignored_tracked)
    violations.extend(f"{match}: unresolved merge marker" for match in conflict_markers())

    if violations:
        print("repository hygiene violations:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1

    print("repository hygiene: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
