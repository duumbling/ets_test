"""Regression checks for the ferry DLC-guard crash in street map export."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from patch_upstream_geojson import OLD, NEW, patch_geojson_ferries


class GeoJsonFerryPatchTests(unittest.TestCase):
    def test_ferry_geojson_skipped_but_roads_untouched(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'packages/clis/generator/geo-json/map.ts'
            source.parent.mkdir(parents=True)
            fixture = (
                "const roadFeatures = convertRoads();\n"
                + OLD
                + "\nconst prefabFeatures = convertPrefabs();\n"
            )
            source.write_text(fixture, encoding='utf-8')
            self.assertTrue(patch_geojson_ferries(root))
            after = source.read_text(encoding='utf-8')
            self.assertIn(NEW, after)
            self.assertIn("const roadFeatures = convertRoads();", after)
            self.assertIn("const prefabFeatures = convertPrefabs();", after)
            self.assertFalse(patch_geojson_ferries(root))
            self.assertEqual(after, source.read_text(encoding='utf-8'))

    def test_unknown_upstream_source_refused(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'packages/clis/generator/geo-json/map.ts'
            source.parent.mkdir(parents=True)
            source.write_text("future incompatible source", encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'Unsupported upstream'):
                patch_geojson_ferries(root)
            self.assertEqual(source.read_text(encoding='utf-8'), 'future incompatible source')


if __name__ == '__main__':
    unittest.main()
