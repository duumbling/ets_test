"""Make truckermudgeon/maps GeoJSON suitable for ROAD-ONLY local exports.

The upstream full map generator derives ferry DLC guards from a finite lookup
table. Some ETS2 versions include ferry connections whose guards cannot be
combined, causing assertExists(dlcGuard) at geo-json/map.ts:1081.

Ferry render lines are NOT needed to display city streets/road prefabs.
Skip only the ferry GeoJSON features during our detailed-map export.
Do not touch the routing graph or any installed ETS2 files.

Patch is idempotent and refuses to alter unknown upstream sources.
"""
from pathlib import Path


OLD = """  const ferryFeatures: FerryFeature[] = uniqFerries.map(f =>
    ferryToFeature(map, f, cities, countries, countriesByCityName),
  );"""
NEW = """  // ETS2 Navigator: detailed road geometry does not need ferry lines.
  // Skip unsupported cross-DLC ferry guards (upstream assertExists failure).
  const ferryFeatures: FerryFeature[] = [];"""


def patch_geojson_ferries(toolchain: Path) -> bool:
    source = toolchain / 'packages/clis/generator/geo-json/map.ts'
    if not source.is_file():
        raise RuntimeError('Cannot locate map GeoJSON generator: ' + str(source))
    previous = source.read_text(encoding='utf-8')
    if NEW in previous:
        return False
    if previous.count(OLD) != 1:
        raise RuntimeError(
            'Unsupported upstream ferry GeoJSON code. '
            'No changes applied; please update the patch for this version.'
        )
    source.write_text(previous.replace(OLD, NEW, 1), encoding='utf-8')
    return True
