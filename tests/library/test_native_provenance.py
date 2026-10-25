"""A fresh packaging commit must not conceal a stale native build."""
import json
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'buildscripts/pianist'))
from native_provenance import OUTPUTS, begin, complete, source_inputs, verify_native
spec = importlib.util.spec_from_file_location('verify_native_release_test', Path(__file__).resolve().parents[2] / 'buildscripts/pianist/verify-release.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class NativeProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / 'build.artifacts'
        self.build = self.root / 'build.test'
        self.build.mkdir()
        self.write('build.test/CMakeCache.txt', 'CMAKE_BUILD_TYPE:STRING=Release\nPIANIST_WASM_FAST_LINK:BOOL=OFF\nPIANIST_RENDERER_FAST_LINK:BOOL=OFF\n')
        for path in ['CMakeLists.txt', 'version.cmake', 'SetupConfigure.cmake', 'buildscripts/SetupBuildEnvironment.cmake',
                     'buildscripts/pch/pch.h', 'src/framework/audio/core.cpp', 'src/web/audioengine/engine.cpp',
                     'src/web/appjs/webapi.cpp', 'src/engraving/note.cpp', 'share/fonts/font.ttf', 'fonts/leland/Leland.otf',
                     'buildscripts/pianist/native_provenance.py', 'buildscripts/pianist/build-web.ps1']:
            self.write(path, path)
        self.write('.gitignore', 'build.*\nSetupConfigure.local.cmake\nbuildscripts/cmake/SetupBuildEnvironment.user.cmake\n')
        self.git('init', '-q')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.commit()

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')
        return path

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.STDOUT)

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'test')

    def build_all(self):
        for target, names in OUTPUTS.items():
            directory = self.site / 'renderer' if target == 'renderer' else self.site
            directory.mkdir(parents=True, exist_ok=True)
            for name in names:
                (directory / name).write_bytes((target + name).encode())
            receipt = self.build / (target + '.json')
            begin(self.root, target, self.build, receipt)
            complete(self.root, target, self.build, receipt, directory, self.site / 'native' / (target + '.json'))

    def test_web_only_new_commit_reuses_matching_native_binaries(self):
        self.build_all()
        before = verify_native(self.root, self.site)
        self.write('apps/pianist-web/src/app.tsx', 'new frontend')
        self.write('src/web/appjs/viewer/sw-template.js', 'new worker')
        self.write('buildscripts/pianist/release_gate.py', 'new validation')
        self.commit()
        self.assertEqual(before, verify_native(self.root, self.site))
        self.assertTrue(all(item['optimizedLink'] for item in before.values()))

    def test_committing_native_change_does_not_make_stale_outputs_current(self):
        self.build_all()
        self.write('src/web/appjs/webapi.cpp', 'native fix requiring rebuild')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Stale native inputs: app'):
            verify_native(self.root, self.site)

    def test_new_deleted_config_and_ignored_native_inputs_are_fingerprinted(self):
        self.build_all()
        changes = ['src/engraving/new.cpp', 'SetupConfigure.local.cmake', 'buildscripts/cmake/SetupBuildEnvironment.user.cmake', 'version.cmake',
                   'buildscripts/SetupBuildEnvironment.cmake', 'buildscripts/pch/pch.h', 'fonts/leland/Leland.otf']
        for path in changes:
            with self.subTest(path=path):
                target = self.root / path
                original = target.read_bytes() if target.exists() else None
                self.write(path, 'changed native input')
                with self.assertRaisesRegex(ValueError, 'Stale native inputs'):
                    verify_native(self.root, self.site)
                if original is None:
                    target.unlink()
                else:
                    target.write_bytes(original)
        (self.root / 'src/engraving/note.cpp').unlink()
        with self.assertRaisesRegex(ValueError, 'Stale native inputs'):
            verify_native(self.root, self.site)

    def test_each_output_is_bound_to_successful_build_bytes(self):
        self.build_all()
        for target, names in OUTPUTS.items():
            path = (self.site / 'renderer' if target == 'renderer' else self.site) / names[0]
            data = path.read_bytes()
            with self.subTest(target=target):
                path.write_bytes(b'tampered')
                with self.assertRaisesRegex(ValueError, 'Native output differs'):
                    verify_native(self.root, self.site)
                path.write_bytes(data)
        (self.site / 'native/audio.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing native provenance for audio'):
            verify_native(self.root, self.site)

    def test_audio_input_scope_includes_shared_build_rules_and_framework(self):
        paths = {entry['path'] for entry in source_inputs(self.root, 'audio')}
        self.assertIn('src/framework/audio/core.cpp', paths)
        self.assertIn('src/web/audioengine/engine.cpp', paths)
        self.assertIn('buildscripts/SetupBuildEnvironment.cmake', paths)
        self.assertNotIn('src/web/appjs/webapi.cpp', paths)

    def test_inputs_or_configuration_changed_during_build_refuse_stamp(self):
        receipt = self.build / 'app.json'
        begin(self.root, 'app', self.build, receipt)
        self.write('src/engraving/note.cpp', 'change while compiling')
        with self.assertRaisesRegex(ValueError, 'changed during build'):
            complete(self.root, 'app', self.build, receipt, self.site, self.site / 'native/app.json')
        begin(self.root, 'app', self.build, receipt)
        self.write('build.test/CMakeCache.txt', 'CMAKE_BUILD_TYPE:STRING=Release\nPIANIST_WASM_FAST_LINK:BOOL=ON\n')
        with self.assertRaisesRegex(ValueError, 'changed during build'):
            complete(self.root, 'app', self.build, receipt, self.site, self.site / 'native/app.json')
        self.assertFalse((self.site / 'native/app.json').exists())

    def test_fast_link_and_missing_build_receipt_cannot_claim_optimized(self):
        self.write('build.test/CMakeCache.txt', 'CMAKE_BUILD_TYPE:STRING=Release\nPIANIST_WASM_FAST_LINK:BOOL=ON\nPIANIST_RENDERER_FAST_LINK:BOOL=ON\n')
        self.build_all()
        native = verify_native(self.root, self.site)
        self.assertFalse(native['app']['optimizedLink'])
        self.assertFalse(native['renderer']['optimizedLink'])
        with self.assertRaises(FileNotFoundError):
            complete(self.root, 'app', self.build, self.build / 'missing.json', self.site, self.site / 'native/app.json')

    def test_published_proofs_match_manifest_outputs_without_local_head(self):
        self.build_all()
        native = verify_native(self.root, self.site)
        inventory = []
        for target in OUTPUTS:
            proof = json.loads((self.site / 'native' / (target + '.json')).read_text())
            inventory.append({'path': 'native/' + target + '.json'})
            inventory += [{**entry, 'path': ('renderer/' if target == 'renderer' else '') + entry['path']} for entry in proof['files']]
        release = {'nativeBuilds': native, 'files': inventory}
        verifier.verify_native_manifest(lambda name: (self.site / name).read_bytes(), release)
        inventory[1]['sha256'] = 'different-binary'
        with self.assertRaisesRegex(ValueError, 'proof/output mismatch'):
            verifier.verify_native_manifest(lambda name: (self.site / name).read_bytes(), release)


if __name__ == '__main__':
    unittest.main()
