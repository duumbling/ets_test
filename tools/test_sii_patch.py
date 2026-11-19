"""Check local SII lexer compatibility patch and future error diagnostics."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from patch_upstream_sii import patch_parser


class SiiPatchTests(unittest.TestCase):
    def test_patch_is_guarded_and_idempotent(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            folder = base / "packages/clis/parser/game-files"
            folder.mkdir(parents=True)
            lexer = folder / "sii-parser.ts"
            convert = folder / "convert-sii-to-json.ts"
            lexer.write_text(
                "const Comment = createToken({\n  name: 'Comment',\n"
                r"  pattern: /(\/\/|#).*/," + "\n});\n",
                encoding="utf-8")
            convert.write_text(
                "if (!res.ok) {\n"
                "    throw new Error();\n"
                "  }\n\n"
                "  const json = jsonConverter.convert(res.cst);\n",
                encoding="utf-8")
            changed = patch_parser(base)
            self.assertEqual(len(changed), 2)
            source = lexer.read_text(encoding="utf-8")
            self.assertIn(r"[\s\S]*?", source)
            self.assertIn("ETS2 NAV: cannot parse SII file", convert.read_text(encoding="utf-8"))
            self.assertEqual(patch_parser(base), [])
            self.assertEqual(source, lexer.read_text(encoding="utf-8"))

    def test_unknown_source_is_not_overwritten(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            folder = base / "packages/clis/parser/game-files"
            folder.mkdir(parents=True)
            (folder / "sii-parser.ts").write_text("some future lexer format")
            (folder / "convert-sii-to-json.ts").write_text("some future error handler")
            with self.assertRaisesRegex(RuntimeError, "Unexpected upstream"):
                patch_parser(base)


if __name__ == '__main__':
    unittest.main()
