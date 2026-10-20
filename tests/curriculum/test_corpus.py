"""Local fixtures: no network/dataset dependency. Run with unittest discovery."""
from __future__ import annotations

import csv
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "buildscripts/pianist"))
from curriculum_io import CorpusError, RunLock, digests, download, relative_name, within, write_json
from curriculum_catalog import extract_selected, ingest, inspect_mxl, metadata_score_info, pdmx_candidates

LIMITS = {"maxMxlBytes": 1048576, "maxXmlBytes": 2097152, "maxZipEntries": 32,
          "maxZipExpandedBytes": 4194304, "maxMetadataBytes": 65536,
          "maxTarMembers": 1000, "maxTarExpandedBytes": 16777216}
XML = b"""<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
 "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><part-list><score-part id="P1">
<part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch>
<duration>1</duration></note></measure></part></score-partwise>"""


def mxl(xml=XML, rootfile="score.xml", extra=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/container.xml", f'<container><rootfiles><rootfile full-path="{rootfile}"'
                   ' media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
        z.writestr("score.xml", xml)
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return stream.getvalue()


def tar_file(path, entries):
    with tarfile.open(path, "w:gz") as t:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            if data is None:
                info.type = tarfile.SYMTYPE
                info.linkname = "../../outside"
                t.addfile(info)
            else:
                info.size = len(data)
                t.addfile(info, io.BytesIO(data))


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        base = ROOT / "artifacts/curriculum-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.root = Path(self.temp.name).resolve()
        assert self.root.is_relative_to(base.resolve())

    def tearDown(self):
        self.temp.cleanup()


class DownloadTests(WorkspaceTest):
    @classmethod
    def setUpClass(cls):
        cls.payload = b"real checksum fixture\0" * 10000
        cls.calls = []
        cls.mode = "range"

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                cls.calls.append(self.headers.get("Range"))
                payload = cls.payload
                offset = int(self.headers.get("Range", "bytes=0-").split("=")[1].split("-")[0])
                partial = bool(self.headers.get("Range")) and cls.mode != "ignore"
                if not partial:
                    offset = 0
                self.send_response(206 if partial else 200)
                self.send_header("Content-Length", str(len(payload) - offset))
                self.send_header("ETag", '"fixture1"')
                if partial:
                    start = offset + 1 if cls.mode == "bad-range" else offset
                    self.send_header("Content-Range", f"bytes {start}-{len(payload)-1}/{len(payload)}")
                self.end_headers()
                if cls.mode == "corrupt":
                    payload = b"x" * len(payload)
                if cls.mode == "drop-once":
                    cls.mode = "range"
                    self.wfile.write(payload[:10000])
                    self.close_connection = True
                else:
                    self.wfile.write(payload[offset:])
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        super().setUp()
        type(self).calls = []
        type(self).mode = "range"
        self.spec = {"url": f"http://127.0.0.1:{self.server.server_port}/fixture",
                     "bytes": len(self.payload),
                     "checksums": {"sha256": hashlib.sha256(self.payload).hexdigest()}}
        self.target = self.root / "fixture"

    def partial(self):
        self.target.with_name("fixture.part").write_bytes(self.payload[:1234])
        write_json(self.target.with_name("fixture.resume.json"), {"identity": self.spec})

    def test_download_then_offline_reuse_verifies(self):
        result = download(self.spec, self.target)
        self.assertEqual(result["networkBytes"], len(self.payload))
        result = download(self.spec, self.target, offline=True)
        self.assertEqual(result["status"], "reused")
        self.assertEqual(len(self.calls), 1)
        self.target.write_bytes(b"bad")
        with self.assertRaisesRegex(CorpusError, "offline-missing"):
            download(self.spec, self.target, offline=True)

    def test_seed_is_verified_not_modified(self):
        seed = self.root / "seed"
        seed.write_bytes(self.payload)
        result = download(self.spec, self.target, seed=seed, offline=True)
        self.assertEqual(result["status"], "seeded")
        self.assertEqual(self.calls, [])
        self.assertEqual(seed.read_bytes(), self.payload)

    def test_resume_206(self):
        self.partial()
        result = download(self.spec, self.target)
        self.assertEqual(result["resumedBytes"], 1234)
        self.assertEqual(result["networkBytes"], len(self.payload) - 1234)
        self.assertEqual(self.calls, ["bytes=1234-"])

    def test_200_ignoring_range_restarts_not_appends(self):
        self.partial()
        type(self).mode = "ignore"
        result = download(self.spec, self.target)
        self.assertEqual(result["bytes"], len(self.payload))
        self.assertEqual(self.target.read_bytes(), self.payload)

    def test_incorrect_content_range_never_commits(self):
        self.partial()
        type(self).mode = "bad-range"
        with self.assertRaisesRegex(CorpusError, "invalid-content-range"):
            download(self.spec, self.target, retries=1)
        self.assertFalse(self.target.exists())

    def test_changed_pin_discards_old_partial(self):
        self.partial()
        write_json(self.target.with_name("fixture.resume.json"),
                   {"identity": {**self.spec, "url": "http://stale.invalid/"}})
        download(self.spec, self.target)
        self.assertEqual(self.calls, [None])

    def test_disconnect_resumes_on_retry(self):
        type(self).mode = "drop-once"
        with patch("curriculum_io.time.sleep"):
            result = download(self.spec, self.target, retries=2)
        self.assertEqual(self.calls, [None, "bytes=10000-"])
        self.assertEqual(result["sha256"], self.spec["checksums"]["sha256"])

    def test_corrupt_checksum_never_commits(self):
        type(self).mode = "corrupt"
        with self.assertRaisesRegex(CorpusError, "checksum-mismatch"):
            download(self.spec, self.target, retries=1)
        self.assertFalse(self.target.exists())

    def test_complete_partial_needs_no_http(self):
        self.partial()
        self.target.with_name("fixture.part").write_bytes(self.payload)
        download(self.spec, self.target)
        self.assertEqual(self.calls, [])


class ArchiveTests(WorkspaceTest):
    def test_concurrent_run_is_blocked_and_lock_releases(self):
        lock = self.root / ".run.lock"
        with RunLock(lock):
            with self.assertRaisesRegex(CorpusError, "another-corpus-run"):
                with RunLock(lock):
                    self.fail("second writer admitted")
        with RunLock(lock):
            pass

    def test_safe_names_and_windows_aliases(self):
        self.assertEqual(relative_name("./mxl/1/a.mxl"), "mxl/1/a.mxl")
        for name in ("../a", "/root", "C:/a", "x\\y", "a/../b", "aux.mxl", "a/space ", "a/b."):
            with self.subTest(name=name), self.assertRaises(CorpusError):
                relative_name(name)

    def test_selective_extract_dedup_and_verified_reuse(self):
        archive = self.root / "mxl.tar.gz"
        data = mxl()
        tar_file(archive, [("mxl/a.mxl", data), ("mxl/b.mxl", data),
                           ("mxl/unused.mxl", b"not needed")])
        wanted = {"mxl/a.mxl", "mxl/b.mxl", "mxl/missing.mxl"}
        sha = digests(archive)["sha256"]
        result = extract_selected(archive, self.root, wanted, sha, "mxl", LIMITS)
        self.assertEqual(result["entries"]["mxl/a.mxl"]["path"], result["entries"]["mxl/b.mxl"]["path"])
        self.assertEqual(result["entries"]["mxl/missing.mxl"]["error"], "archive-member-missing")
        self.assertEqual(len(list((self.root / "raw/objects").rglob("*.mxl"))), 1)
        with patch("curriculum_catalog.tarfile.open", side_effect=AssertionError("must reuse")):
            self.assertEqual(extract_selected(archive, self.root, wanted, sha, "mxl", LIMITS)["mode"], "reused")
        within(self.root, result["entries"]["mxl/a.mxl"]["path"]).write_bytes(b"corrupt")
        result = extract_selected(archive, self.root, wanted, sha, "mxl", LIMITS)
        self.assertEqual(result["mode"], "extracted")
        self.assertEqual(within(self.root, result["entries"]["mxl/a.mxl"]["path"]).read_bytes(), data)

    def test_tar_traversal_links_duplicates(self):
        archive = self.root / "bad.tar.gz"
        for entries in ([("../escape", b"x")], [("mxl/a", None)],
                        [("mxl/a", b"a"), ("mxl/a", b"b")]):
            with self.subTest(entries=entries):
                tar_file(archive, entries)
                with self.assertRaises(CorpusError):
                    extract_selected(archive, self.root, {"mxl/a"}, digests(archive)["sha256"], "mxl", LIMITS)
        self.assertFalse((self.root.parent / "escape").exists())

    def test_member_limit_reported_without_allocation(self):
        archive = self.root / "big.tar.gz"
        tar_file(archive, [("mxl/a", b"0123456789")])
        result = extract_selected(archive, self.root, {"mxl/a"}, digests(archive)["sha256"],
                                  "mxl", {**LIMITS, "maxMxlBytes": 4})
        self.assertEqual(result["entries"]["mxl/a"]["error"], "member-size-limit")

    def test_xml_real_doctype_accepted_no_grade_inferred(self):
        result = inspect_mxl(mxl(), LIMITS)
        self.assertEqual(result["explicitPianoPartIds"], ["P1"])
        self.assertEqual(result["musicValidation"], "pending-q2")
        self.assertNotIn("grade", result)

    def test_xml_entity_expansion_and_external_entities_rejected(self):
        bad = '<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///secret">]><score-partwise>&x;</score-partwise>'
        for encoding in ("utf-8", "utf-16"):
            with self.subTest(encoding=encoding), self.assertRaises(Exception):
                inspect_mxl(mxl(bad.encode(encoding)), LIMITS)

    def test_rootfile_traversal_missing_and_bad_xml(self):
        for data in (mxl(rootfile="../score.xml"), mxl(rootfile="missing.xml"),
                     mxl(b"<score-partwise"), mxl(b"<unrelated/>")):
            with self.subTest(data=data[:20]), self.assertRaises(Exception):
                inspect_mxl(data, LIMITS)

    def test_expanded_zip_bound(self):
        with self.assertRaisesRegex(CorpusError, "zip-expanded-size-limit"):
            inspect_mxl(mxl(extra={"bomb.xml": b"a" * 20000}), {**LIMITS, "maxZipExpandedBytes": 10000})

    def test_program_alone_does_not_mean_piano(self):
        xml = XML.replace(b"<part-name>Piano</part-name>", b"<part-name>Violin</part-name>"
                          b"<midi-instrument><midi-program>1</midi-program></midi-instrument>")
        self.assertEqual(inspect_mxl(mxl(xml), LIMITS)["explicitPianoPartIds"], [])


class CatalogTests(WorkspaceTest):
    def fixture(self):
        output = self.root / "output"
        raw = output / "raw/pdmx"
        raw.mkdir(parents=True)
        seed = self.root / "seed"
        (seed / "openscore-lieder").mkdir(parents=True)
        source = self.root / "local.mxl"
        source.write_bytes(mxl())
        h = digests(source)
        (seed / f"openscore-lieder/{h['gitBlob']}.mxl").write_bytes(source.read_bytes())
        opened = {"schemaVersion": 1, "revision": "abc123", "entries": [
            {"path": f"scores/composer/book/{title}/score.mxl", "bytes": h["bytes"], "gitBlob": h["gitBlob"]}
            for title in ("First", "Other attribution")]}
        write_json(self.root / "index.json", opened)
        filter_ = {f"subset:{k}": "True" for k in ("no_license_conflict", "all_valid", "deduplicated")}
        filter_.update(n_tracks="1", tracks="0")
        rows = [{**filter_, "path": f"./data/{name}.json", "mxl": f"./mxl/{name}.mxl",
                 "metadata": "./metadata/123.json", "license": "publicdomain", "license_url": "https://example.test/license",
                 "title": name} for name in ("a", "b")]
        rows.append({**rows[0], "path": "./data/skipped.json", "subset:no_license_conflict": "False"})
        with (raw / "PDMX.csv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        tar_file(raw / "mxl.tar.gz", [(f"mxl/{s}.mxl", source.read_bytes()) for s in ("a", "b")])
        metadata = b'{"data":{"score":{"id":123,"url":"https://musescore.com/user/1/scores/123"}}}'
        tar_file(raw / "metadata.tar.gz", [("metadata/123.json", metadata)])
        assets = [{"id": f"pdmx-{s}.tar.gz", "path": f"raw/pdmx/{s}.tar.gz",
                   **digests(raw / f"{s}.tar.gz")} for s in ("mxl", "metadata")]
        manifest = {"schemaVersion": 1, "corpusVersion": "test", "limits": LIMITS,
                    "openscore": {"id": "openscore", "revision": "abc123", "index": "index.json",
                                  "indexSha256": digests(self.root / "index.json")["sha256"],
                                  "expectedRows": 2, "license": "CC0-1.0", "evidenceUrl": "https://example.test/license",
                                  "visibility": "pending-review"},
                    "pdmx": {"id": "pdmx", "revision": "15571083", "filter": filter_,
                             "expectedRows": 3, "expectedCandidates": 2, "visibility": "pending-review"},
                    "local": {"id": "user-library", "revision": "local", "entries": [
                        {"path": "local.mxl", "title": "Mine", "composer": "", "visibility": "personal",
                         "bytes": h["bytes"], "sha256": h["sha256"]}]}}
        path = self.root / "sources.lock.json"
        write_json(path, manifest)
        return output, seed, path, assets

    def test_end_to_end_duplicates_keep_all_origins_and_rerun_without_extraction(self):
        output, seed, manifest, assets = self.fixture()
        first = ingest(self.root, manifest, output, seed, True, assets)
        self.assertEqual(first["summary"]["sourceRows"], 5)
        self.assertEqual(first["summary"]["uniqueMxlFiles"], 1)
        self.assertEqual(first["summary"]["validUniqueMxlFiles"], 1)
        self.assertEqual(first["summary"]["reviewQueueUniqueFiles"], 1)
        self.assertEqual(first["summary"]["duplicateContentGroups"], 1)
        self.assertEqual(len(first["duplicateContent"][0]["origins"]), 5)
        self.assertEqual(first["summary"]["rowsWithErrors"], 0)
        self.assertEqual(first["summary"]["publicApprovedRows"], 0)
        self.assertEqual(first["summary"]["acceptedGradeFragments"], 0)
        self.assertEqual(first["collections"]["user-library"]["visibility"], {"personal": 1})
        with patch("curriculum_catalog.tarfile.open", side_effect=AssertionError("must reuse")):
            second = ingest(self.root, manifest, output, seed, True, assets)
        self.assertEqual(first["summary"], second["summary"])
        self.assertEqual(second["openscoreAcquisition"]["networkBytes"], 0)

    def test_missing_personal_file_is_accounted_and_other_sources_continue(self):
        output, seed, manifest, assets = self.fixture()
        (self.root / "local.mxl").unlink()
        result = ingest(self.root, manifest, output, seed, True, assets)
        self.assertEqual(result["summary"]["unaccountedRows"], 0)
        self.assertEqual(result["summary"]["rowsWithErrors"], 1)
        self.assertEqual(result["summary"]["validContainerRows"], 4)
        self.assertIn("local-source-unavailable", result["errors"][0]["rejection_json"])

    def test_two_csv_origins_can_reference_same_archive_member(self):
        output, seed, manifest, assets = self.fixture()
        csv_path = output / "raw/pdmx/PDMX.csv"
        with csv_path.open(encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            columns, rows = reader.fieldnames, list(reader)
        rows[1]["mxl"] = rows[0]["mxl"]
        with csv_path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        result = ingest(self.root, manifest, output, seed, True, assets)
        self.assertEqual(result["collections"]["pdmx"]["sourceRows"], 2)
        self.assertEqual(result["summary"]["unaccountedRows"], 0)

    def test_parallel_and_serial_inspection_produce_identical_catalog(self):
        output, seed, manifest, assets = self.fixture()
        archive = output / "raw/pdmx/mxl.tar.gz"
        tar_file(archive, [("mxl/a.mxl", mxl()),
                           ("mxl/b.mxl", mxl(XML.replace(b"<step>C", b"<step>D")))])
        assets[0].update(digests(archive))
        first = ingest(self.root, manifest, output, seed, True, assets, workers=2)
        self.assertEqual(first["summary"]["uniqueMxlFiles"], 2)
        # Force a fresh serial XML inspection instead of comparing against its cache.
        (output / "catalog.sqlite").unlink()
        second = ingest(self.root, manifest, output, seed, True, assets, workers=1)
        self.assertEqual(first["summary"], second["summary"])
        with self.assertRaisesRegex(CorpusError, "workers-must-be"):
            ingest(self.root, manifest, output, seed, True, assets, workers=5)

    def test_filter_and_counts_are_pinned(self):
        output, _, manifest, _ = self.fixture()
        cfg = json.loads(manifest.read_text())["pdmx"]
        rows, counts = pdmx_candidates(output / "raw/pdmx/PDMX.csv", cfg)
        self.assertEqual(len(rows), 2)
        self.assertEqual(counts["noLicenseConflict"], 2)
        cfg["expectedCandidates"] = 3
        with self.assertRaisesRegex(CorpusError, "count-differs-from-lock"):
            pdmx_candidates(output / "raw/pdmx/PDMX.csv", cfg)

    def test_metadata_provenance_must_match_score_id(self):
        metadata = {"data": {"score": {"id": 123, "url": "https://musescore.com/user/1/scores/123"}}}
        self.assertEqual(metadata_score_info(metadata, "123")["url"], metadata["data"]["score"]["url"])
        with self.assertRaisesRegex(CorpusError, "id-mismatch"):
            metadata_score_info(metadata, "456")
        metadata["data"]["score"]["url"] = "https://unrelated.test/"
        with self.assertRaisesRegex(CorpusError, "url-invalid"):
            metadata_score_info(metadata, "123")

    def test_stricter_validation_limits_invalidate_inspection_cache(self):
        output, seed, manifest, assets = self.fixture()
        ingest(self.root, manifest, output, seed, True, assets)
        lock = json.loads(manifest.read_text())
        lock["limits"]["maxXmlBytes"] = 16
        write_json(manifest, lock)
        result = ingest(self.root, manifest, output, seed, True, assets)
        self.assertEqual(result["summary"]["validContainerRows"], 0)
        self.assertEqual(result["summary"]["rowsWithErrors"], 5)


if __name__ == "__main__":
    unittest.main()
