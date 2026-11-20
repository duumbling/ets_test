#!/usr/bin/env python3
"""Generate accurate ETS2 street geometry for local personal browser import.

Works from cached parser JSON, not from the installed game; no DLL or reparse.
Creates a compressed .json.gz and does not upload game files anywhere.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
from patch_upstream_geojson import patch_geojson_ferries


def tool(name):
    found = (shutil.which(name + '.cmd') or shutil.which(name)) if os.name == 'nt' else shutil.which(name)
    if not found:
        raise RuntimeError(f'Missing program: {name}. Install Node.js 24+ with npm.')
    return found


def main():
    ap=argparse.ArgumentParser(description='Build full-resolution ETS2 road and city geometry')
    ap.add_argument('--toolchain-dir',type=Path,
                    default=Path.home()/'ETS2NavigatorTools'/'maps')
    ap.add_argument('--output',type=Path,
                    default=Path.home()/'Downloads'/'ets2-city-detail.json.gz')
    ap.add_argument('--keep-geojson',action='store_true',
                    help='Keep intermediate (potentially large) ets2.geojson')
    args=ap.parse_args()
    maps=args.toolchain_dir.expanduser().resolve()
    parsed=maps/'out'/'parser'
    output=args.output.expanduser().resolve()
    if not (parsed/'europe-roads.json').is_file() or not (parsed/'europe-prefabs.json').is_file():
        ap.error('No road/prefab parser cache. Run py tools/build_real_map.py once to extract ETS2.')
    npx=tool('npx')
    converter=Path(__file__).with_name('ets2-nav-convert.ts')
    if not converter.is_file():
        ap.error('Missing tools/ets2-nav-convert.ts. Update ETS2 Navigator sources.')
    copied=maps/'ets2-nav-convert.ts'
    if copied.exists():
        ap.error(f'Existing {copied} would be overwritten; rename it before running.')
    geo=maps/'out'/'ets2.geojson'
    if geo.exists():
        ap.error(f'Existing {geo} could be stale; move or remove it before running.')
    output.parent.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy()
    env.setdefault('NODE_OPTIONS','--max-old-space-size=8192')
    try:
        print('Generating detailed ETS2 streets and prefab shapes from local parser cache.',flush=True)
        print('This can use substantial memory and temporary disk space.',flush=True)
        if patch_geojson_ferries(maps):
            print('Applied road-only GeoJSON fix: skip unsupported ferry DLC guards.',flush=True)
        else:
            print('Road-only GeoJSON ferry fix already present.',flush=True)
        shutil.copyfile(converter,copied)
        cmd=[npx,'--no-install','tsx','packages/clis/generator/index.ts',
             'map','-m','europe','-i',str(parsed),'-o',str(maps/'out'),
             '-t','geojson']
        subprocess.run(cmd,cwd=maps,env=env,check=True)
        if not geo.exists():
            raise RuntimeError('Upstream generator did not create ets2.geojson')
        print('Converting full-resolution geometry to local .json.gz map layer.',flush=True)
        subprocess.run([npx,'--no-install','tsx',str(copied),str(geo),str(output)],
                       cwd=maps,env=env,check=True)
        if not output.is_file() or output.stat().st_size < 100:
            raise RuntimeError('Detail output missing or empty')
        print(f'SUCCESS: {output} ({output.stat().st_size / 1048576:.1f} MiB)')
        print('Import this file in ETS2 Navigator, section "Подробная карта города".')
    except (OSError, RuntimeError, subprocess.CalledProcessError) as e:
        print('ERROR:',e,file=sys.stderr)
        sys.exit(1)
    finally:
        copied.unlink(missing_ok=True)
        if not args.keep_geojson:
            geo.unlink(missing_ok=True)


if __name__=='__main__':
    main()
