#!/usr/bin/env python3
"""Trava o numero de achados do ruff para que a divida pare de crescer.

O projeto carrega 330 achados (a maioria E501). Ligar o ruff em modo bloqueante
pararia todo commit ate que os 330 fossem resolvidos, e congelar sem medir
deixaria a divida crescer em silencio — foi o que aconteceu: o comentario no
`.github/workflows/ci.yml` falava em 233 achados quando o numero real ja era 330.

Este script compara a contagem atual com a baseline versionada:

    python3 scripts/ruff-baseline.py           # falha se passar da baseline
    python3 scripts/ruff-baseline.py --update  # grava a contagem atual

Baixar a baseline e sempre bem-vindo; subir exige passar por aqui de proposito.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_FILE = ROOT / "scripts" / "ruff-baseline.json"
TARGETS = ("backend", "scripts")


def current_count() -> int:
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "ruff", "check", "--output-format=json", *TARGETS],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    if result.returncode not in (0, 1):
        sys.exit(f"ruff falhou:\n{result.stderr}")
    return len(json.loads(result.stdout or "[]"))


def read_baseline() -> int:
    if not BASELINE_FILE.exists():
        sys.exit(f"baseline ausente: {BASELINE_FILE} (rode com --update)")
    return int(json.loads(BASELINE_FILE.read_text(encoding="utf-8"))["max_findings"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update", action="store_true", help="grava a contagem atual como baseline",
    )
    args = parser.parse_args()

    count = current_count()

    if args.update:
        BASELINE_FILE.write_text(
            json.dumps({"max_findings": count, "targets": list(TARGETS)}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"baseline gravada: {count} achados")
        return

    baseline = read_baseline()
    if count > baseline:
        sys.exit(
            f"ruff subiu de {baseline} para {count} achados.\n"
            f"Resolva os novos ou, se forem intencionais, rode:\n"
            f"  python3 scripts/ruff-baseline.py --update",
        )
    if count < baseline:
        print(f"ruff caiu de {baseline} para {count} — atualize a baseline com --update")
        return
    print(f"ruff estavel em {count} achados (baseline {baseline})")


if __name__ == "__main__":
    main()
