import tempfile
import unittest
from pathlib import Path
from build_real_map import find_game, libraries


class TestMapBuilder(unittest.TestCase):
    def test_find_game_explicit(self):
        with tempfile.TemporaryDirectory() as t:
            game=Path(t)/'Euro Truck Simulator 2';game.mkdir();(game/'base.scs').touch()
            self.assertEqual(find_game(str(game)),game)

    def test_invalid_game(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):find_game(t)

    def test_libraries_vdf(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);(root/'steamapps').mkdir()
            (root/'steamapps'/'libraryfolders.vdf').write_text('"libraryfolders"\n{\n"0" { "path" "D:\\\\SteamLibrary" }\n}')
            found=libraries(root)
            self.assertIn(Path('D:\\SteamLibrary'),found)

if __name__=='__main__':unittest.main()
