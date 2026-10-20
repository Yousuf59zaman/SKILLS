"""Synthetic-only regression tests for the retained Python catalog."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SCRIPT = HERE / 'catalog-skills.py'
spec = importlib.util.spec_from_file_location('catalog_under_test', SCRIPT)
catalog = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = catalog
spec.loader.exec_module(catalog)

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='catalog-merge-fixture-')
        self.base = Path(self.temp.name)
        self.root = self.base / 'skills'
        self.put(self.root / 'sample', 'sample', 'Find reports and analyze data.')
        self.put(self.root / '.system' / 'builtin', 'builtin', 'Built-in fixture.')
        self.put(self.base / 'plugins' / 'one' / 'skills' / 'plugin-fixture', 'plugin-fixture', 'Plugin fixture.')
        self.put(self.base / 'extra' / 'extra-fixture', 'extra-fixture', 'Extra fixture.')
    def tearDown(self):
        self.temp.cleanup()
    @staticmethod
    def put(folder, name, description):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'SKILL.md').write_text(f'---\nname: {name}\ndescription: {description}\n---\nFixture only.\n', encoding='utf-8')
    def run_cli(self, *args):
        result = subprocess.run([sys.executable, '-B', str(SCRIPT), '--root', str(self.root), '--no-plugin-cache', *args], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout
    def test_default_root_follows_installed_agent_copy(self):
        self.assertEqual(catalog.default_root(), SCRIPT.resolve().parents[2])
    def test_user_and_system_scopes_survive(self):
        items = catalog.discover(self.root)
        self.assertEqual({item.scope for item in items}, {'user', 'system'})
    def test_plugin_discovery_is_retained(self):
        items = catalog.discover(self.base / 'plugins', 'plugin')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].scope, 'plugin')
    def test_extra_root_cli_is_retained(self):
        items = json.loads(self.run_cli('--extra-root', str(self.base / 'extra'), '--json'))
        self.assertIn('extra-fixture', [item['name'] for item in items])
    def test_query_returns_selected_root(self):
        items = json.loads(self.run_cli('--query', 'reports'))
        self.assertEqual(items[0]['name'], 'sample')
        self.assertTrue(Path(items[0]['path']).is_relative_to(self.root))
    def test_empty_match_remains_empty(self):
        self.assertEqual(json.loads(self.run_cli('--query', 'zzunknownzz')), [])
    def test_snapshot_write_does_not_edit_skill(self):
        source = self.root / 'sample' / 'SKILL.md'
        before = source.read_bytes()
        output = self.base / 'catalog.md'
        self.run_cli('--write', str(output))
        self.assertTrue(output.exists())
        self.assertEqual(source.read_bytes(), before)
    def test_all_former_names_rank_canonical_descriptions(self):
        aliases = json.loads((HERE.parent / 'references' / 'skill-aliases.json').read_text(encoding='utf-8'))
        for old, name in aliases.items():
            skill = catalog.Skill(name, name, 'Handle former workflow ' + old, str(self.root / name), str(self.root), 'user', False)
            self.assertEqual(catalog.ranked([skill], old, 1)[0]['name'], name)

if __name__ == '__main__':
    unittest.main(verbosity=2)
