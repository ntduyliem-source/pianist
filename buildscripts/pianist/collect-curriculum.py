"""Q1 entry point. The raw corpus is local tooling data, never a web build input."""
from concurrent.futures import ThreadPoolExecutor
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from curriculum_io import RunLock, download, within, write_json

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "scores/curriculum/sources.lock.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/curriculum-corpus")
    parser.add_argument("--seed", type=Path, default=ROOT / "artifacts/curriculum-research")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--workers", type=int, choices=range(1, 5), default=4,
                        help="Local MXL/metadata inspection processes (default: 4, maximum: 4)")
    args = parser.parse_args()
    lock = json.loads(args.manifest.read_text(encoding="utf-8"))
    if lock["schemaVersion"] != 1:
        raise ValueError("Unsupported manifest")
    args.output = args.output.resolve()
    with RunLock(args.output / ".run.lock"):
        def state(status, **extra):
            write_json(args.output / "run-state.json",
                       {"status": status, "at": datetime.now(timezone.utc).isoformat(), **extra})
        state("downloading")
        def acquire(spec):
            target = within(args.output / "raw", spec["destination"])
            try:
                result = download(spec, target, seed=within(args.seed, spec["seed"]),
                                  offline=args.offline)
                print(f"{spec['id']}: {result['status']}; checksum verified", flush=True)
                return {"id": spec["id"], "path": target.relative_to(args.output).as_posix(), **result}
            except Exception as exc:
                return {"id": spec["id"], "status": "error", "error": str(exc)}
        # Two connections, not one request per tar member.
        with ThreadPoolExecutor(max_workers=2) as pool:
            assets = list(pool.map(acquire, lock["assets"]))
        write_json(args.output / "archive-report.json", {"schemaVersion": 1, "assets": assets})
        if any(a["status"] == "error" for a in assets):
            state("failed", stage="download")
            print(json.dumps(assets, ensure_ascii=True), flush=True)
            return 1
        if not args.download_only:
            from curriculum_catalog import ingest
            state("cataloging")
            try:
                report = ingest(ROOT, args.manifest, args.output, args.seed, args.offline,
                                assets, workers=args.workers)
            except Exception as exc:
                state("failed", stage="catalog", error=f"{type(exc).__name__}: {exc}")
                raise
            state("failed" if report["summary"]["unaccountedRows"] else "complete",
                  report="download-report.json")
            print(json.dumps(report["summary"], ensure_ascii=True), flush=True)
            return 1 if report["summary"]["unaccountedRows"] else 0
        state("archives-ready", report="archive-report.json")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
