"""Opt-out of optional map icon decoding in a local truckermudgeon/maps clone.

New ETS2 versions may contain TOBJ image formats unsupported by the upstream
parser (e.g. "unknown image format 93"). Route graph generation does not need
PNG icons. This patch omits only icon decoding, leaving all definition/sector
parsing and routing data extraction intact.

No game archive or upstream remote repository is modified.
"""
from pathlib import Path


def patch_icon_decoding(maps: Path) -> list[str]:
    path = maps / 'packages/clis/parser/game-files/map-files-parser.ts'
    if not path.is_file():
        raise RuntimeError(f'Upstream map parser not found: {path}')
    original = path.read_text(encoding='utf-8')

    # Scope to the postProcess call. The separate --mode icons command remains
    # available for users of the upstream project (when its decoders support it).
    old_call = """        parseIconMatFiles(map, entries),
        l10n,"""
    new_call = """        new Map<string, Buffer>(), // ETS2 Navigator: route data only, skip unsupported TOBJ images
        l10n,"""

    # When there are no decoded images, do not reject company or road POIs just
    # because their icon keys cannot be found. They are still useful as coordinates.
    replacements = [
        (old_call, new_call),
        ('else if (!icons.has(item.token)) {',
         'else if (icons.size > 0 && !icons.has(item.token)) {'),
        ('if (!icons.has(item.token)) {',
         'if (icons.size > 0 && !icons.has(item.token)) {'),
    ]

    updated = original
    for old, new in replacements:
        if old in updated:
            if updated.count(old) != 1:
                raise RuntimeError(f'Unexpected repeated upstream pattern: {old}')
            updated = updated.replace(old, new, 1)
        elif new in updated:
            continue  # already patched
        else:
            raise RuntimeError(
                'Upstream map parser has changed; refusing to patch unknown code. '
                f'Missing pattern: {old}'
            )
    if updated == original:
        return []
    path.write_text(updated, encoding='utf-8')
    return [str(path)]
