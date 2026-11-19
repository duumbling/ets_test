"""Regression coverage for optional-TOBJ bypass in the map extraction tool."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from patch_upstream_icons import patch_icon_decoding


UPSTREAM_SNIPPET = """    const sectorData = parseSectorFiles(entries);
    return {
      ...baseResult,
      data: 'all',
      ...postProcess(
        defData,
        sectorData,
        parseIconMatFiles(map, entries),
        l10n,
      ),
    };
  }
}
// independent icon-mode case must remain intact
if (mode === 'icons') {
  const icons = parseIconMatFiles(map, entries);
}
function postProcess() {
  if (item.overlayType === 1) {
    if (item.token === '') {
      // ignore
    } else if (!icons.has(item.token)) {
      logger.warn('no icon');
    }
  }
  if (!icons.has(item.token)) {
    noPoiCompanies.push(item);
  }
}
"""


class IconPatchTests(unittest.TestCase):
    def test_patch_preserves_route_data_and_retains_pois(self):
        with TemporaryDirectory() as t:
            root = Path(t)
            path = root / 'packages/clis/parser/game-files/map-files-parser.ts'
            path.parent.mkdir(parents=True)
            path.write_text(UPSTREAM_SNIPPET, encoding='utf-8')
            modified = patch_icon_decoding(root)
            self.assertEqual(modified, [str(path)])
            result = path.read_text(encoding='utf-8')
            self.assertIn('new Map<string, Buffer>()', result)
            self.assertIn("const sectorData = parseSectorFiles(entries)", result)
            self.assertIn("const icons = parseIconMatFiles(map, entries)", result)
            self.assertEqual(result.count('icons.size > 0 && !icons.has(item.token)'), 2)
            self.assertEqual(patch_icon_decoding(root), [])
            self.assertEqual(result, path.read_text(encoding='utf-8'))

    def test_unrecognized_upstream_does_not_get_patched(self):
        with TemporaryDirectory() as t:
            root = Path(t)
            path = root / 'packages/clis/parser/game-files/map-files-parser.ts'
            path.parent.mkdir(parents=True)
            path.write_text('different upstream content', encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'has changed'):
                patch_icon_decoding(root)
            self.assertEqual(path.read_text(encoding='utf-8'), 'different upstream content')


if __name__ == '__main__':
    unittest.main()
