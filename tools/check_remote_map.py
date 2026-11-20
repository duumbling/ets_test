"""Read-only smoke checks for the public Truck Dash map files.

Checks the host from the same Origin as our GitHub Pages, without downloading
the full graph/tiles. This is not proof that every in-game road is correct.
"""
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import sys
import struct

BASE = "https://maps.trucksim-dash.com"
ORIGIN = "https://duumbling.github.io"
TARGETS = [
    ("cities", "/ets2/Cities.json"),
    ("routing", "/ets2/route-graph-ets2-v3.bin"),
    ("vector", "/vector/ets2.pmtiles"),
]

def check(name, path):
    headers = {
        "Origin": ORIGIN,
        "User-Agent": "ETS2-Navigator-compatibility-check/1.0",
        "Range": "bytes=0-127",
    }
    req = Request(BASE + path, headers=headers)
    with urlopen(req, timeout=25) as response:
        status = response.status
        cors = response.headers.get("Access-Control-Allow-Origin", "")
        ranged = response.headers.get("Content-Range")
        data = response.read(128)
        print(name, "status", status, "cors", cors or "NONE", "content_range", ranged or "NONE")
        if status not in (200, 206):
            raise RuntimeError(f"{name}: unexpected HTTP {status}")
        if cors not in ("*", ORIGIN):
            raise RuntimeError(f"{name}: GitHub Pages browser blocked by CORS (Access-Control-Allow-Origin={cors!r})")
        if name in ("vector", "routing") and status != 206:
            raise RuntimeError(f"{name}: range request required for efficient map access")
        if name == "vector" and not data.startswith(b"PMTiles"):
            raise RuntimeError("vector: missing PMTiles header")
        if name == "routing":
            if not data.startswith(b"TDRG"):
                raise RuntimeError("routing: missing TDRG header")
            version = struct.unpack_from("<I", data, 4)[0]
            if version not in (2,3):
                raise RuntimeError(f"routing: unsupported TDRG v{version}")
        if name == "cities" and not (data.lstrip().startswith(b"[") or data.lstrip().startswith(b"{")):
            raise RuntimeError("cities: missing JSON header")

def main():
    for name, path in TARGETS:
        try:
            check(name, path)
        except (HTTPError, URLError, TimeoutError, RuntimeError) as err:
            print(f"FAIL {name}: {err}", file=sys.stderr)
            return 1
    print("All public ETS2 map data sources passed HTTP, Range and CORS smoke checks.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
