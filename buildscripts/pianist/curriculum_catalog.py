"""Offline source inventory. Q1 checks containers/XML, never assigns a grade."""
from __future__ import annotations

from collections import Counter
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import multiprocessing
from pathlib import Path
import sqlite3
import stat
import tarfile
import urllib.parse
import zipfile

from defusedxml import ElementTree as ET

from curriculum_io import CorpusError, digests, download, relative_name, within, write_json

VALIDATOR_VERSION = 1


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def blob(output: Path, data: bytes, kind: str) -> dict:
    digest = hashlib.sha256(data).hexdigest()
    relative = f"raw/objects/{digest[:2]}/{digest}.{kind}"
    target = within(output, relative)
    if not target.is_file() or digests(target)["sha256"] != digest:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(target.name + ".tmp")
        temp.write_bytes(data)
        temp.replace(target)
    return {"status": "stored", "sha256": digest, "bytes": len(data), "path": relative}


def extract_selected(archive: Path, output: Path, wanted: set[str], archive_sha: str,
                     kind: str, limits: dict) -> dict:
    """Stream a verified tar; store only requested regular files by content hash.

    Receipts are an optimization, not trust: verify every referenced file again.
    A corrupt/missing cached blob triggers a complete safe rescan of the archive.
    """
    wanted = {relative_name(p) for p in wanted}
    receipt_path = output / f"{kind}-extraction.json"
    identity = {"archiveSha256": archive_sha, "selectionSha256":
                hashlib.sha256(encoded(sorted(wanted)).encode()).hexdigest(),
                "limits": limits, "version": VALIDATOR_VERSION}
    if receipt_path.is_file():
        try:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            if receipt["identity"] == identity and set(receipt["entries"]) == wanted:
                def verify_item(item):
                    if item["status"] == "stored":
                        checked = digests(within(output, item["path"]))
                        if checked["sha256"] != item["sha256"] or checked["bytes"] != item["bytes"]:
                            raise CorpusError("cached-extraction-checksum-mismatch")
                with ThreadPoolExecutor(max_workers=8) as pool:
                    for _ in pool.map(verify_item, receipt["entries"].values()):
                        pass
                return {**receipt, "mode": "reused"}
        except (OSError, ValueError, KeyError):
            pass
    entries, seen = {}, set()
    members = total = 0
    max_file = limits["maxMxlBytes" if kind == "mxl" else "maxMetadataBytes"]
    with tarfile.open(archive, "r|gz") as tar:
        for member in tar:
            members += 1
            if members > limits["maxTarMembers"]:
                raise CorpusError("too-many-tar-members")
            # A directory's terminal slash is harmless. No links/devices are used.
            name = relative_name(member.name.rstrip("/") if member.isdir() else member.name)
            if member.isdir():
                continue
            if not member.isfile():
                raise CorpusError("non-regular-tar-member")
            total += member.size
            if total > limits["maxTarExpandedBytes"] or member.size < 0:
                raise CorpusError("tar-expanded-size-limit")
            if name not in wanted:
                continue
            if name in seen:
                raise CorpusError("duplicate-selected-tar-member")
            seen.add(name)
            if member.size > max_file:
                entries[name] = {"status": "rejected", "error": "member-size-limit"}
                continue
            stream = tar.extractfile(member)
            if stream is None:
                raise CorpusError("unreadable-tar-member")
            data = stream.read(max_file + 1)
            if len(data) != member.size:
                raise CorpusError("truncated-tar-member")
            entries[name] = blob(output, data, kind if kind == "mxl" else "json")
            if len(entries) % 5000 == 0:
                print(f"{kind}: extracted {len(entries):,}/{len(wanted):,}", flush=True)
    for name in wanted - entries.keys():
        entries[name] = {"status": "missing", "error": "archive-member-missing"}
    receipt = {"identity": identity, "membersScanned": members,
               "expandedBytesScanned": total, "entries": entries}
    write_json(receipt_path, receipt)
    return {**receipt, "mode": "extracted"}


def inspect_mxl(data: bytes, limits: dict) -> dict:
    """ZIP integrity and well-formed MusicXML only, not schema/musical validity."""
    if len(data) > limits["maxMxlBytes"]:
        raise CorpusError("mxl-size-limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        items = archive.infolist()
        if len(items) > limits["maxZipEntries"]:
            raise CorpusError("zip-entry-limit")
        if sum(item.file_size for item in items) > limits["maxZipExpandedBytes"]:
            raise CorpusError("zip-expanded-size-limit")
        names = {}
        for item in items:
            name = relative_name(item.filename.rstrip("/") if item.is_dir() else item.filename)
            if name in names:
                raise CorpusError("duplicate-zip-path")
            names[name] = item
            if stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
                raise CorpusError("zip-link-or-encrypted")
        container_name = "META-INF/container.xml"
        if container_name not in names:
            raise CorpusError("mxl-container-missing")

        def read_xml(name):
            entry = names.get(name)
            if entry is None or entry.is_dir():
                raise CorpusError("mxl-rootfile-missing")
            if entry.file_size > limits["maxXmlBytes"]:
                raise CorpusError("xml-size-limit")
            return ET.fromstring(archive.read(entry), forbid_entities=True, forbid_external=True)

        container = read_xml(container_name)
        roots = [e.attrib.get("full-path", "") for e in container.iter()
                 if e.tag.rsplit("}", 1)[-1] == "rootfile"
                 and e.attrib.get("media-type", "application/vnd.recordare.musicxml+xml")
                 == "application/vnd.recordare.musicxml+xml"]
        if not roots:
            raise CorpusError("mxl-rootfile-missing")
        score = read_xml(relative_name(roots[0]))
        root_kind = score.tag.rsplit("}", 1)[-1]
        if root_kind not in ("score-partwise", "score-timewise"):
            raise CorpusError("not-a-musicxml-score")
        # Removing namespaces in this disposable inspection tree changes no source bytes.
        for e in score.iter():
            e.tag = e.tag.rsplit("}", 1)[-1]
        parts = []
        for part in score.findall("./part-list/score-part"):
            parts.append({"id": part.get("id", ""), "name": part.findtext("part-name", ""),
                          "instruments": [e.text or "" for e in part.findall("./score-instrument/instrument-name")],
                          "midiPrograms": [e.text or "" for e in part.findall("./midi-instrument/midi-program")]})
        if not parts or not (score.findall("part") or score.findall("measure")):
            raise CorpusError("empty-score-structure")
        bad_crc = archive.testzip()
        if bad_crc:
            raise CorpusError("zip-crc-mismatch")
        # Program 1 alone is not evidence of a piano arrangement.
        piano_names = [p["id"] for p in parts if any(
            word in " ".join([p["name"], *p["instruments"]]).casefold()
            for word in ("piano", "klavier", "pianoforte"))]
        return {"root": root_kind, "parts": parts, "explicitPianoPartIds": piano_names,
                "validation": "container-and-xml-only", "musicValidation": "pending-q2"}


def open_catalog(path: Path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS files (
        sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL, path TEXT NOT NULL,
        format TEXT NOT NULL, container_status TEXT NOT NULL,
        inspection_json TEXT NOT NULL, error TEXT, validator_version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS origins (
        id TEXT PRIMARY KEY, collection TEXT NOT NULL, revision TEXT NOT NULL,
        source_path TEXT NOT NULL, source_url TEXT NOT NULL, title TEXT NOT NULL,
        composer TEXT NOT NULL, license_id TEXT NOT NULL, license_url TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK(visibility IN ('public-approved','personal','pending-review')),
        file_sha256 TEXT REFERENCES files(sha256), download_status TEXT NOT NULL,
        extraction_status TEXT NOT NULL, metadata_status TEXT NOT NULL,
        metadata_path TEXT, metadata_sha256 TEXT, parse_status TEXT NOT NULL,
        rejection_json TEXT NOT NULL, csv_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS origins_file ON origins(file_sha256);
      CREATE INDEX IF NOT EXISTS origins_collection ON origins(collection);
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY, at TEXT NOT NULL, manifest_sha256 TEXT NOT NULL,
        summary_json TEXT NOT NULL);
      CREATE VIEW IF NOT EXISTS review_queue AS
        SELECT origins.*, files.path AS mxl_path, files.container_status, files.inspection_json
        FROM origins JOIN files ON file_sha256=sha256
        WHERE container_status='valid' AND metadata_status IN ('verified','not-applicable');
    """)
    return db


def validator_key(limits):
    return f"{VALIDATOR_VERSION}:{hashlib.sha256(encoded(limits).encode()).hexdigest()}"


def inspect_file(output, item, limits):
    try:
        inspection = inspect_mxl(within(output, item["path"]).read_bytes(), limits)
        return "valid", inspection, None
    except Exception as exc:
        return "invalid", {}, f"{type(exc).__name__}: {exc}"


def register_file(db, output, item, limits, checked: set, prepared=None):
    sha = item["sha256"]
    key = validator_key(limits)
    if sha not in checked:
        existing = db.execute("SELECT * FROM files WHERE sha256=?", (sha,)).fetchone()
        # Caller has rehashed the bytes; a prior inspection of the SAME bytes can be reused.
        if existing is None or existing["validator_version"] != key:
            status, inspection, error = prepared or inspect_file(output, item, limits)
            db.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?)",
                       (sha, item["bytes"], item["path"], "mxl", status,
                        encoded(inspection), error, key))
        checked.add(sha)
    return db.execute("SELECT * FROM files WHERE sha256=?", (sha,)).fetchone()


def save_origin(db, row):
    columns = ("id collection revision source_path source_url title composer license_id license_url "
               "visibility file_sha256 download_status extraction_status metadata_status metadata_path "
               "metadata_sha256 parse_status rejection_json csv_json").split()
    db.execute(f"INSERT OR REPLACE INTO origins ({','.join(columns)}) VALUES "
               f"({','.join('?' for _ in columns)})", [row.get(c) for c in columns])


def base_origin(collection, revision, path, **kwargs):
    return {"id": f"{collection}:{path}", "collection": collection, "revision": revision,
            "source_path": path, "source_url": "", "title": "", "composer": "",
            "license_id": "unknown", "license_url": "", "visibility": "pending-review",
            "file_sha256": None, "download_status": "pending", "extraction_status": "pending",
            "metadata_status": "not-applicable", "metadata_path": None, "metadata_sha256": None,
            "parse_status": "pending-q2", "rejection_json": "[]", "csv_json": "{}", **kwargs}


def apply_file(db, output, row, item, limits, checked, prepared=None):
    if item["status"] != "stored":
        row.update(extraction_status=item["status"], parse_status="blocked",
                   rejection_json=encoded([item.get("error", "source-unavailable")]))
        return
    info = register_file(db, output, item, limits, checked, prepared)
    row.update(file_sha256=item["sha256"])
    if info["container_status"] != "valid":
        row.update(parse_status="blocked", rejection_json=encoded([info["error"]]))


def pdmx_candidates(path: Path, config: dict):
    counts = Counter()
    candidates = []
    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {*config["filter"], "mxl", "metadata", "path", "license", "license_url"}
        if not required.issubset(reader.fieldnames or []):
            raise CorpusError("pdmx-csv-columns-changed")
        for index, row in enumerate(reader, 2):
            counts["allRows"] += 1
            if row["subset:no_license_conflict"] != "True":
                continue
            counts["noLicenseConflict"] += 1
            if row["subset:all_valid"] != "True":
                continue
            counts["alsoAllValid"] += 1
            if row["subset:deduplicated"] != "True":
                continue
            counts["alsoDeduplicated"] += 1
            if not all(row.get(k) == value for k, value in config["filter"].items()):
                continue
            row["_csvLine"] = index
            # Fail closed on a changed inventory, not on a single malformed score.
            for key in ("path", "mxl", "metadata"):
                row[key] = relative_name(row[key])
            candidates.append(row)
    counts["pianoMetadataCandidates"] = len(candidates)
    if counts["allRows"] != config["expectedRows"] or len(candidates) != config["expectedCandidates"]:
        raise CorpusError("pdmx-candidate-count-differs-from-lock")
    if len({r["path"] for r in candidates}) != len(candidates):
        raise CorpusError("duplicate-pdmx-row-id")
    return candidates, dict(counts)


def metadata_score_info(metadata: dict, expected_id: str) -> dict:
    """Use observed source metadata; never fabricate a creator or canonical URL."""
    if not isinstance(metadata, dict):
        raise CorpusError("metadata-not-an-object")
    data = metadata.get("data")
    score = data.get("score") if isinstance(data, dict) else None
    # The archive retains extra top-level `score` data; primary website fields
    # in this pinned release are in data.score.
    if not isinstance(score, dict):
        raise CorpusError("metadata-score-missing")
    if str(score.get("id")) != expected_id:
        raise CorpusError("metadata-score-id-mismatch")
    url = score.get("url", "")
    parsed = urllib.parse.urlparse(url)
    if (parsed.scheme != "https" or parsed.hostname != "musescore.com" or parsed.username
            or parsed.path.rstrip("/").rsplit("/", 1)[-1] != expected_id):
        raise CorpusError("metadata-source-url-invalid")
    return {"url": url}


def inspect_candidate(job):
    """Worker reads/validates only; SQLite has exactly one writer in the parent."""
    output, item, meta, score_id, limits, cached = job
    output = Path(output)
    file_result = None
    if item["status"] == "stored" and not cached:
        file_result = inspect_file(output, item, limits)
    meta_result = {"status": meta["status"], "error": None, "url": None}
    if meta["status"] == "stored":
        try:
            metadata = json.loads(within(output, meta["path"]).read_bytes())
            source = metadata_score_info(metadata, score_id)
            meta_result.update(status="verified", url=source["url"])
        except Exception as exc:
            meta_result.update(status="invalid", error=f"metadata-invalid: {exc}")
    else:
        meta_result["error"] = f"metadata-{meta.get('error', 'missing')}"
    return {"file": file_result, "metadata": meta_result}


def inspect_candidates(jobs, workers):
    if workers == 1:
        yield from map(inspect_candidate, jobs)
        return
    # Spawn also on Unix: workers never inherit the parent's live SQLite connection.
    with ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn")) as pool:
        # Chunking bounds scheduling overhead on Windows spawn; output retains input order.
        yield from pool.map(inspect_candidate, jobs, chunksize=16)


def ingest(root: Path, manifest_path: Path, output: Path, seed: Path, offline, assets, workers=1):
    if workers not in range(1, 5):
        raise CorpusError("inspection-workers-must-be-1-to-4")
    lock = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    limits = lock["limits"]
    opened = lock["openscore"]
    index_path = within(manifest_path.parent, opened["index"])
    if hashlib.sha256(index_path.read_bytes()).hexdigest() != opened["indexSha256"]:
        raise CorpusError("openscore-index-checksum-mismatch")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if index["revision"] != opened["revision"] or len(index["entries"]) != opened["expectedRows"]:
        raise CorpusError("openscore-index-revision-or-count-mismatch")
    if len({e["path"] for e in index["entries"]}) != len(index["entries"]):
        raise CorpusError("duplicate-openscore-source-path")
    rows, filter_counts = pdmx_candidates(output / "raw/pdmx/PDMX.csv", lock["pdmx"])
    print(f"PDMX: selected {len(rows):,}/{filter_counts['allRows']:,} source rows", flush=True)
    asset_by_id = {a["id"]: a for a in assets}
    extractions = {}
    for kind, column in (("mxl", "mxl"), ("metadata", "metadata")):
        archive = asset_by_id[f"pdmx-{kind}.tar.gz"]
        extractions[kind] = extract_selected(
            within(output, archive["path"]), output, {r[column] for r in rows},
            archive["sha256"], kind, limits)
        print(f"{kind}: {extractions[kind]['mode']}", flush=True)
    db = open_catalog(output / "catalog.sqlite")
    checked, active_ids = set(), set()
    openscore_downloads = Counter()

    def collect_open(entry):
        source_url = (f"https://raw.githubusercontent.com/OpenScore/Lieder/{opened['revision']}/"
                      + urllib.parse.quote(entry["path"], safe="/"))
        try:
            spec = {"url": source_url, "bytes": entry["bytes"],
                    "checksums": {"gitBlob": entry["gitBlob"]}}
            target = within(output, f"raw/openscore/{entry['gitBlob']}.mxl")
            result = download(spec, target,
                              seed=within(seed, f"openscore-lieder/{entry['gitBlob']}.mxl"),
                              offline=offline)
            return source_url, result, blob(output, target.read_bytes(), "mxl")
        except Exception as exc:
            return source_url, {"status": "error", "error": str(exc)}, None

    # Deduplicate acquisition by Git blob while keeping EVERY source path below.
    unique_open = {e["gitBlob"]: e for e in index["entries"]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        acquired = dict(zip(unique_open, pool.map(collect_open, unique_open.values())))
    for entry in index["entries"]:
        url, result, item = acquired[entry["gitBlob"]]
        parts = entry["path"].split("/")
        row = base_origin(opened["id"], opened["revision"], entry["path"], source_url=url,
                          title=parts[-2].replace("_", " "), composer=parts[1].replace("_", " "),
                          license_id=opened["license"], license_url=opened["evidenceUrl"],
                          visibility=opened["visibility"])
        if item is not None:
            row.update(download_status="verified", extraction_status="direct")
            apply_file(db, output, row, item, limits, checked)
        else:
            row.update(download_status="error", extraction_status="missing", parse_status="blocked",
                       rejection_json=encoded([result["error"]]))
        save_origin(db, row)
        active_ids.add(row["id"])
    for _, result, _ in acquired.values():
        openscore_downloads[result["status"]] += 1
        openscore_downloads["networkBytes"] += result.get("networkBytes", 0)
    print(f"OpenScore: cataloged {len(index['entries']):,} origins", flush=True)
    db.commit()

    cached_hashes = {row["sha256"] for row in db.execute(
        "SELECT sha256 FROM files WHERE validator_version=?", (validator_key(limits),))}
    jobs = ((str(output), extractions["mxl"]["entries"][r["mxl"]],
             extractions["metadata"]["entries"][r["metadata"]], Path(r["metadata"]).stem,
             limits, extractions["mxl"]["entries"][r["mxl"]].get("sha256") in cached_hashes)
            for r in rows)
    print(f"PDMX: validating with {workers} worker(s); {len(cached_hashes):,} cached inspections",
          flush=True)
    for number, (raw, prepared) in enumerate(zip(rows, inspect_candidates(jobs, workers)), 1):
        pdmx = lock["pdmx"]
        meta = extractions["metadata"]["entries"][raw["metadata"]]
        item = extractions["mxl"]["entries"][raw["mxl"]]
        score_id = Path(raw["metadata"]).stem
        row = base_origin(pdmx["id"], pdmx["revision"], raw["mxl"],
                          source_url=f"https://musescore.com/score/{score_id}",
                          title=raw.get("title", ""), composer=raw.get("composer_name", ""),
                          license_id=raw["license"], license_url=raw["license_url"],
                          visibility=pdmx["visibility"], download_status="archive-verified",
                          extraction_status=extractions["mxl"]["mode"],
                          csv_json=encoded(raw))
        # Identity is the CSV row's data path, not its (possibly shared) MXL path.
        row["id"] = f"{pdmx['id']}:{raw['path']}"
        apply_file(db, output, row, item, limits, checked, prepared["file"])
        errors = json.loads(row["rejection_json"])
        row["metadata_status"] = prepared["metadata"]["status"]
        if meta["status"] == "stored":
            row.update(metadata_path=meta["path"], metadata_sha256=meta["sha256"])
        if prepared["metadata"]["url"]:
            row["source_url"] = prepared["metadata"]["url"]
        if prepared["metadata"]["error"]:
            errors.append(prepared["metadata"]["error"])
        row["rejection_json"] = encoded(errors)
        if errors:
            row["parse_status"] = "blocked"
        save_origin(db, row)
        active_ids.add(row["id"])
        if number % 1000 == 0:
            db.commit()
            print(f"PDMX: inspected {number:,}/{len(rows):,} containers", flush=True)

    local = lock["local"]
    for entry in local["entries"]:
        row = base_origin(local["id"], local["revision"], entry["path"],
                          title=entry["title"], composer=entry["composer"],
                          visibility=entry["visibility"])
        try:
            path = within(root, entry["path"])
            result = digests(path)
            if result["sha256"] != entry["sha256"] or result["bytes"] != entry["bytes"]:
                raise CorpusError("local-source-checksum-mismatch")
            row.update(download_status="verified", extraction_status="direct")
            apply_file(db, output, row, blob(output, path.read_bytes(), "mxl"), limits, checked)
        except Exception as exc:
            row.update(download_status="error", extraction_status="missing", parse_status="blocked",
                       rejection_json=encoded([f"local-source-unavailable: {exc}"]))
        save_origin(db, row)
        active_ids.add(row["id"])

    # A changed manifest must not silently retain obsolete rows in current counts.
    for old in db.execute("SELECT id FROM origins").fetchall():
        if old["id"] not in active_ids:
            db.execute("DELETE FROM origins WHERE id=?", (old["id"],))
    db.commit()
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchall():
        raise CorpusError("catalog-integrity-failed")
    report = make_report(db, lock, manifest_hash, filter_counts, assets,
                         extractions, dict(openscore_downloads))
    write_json(output / "download-report.json", report)
    db.execute("INSERT INTO runs (at,manifest_sha256,summary_json) VALUES (?,?,?)",
               (report["createdAt"], manifest_hash, encoded(report["summary"])))
    db.commit()
    db.close()
    return report


def make_report(db, lock, manifest_hash, filter_counts, assets, extractions, openscore_downloads):
    # Stable across cold import / reuse; covers provenance and content, excludes
    # volatile acquisition modes and run timestamps.
    logical = hashlib.sha256()
    for row in db.execute("""
      SELECT o.id,o.collection,o.revision,o.source_path,o.source_url,o.title,o.composer,
             o.license_id,o.license_url,o.visibility,o.file_sha256,o.metadata_sha256,
             o.metadata_status,o.parse_status,o.rejection_json,o.csv_json,
             f.bytes,f.container_status,f.inspection_json,f.error
      FROM origins o LEFT JOIN files f ON o.file_sha256=f.sha256 ORDER BY o.id
    """):
        logical.update((encoded(dict(row)) + "\n").encode())
    by_collection = {}
    for config in (lock["openscore"], lock["pdmx"], lock["local"]):
        collection = config["id"]
        rows = db.execute("""
          SELECT o.*,f.container_status,f.inspection_json,f.bytes FROM origins o
          LEFT JOIN files f ON o.file_sha256=f.sha256 WHERE collection=? ORDER BY o.id
        """, (collection,)).fetchall()
        by_collection[collection] = {
            "sourceRows": len(rows),
            "uniqueMxlFiles": len({r["file_sha256"] for r in rows if r["file_sha256"]}),
            "validContainers": sum(r["container_status"] == "valid" for r in rows),
            "validUniqueMxlFiles": len({r["file_sha256"] for r in rows if r["container_status"] == "valid"}),
            "withExplicitPianoName": sum(bool(json.loads(r["inspection_json"] or "{}").get(
                "explicitPianoPartIds")) for r in rows),
            "withErrors": sum(r["rejection_json"] != "[]" for r in rows),
            "metadata": dict(Counter(r["metadata_status"] for r in rows)),
            "visibility": dict(Counter(r["visibility"] for r in rows))}
    all_rows = sum(c["sourceRows"] for c in by_collection.values())
    unique_files = db.execute("SELECT COUNT(DISTINCT file_sha256) FROM origins").fetchone()[0]
    duplicate_groups = []
    for group in db.execute("""SELECT file_sha256,COUNT(*) AS n FROM origins
                                WHERE file_sha256 IS NOT NULL GROUP BY file_sha256 HAVING n>1"""):
        duplicate_groups.append({"sha256": group["file_sha256"], "origins": [
            dict(r) for r in db.execute(
                "SELECT collection,source_path,title,visibility FROM origins WHERE file_sha256=? ORDER BY id",
                (group["file_sha256"],))]})
    errors = [dict(row) for row in db.execute(
        "SELECT collection,source_path,rejection_json FROM origins WHERE rejection_json!='[]' ORDER BY id")]
    expected = lock["openscore"]["expectedRows"] + lock["pdmx"]["expectedCandidates"] + len(lock["local"]["entries"])
    return {
        "schemaVersion": 1, "corpusVersion": lock["corpusVersion"],
        "createdAt": datetime.now(timezone.utc).isoformat(), "manifestSha256": manifest_hash,
        "validation": "ZIP integrity + well-formed XML + metadata JSON; Q2 music validation pending",
        "summary": {"sourceRows": all_rows, "uniqueMxlFiles": unique_files,
                    "validUniqueMxlFiles": db.execute("""SELECT COUNT(DISTINCT file_sha256)
                        FROM origins JOIN files ON file_sha256=sha256 WHERE container_status='valid'""").fetchone()[0],
                    "catalogContentSha256": logical.hexdigest(),
                    "duplicateContentGroups": len(duplicate_groups),
                    "validContainerRows": sum(c["validContainers"] for c in by_collection.values()),
                    "rowsWithErrors": len(errors), "unaccountedRows": expected - all_rows,
                    "reviewQueueRows": db.execute("SELECT COUNT(*) FROM review_queue").fetchone()[0],
                    "reviewQueueUniqueFiles": db.execute("SELECT COUNT(DISTINCT file_sha256) FROM review_queue").fetchone()[0],
                    "publicApprovedRows": db.execute("SELECT COUNT(*) FROM origins WHERE visibility='public-approved'").fetchone()[0],
                    "acceptedGradeFragments": 0},
        "pdmxFilter": filter_counts, "collections": by_collection, "archives": assets,
        "openscoreAcquisition": openscore_downloads,
        "extraction": {k: {key: value for key, value in v.items() if key != "entries"}
                       for k, v in extractions.items()},
        "duplicateContent": duplicate_groups, "errors": errors}
