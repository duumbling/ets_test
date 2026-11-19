"""Small, repeatable compatibility fix for a cloned truckermudgeon/maps parser.

Some ETS2 SII definitions contain C-style multi-line comments. The upstream
lexer skips // and # but may interpret the words inside /* ... */ as SII
properties, causing "Expecting Colon but found def".

Only patches the user's local toolchain checkout, never the game archives.
It also makes future parse errors identify the exact problematic .sii path.
The patch is guarded to fail if upstream source no longer matches.
"""
from pathlib import Path


def patch_parser(maps: Path) -> list[str]:
    parser = maps / "packages/clis/parser/game-files/sii-parser.ts"
    convert = maps / "packages/clis/parser/game-files/convert-sii-to-json.ts"
    if not parser.is_file() or not convert.is_file():
        raise RuntimeError("Upstream SII parser files not found; check cloned map tools.")

    old_comment = r"pattern: /(\/\/|#).*/,"
    new_comment = r"pattern: /\/\*[\s\S]*?\*\/|(?:\/\/|#)[^\r\n]*/,"
    original = parser.read_text(encoding="utf-8")
    if old_comment in original:
        modified = original.replace(old_comment, new_comment, 1)
    elif new_comment in original:
        modified = original
    else:
        raise RuntimeError("Unexpected upstream SII lexer format. Not patching unknown code.")
    if modified != original:
        parser.write_text(modified, encoding="utf-8")

    old_error = """    throw new Error();
  }

  const json = jsonConverter.convert(res.cst);"""
    new_error = """    throw new Error(`ETS2 NAV: cannot parse SII file ${siiPath}`);
  }

  const json = jsonConverter.convert(res.cst);"""
    previous = convert.read_text(encoding="utf-8")
    if old_error in previous:
        fixed = previous.replace(old_error, new_error, 1)
    elif new_error in previous:
        fixed = previous
    else:
        raise RuntimeError("Unexpected upstream SII error handler. Cannot patch diagnostics.")
    if fixed != previous:
        convert.write_text(fixed, encoding="utf-8")

    return [
        str(p) for p, changed in ((parser, modified != original), (convert, fixed != previous))
        if changed
    ]
