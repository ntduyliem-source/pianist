"""Bounded, checksum-pinned IO for the offline curriculum corpus (no app imports)."""
from __future__ import annotations

import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import time
import urllib.error
import urllib.request

CHUNK = 1024 * 1024


class CorpusError(ValueError):
    pass


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8", newline="\n")
    temp.replace(path)


def relative_name(name: str) -> str:
    """Archive names are POSIX paths; reject Windows aliases as well."""
    while name.startswith("./"):
        name = name[2:]
    if not name or name.startswith("/") or "\\" in name or ":" in name or "\0" in name:
        raise CorpusError("unsafe-path")
    parts = name.split("/")
    if any(p in ("", ".", "..") or p.rstrip(" .") != p
           or re.fullmatch(r"(?i)(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?", p)
           for p in parts):
        raise CorpusError("unsafe-path")
    return PurePosixPath(*parts).as_posix()


def within(root: Path, relative: str) -> Path:
    target = root.joinpath(*relative_name(relative).split("/"))
    if not target.resolve().is_relative_to(root.resolve()):
        raise CorpusError("path-outside-corpus")
    return target


def digests(path: Path) -> dict:
    size = path.stat().st_size
    hashes = {"sha256": hashlib.sha256(), "md5": hashlib.md5(),
              "gitBlob": hashlib.sha1(b"blob " + str(size).encode() + b"\0")}
    with path.open("rb") as stream:
        while block := stream.read(CHUNK):
            for h in hashes.values():
                h.update(block)
    return {"bytes": size, **{k: h.hexdigest() for k, h in hashes.items()}}


def matches(result: dict, spec: dict) -> bool:
    return result["bytes"] == spec["bytes"] and all(
        result[k] == v for k, v in spec["checksums"].items())


def download(spec: dict, destination: Path, *, seed: Path | None = None,
             offline=False, retries=4, timeout=45) -> dict:
    """Reuse verified bytes; resume only against the same pinned resource.

    HTTP 200 after Range means restart, never append. Every final file is hashed.
    No size/mtime shortcut is treated as a successful checksum verification.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    received = 0
    resumed = 0
    if destination.is_file():
        result = digests(destination)
        if matches(result, spec):
            return {**result, "status": "reused", "networkBytes": 0, "resumedBytes": 0}
        # Preserve the bad original for inspection; overwrite only our managed cache.
        destination.replace(destination.with_name(destination.name + ".invalid"))
    if seed and seed.is_file():
        result = digests(seed)
        if matches(result, spec):
            temp = destination.with_name(destination.name + ".seed")
            shutil.copyfile(seed, temp)
            temp.replace(destination)
            return {**result, "status": "seeded", "networkBytes": 0, "resumedBytes": 0}
    if offline:
        raise CorpusError("offline-missing-or-checksum-mismatch")
    part = destination.with_name(destination.name + ".part")
    sidecar = destination.with_name(destination.name + ".resume.json")
    identity = {k: spec[k] for k in ("url", "bytes", "checksums")}
    state = {}
    if sidecar.is_file():
        try:
            state = json.loads(sidecar.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    if state.get("identity") != identity or (part.exists() and part.stat().st_size > spec["bytes"]):
        part.unlink(missing_ok=True)
        state = {"identity": identity}
    write_json(sidecar, state)
    last_error = None
    last_progress = time.monotonic()
    for attempt in range(retries):
        try:
            offset = part.stat().st_size if part.exists() else 0
            if offset == spec["bytes"]:
                result = digests(part)
                if not matches(result, spec):
                    part.unlink()
                    raise CorpusError("checksum-mismatch")
                part.replace(destination)
                sidecar.unlink(missing_ok=True)
                return {**result, "status": "downloaded", "networkBytes": received,
                        "resumedBytes": resumed}
            headers = {"User-Agent": "Pianist offline curriculum collector/1.0",
                       "Accept-Encoding": "identity"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
                if state.get("validator"):
                    headers["If-Range"] = state["validator"]
            with urllib.request.urlopen(urllib.request.Request(spec["url"], headers=headers),
                                        timeout=timeout) as response:
                if response.headers.get("Content-Encoding", "identity") != "identity":
                    raise CorpusError("unexpected-content-encoding")
                if response.status == 206:
                    content_range = response.headers.get("Content-Range", "")
                    match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
                    if not match or int(match[1]) != offset or int(match[3]) != spec["bytes"]:
                        raise CorpusError("invalid-content-range")
                    end = int(match[2])
                    if end < offset or end >= spec["bytes"]:
                        raise CorpusError("invalid-content-range")
                    expected_response_bytes = end - offset + 1
                    resumed = max(resumed, offset)
                elif response.status == 200:
                    offset = 0
                    expected_response_bytes = spec["bytes"]
                else:
                    raise CorpusError(f"unexpected-http-{response.status}")
                length = response.headers.get("Content-Length")
                if length is not None and int(length) != expected_response_bytes:
                    raise CorpusError("content-length-mismatch")
                state["validator"] = response.headers.get("ETag") or response.headers.get("Last-Modified")
                write_json(sidecar, state)
                count = 0
                with part.open("ab" if offset else "wb") as output:
                    while block := response.read(CHUNK):
                        count += len(block)
                        received += len(block)
                        if count > expected_response_bytes:
                            raise CorpusError("response-exceeds-pinned-size")
                        output.write(block)
                        if time.monotonic() - last_progress > 15:
                            print(f"{destination.name}: {offset + count:,}/{spec['bytes']:,} bytes",
                                  flush=True)
                            last_progress = time.monotonic()
                if count != expected_response_bytes:
                    raise CorpusError("incomplete-response")
            if part.stat().st_size == spec["bytes"]:
                result = digests(part)
                if not matches(result, spec):
                    part.unlink()
                    raise CorpusError("checksum-mismatch")
                part.replace(destination)
                sidecar.unlink(missing_ok=True)
                return {**result, "status": "downloaded", "networkBytes": received,
                        "resumedBytes": resumed}
            raise CorpusError("partial-response")
        except (OSError, ValueError, urllib.error.URLError, http.client.HTTPException) as exc:
            last_error = exc
            print(f"{destination.name}: attempt {attempt + 1}/{retries}: {exc}", flush=True)
            if attempt + 1 < retries:
                time.sleep(min(2 ** attempt, 8))
    raise CorpusError(f"download-failed: {last_error}")


class RunLock:
    """OS-held lock releases on crashes too, unlike a stale PID sentinel."""
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.stream = path.open("a+b")
        self.stream.seek(0, os.SEEK_END)
        if not self.stream.tell():
            self.stream.write(b"\0")
            self.stream.flush()
        self.stream.seek(0)

    def __enter__(self):
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.stream.close()
            raise CorpusError("another-corpus-run-is-active") from exc
        return self

    def __exit__(self, *_):
        self.stream.close()
