"""Release artifacts require all suites against exactly the candidate bytes."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[2] / 'buildscripts/pianist'
sys.path.insert(0, str(SCRIPTS))
from native_provenance import sha256
from release_gate import archive_verified_site, expected_checks, gate_identity, require_native_gate, validate_receipt, verify_archived_native_inputs, verify_release_files


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / 'candidate/site'
        self.site.mkdir(parents=True)
        (self.site / 'app.js').write_text('actual release bytes')
        self.release = {'version': 'candidate-v1', 'sourceCommit': 'abc123', 'sourceDirty': False,
                        'files': [{'path': 'app.js', 'bytes': (self.site / 'app.js').stat().st_size, 'sha256': sha256(self.site / 'app.js')}]}
        (self.site / 'release.json').write_text(json.dumps(self.release))
        (self.site / 'sw.js').write_text('worker bytes')
        with patch('release_gate.validation_fingerprint', return_value='validation-v1'):
            self.identity = gate_identity(self.root, self.site, self.release)
        self.report = {'mode': 'native', 'passed': True, 'sourceCommit': 'abc123', 'sourceDirty': False,
                       'testedRelease': {key: self.release[key] for key in ('version', 'sourceCommit', 'sourceDirty')},
                       'nativeGate': self.identity, 'checks': [{'name': name, 'exitCode': 0} for name in expected_checks()]}

    def test_full_exact_receipt_is_required(self):
        validate_receipt(self.report, self.identity, 'abc123')
        mutations = [lambda r: r.update(mode='browser'), lambda r: r.update(passed=False),
                     lambda r: r.update(sourceDirty=True), lambda r: r.update(sourceCommit='older'),
                     lambda r: r['testedRelease'].update(version='older'),
                     lambda r: r['nativeGate'].update(validationSha256='different checks'),
                     lambda r: r['nativeGate'].update(releaseSha256='different bytes'),
                     lambda r: r['checks'].pop(),
                     lambda r: r['checks'].append(r['checks'][0]),
                     lambda r: r['checks'][0].update(exitCode=1)]
        for mutate in mutations:
            report = copy.deepcopy(self.report)
            mutate(report)
            with self.assertRaises(ValueError):
                validate_receipt(report, self.identity, 'abc123')

    def test_receipt_lookup_rejects_changed_worker_and_changed_validation(self):
        report_path = self.root / 'artifacts/checks/run-native/report.json'
        report_path.parent.mkdir(parents=True)
        report_path.write_text(json.dumps(self.report))
        with patch('release_gate.validation_fingerprint', return_value='validation-v1'):
            proof = require_native_gate(self.root, self.site, self.release, 'abc123')
            self.assertEqual(proof['reportSha256'], sha256(report_path))
            (self.site / 'sw.js').write_text('changed worker')
            with self.assertRaisesRegex(ValueError, 'No successful full native gate'):
                require_native_gate(self.root, self.site, self.release, 'abc123')
        (self.site / 'sw.js').write_text('worker bytes')
        with patch('release_gate.validation_fingerprint', return_value='validation-v2'):
            with self.assertRaisesRegex(ValueError, 'No successful full native gate'):
                require_native_gate(self.root, self.site, self.release, 'abc123')

    def test_candidate_rejects_extra_file_and_mutation_after_browser_gate(self):
        verify_release_files(self.site, self.release, exact=True)
        (self.site / 'private-score.mxl').write_text('must never enter release ZIP')
        with self.assertRaisesRegex(ValueError, 'unlisted or missing'):
            verify_release_files(self.site, self.release, exact=True)
        (self.site / 'private-score.mxl').unlink()
        (self.site / 'app.js').write_text('concurrently rebuilt')
        with self.assertRaisesRegex(ValueError, 'Release bytes changed'):
            verify_release_files(self.site, self.release, exact=True)

    def test_web_archive_contains_only_bytes_certified_by_receipt(self):
        destination = self.site.parent / 'web.zip'
        archive_verified_site(self.site, self.release, self.identity, destination)
        with zipfile.ZipFile(destination) as archive:
            self.assertEqual(set(archive.namelist()), {'app.js', 'release.json', 'sw.js'})
            self.assertEqual(archive.read('app.js'), (self.site / 'app.js').read_bytes())
        destination.unlink()
        (self.site / 'sw.js').write_text('changed after gate')
        with self.assertRaisesRegex(ValueError, 'Candidate changed during archive creation'):
            archive_verified_site(self.site, self.release, self.identity, destination)
        self.assertFalse(destination.exists())
        self.assertFalse(destination.with_suffix('.zip.tmp').exists())

    def test_candidate_rejects_unsafe_duplicate_or_linked_paths(self):
        for path in ['../outside.js', '/absolute.js', 'folder\\file.js']:
            release = copy.deepcopy(self.release)
            release['files'][0]['path'] = path
            with self.assertRaisesRegex(ValueError, 'Unsafe or duplicate'):
                verify_release_files(self.site, release, exact=True)
        duplicate = copy.deepcopy(self.release)
        duplicate['files'].append(duplicate['files'][0])
        with self.assertRaisesRegex(ValueError, 'Unsafe or duplicate'):
            verify_release_files(self.site, duplicate, exact=True)
        original = Path.is_symlink
        with patch.object(Path, 'is_symlink', lambda p: p.name == 'app.js' or original(p)):
            with self.assertRaisesRegex(ValueError, 'Linked path'):
                verify_release_files(self.site, self.release, exact=True)

    def test_source_archive_cannot_omit_local_native_override(self):
        with patch('release_gate.subprocess.check_output', return_value=b'CMakeLists.txt\0'), patch('release_gate.source_inputs', return_value=[{'path': 'CMakeLists.txt'}, {'path': 'SetupConfigure.local.cmake'}]):
            with self.assertRaisesRegex(ValueError, 'absent from the Git source archive'):
                verify_archived_native_inputs(self.root)

    def test_native_gate_does_not_accept_an_unverified_other_server(self):
        result = subprocess.run([sys.executable, str(SCRIPTS / 'check-pianist.py'), 'native', '--url', 'http://127.0.0.1:1234/pianist.html'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('native evidence requires its own server', result.stderr)

    def test_stage_refuses_to_create_archives_without_receipt(self):
        spec = importlib.util.spec_from_file_location('stage_release_test', SCRIPTS / 'stage-release.py')
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        with patch.object(stage, 'ROOT', self.root), patch.object(stage, 'verify', return_value=self.release), \
             patch.object(stage, 'verify_native', return_value={'app': {'optimizedLink': True}}), \
             patch.object(stage, 'verify_frontend', return_value={'inputSha256': 'frontend'}), \
             patch.object(stage, 'verify_archived_native_inputs'), \
             patch.object(stage.subprocess, 'check_output', side_effect=['abc123', '']), \
             patch.object(stage, 'require_native_gate', side_effect=ValueError('missing gate')), \
             patch.object(sys, 'argv', ['stage-release.py', '--output', str(self.site.parent), '--finalize']):
            with self.assertRaisesRegex(ValueError, 'missing gate'):
                stage.main()
        self.assertFalse((self.site.parent / 'source').exists())
        self.assertFalse((self.site.parent / 'pianist-web.zip').exists())

    def test_published_frontend_proof_cannot_point_at_different_js(self):
        spec = importlib.util.spec_from_file_location('verify_web_release_test', SCRIPTS / 'verify-release.py')
        verifier = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(verifier)
        entry = {'path': 'app/pianist.js', 'bytes': 10, 'sha256': 'actual-bytes'}
        proof = {'schemaVersion': 1, 'target': 'web', 'inputSha256': 'inputs', 'sourceInputCount': 42, 'files': [entry.copy()]}
        release = {'webBuild': {'inputSha256': 'inputs', 'sourceInputCount': 42, 'installedSourcesSha256': 'static-inputs'},
                   'files': [{'path': 'web/frontend.json'}, entry]}
        verifier.verify_frontend_manifest(lambda _: json.dumps(proof), release)
        entry['sha256'] = 'old-js'
        with self.assertRaisesRegex(ValueError, 'Frontend build proof/output mismatch'):
            verifier.verify_frontend_manifest(lambda _: json.dumps(proof), release)


if __name__ == '__main__':
    unittest.main()
