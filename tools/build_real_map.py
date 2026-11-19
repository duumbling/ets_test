#!/usr/bin/env python3
"""One-command ETS2 routepack builder for Windows: find Steam, build tooling, export.

Only run after reviewing the third-party repository and npm dependencies. This
program invokes truckermudgeon/maps (GPL-3.0) on *your own* game installation.
It doesn't send game files anywhere and does not auto-publish generated data.

    py tools/build_real_map.py
    py tools/build_real_map.py --game-path "D:\\SteamLibrary\\steamapps\\common\\Euro Truck Simulator 2"
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from create_ets2_routepack import read_json, make_pack
from patch_upstream_sii import patch_parser
import json

SOURCE = 'https://github.com/truckermudgeon/maps.git'


def steam_locations():
    paths=[]
    if sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Valve\Steam') as k:
                for name in ('SteamPath','SteamExe'):
                    try:
                        path=Path(winreg.QueryValueEx(k,name)[0])
                        paths.append(path if path.is_dir() else path.parent)
                    except OSError:
                        continue
        except OSError:
            pass
        for name in ('ProgramFiles(x86)','ProgramFiles'):
            if os.environ.get(name):paths.append(Path(os.environ[name])/'Steam')
    else:
        paths += [Path.home()/'.steam/steam',Path.home()/'.local/share/Steam']
    return list(dict.fromkeys(paths))


def libraries(root: Path):
    libraries=[root]
    vdf=root/'steamapps'/'libraryfolders.vdf'
    if vdf.is_file():
        text=vdf.read_text(encoding='utf-8-sig',errors='replace')
        for match in re.finditer(r'"path"\s+"([^"]+)"',text,re.IGNORECASE):
            libraries.append(Path(match.group(1).replace('\\\\','\\')))
    return list(dict.fromkeys(libraries))


def find_game(game_path: str | None):
    if game_path:
        p=Path(game_path).expanduser()
        if not (p/'base.scs').is_file():
            raise ValueError(f'Не найдена base.scs в указанной папке: {p}')
        return p
    for root in steam_locations():
        for lib in libraries(root):
            p=lib/'steamapps'/'common'/'Euro Truck Simulator 2'
            if (p/'base.scs').is_file():return p
    raise ValueError('Не удалось найти игру автоматически. Запусти с --game-path "ПУТЬ_К_ETS2".')


def require_command(name: str):
    if not shutil.which(name):
        raise RuntimeError(f'Не найдена команда {name}. Установи её и повтори попытку.')


def run(*args, cwd=None):
    command = [str(a) for a in args]
    # On Windows, npm and npx are normally installed as .cmd wrappers.
    # shutil.which('npm') may report success, but subprocess.run(['npm', ...])
    # raises WinError 2 because CreateProcess does not resolve npm.cmd.
    if sys.platform == 'win32' and command[0].lower() in ('npm', 'npx'):
        program = command[0]
        command[0] = (shutil.which(program + '.cmd')
                      or shutil.which(program + '.bat')
                      or shutil.which(program)
                      or program + '.cmd')
    print('>', subprocess.list2cmdline(command) if sys.platform == 'win32'
          else ' '.join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)



def check_windows_cpp_toolchain():
    """Check for MSVC before a costly npm install/native-addon rebuild.

    vswhere is shipped with modern Visual Studio / Build Tools. If it is
    absent, let node-gyp attempt its usual discovery rather than rejecting
    nonstandard installations.
    """
    if sys.platform != 'win32' or shutil.which('cl.exe'):
        return
    installer_root = Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)'))
    vswhere = installer_root / 'Microsoft Visual Studio' / 'Installer' / 'vswhere.exe'
    if not vswhere.is_file():
        print('ВНИМАНИЕ: MSVC пока не обнаружен через vswhere. '
              'Если npm выдаст "Could not find any Visual Studio installation", '
              'установи Build Tools с компонентом Desktop development with C++.', file=sys.stderr)
        return
    try:
        location = subprocess.check_output([
            str(vswhere), '-latest', '-products', '*',
            '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
            '-property', 'installationPath',
        ], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return
    if not location:
        raise RuntimeError(
            'Не найдены Microsoft Visual C++ Build Tools (MSVC x64/x86). '
            'Установи Build Tools for Visual Studio и workload '
            '"Desktop development with C++" с Windows SDK: '
            'https://visualstudio.microsoft.com/downloads/ . '
            'После установки открой новый терминал и повтори команду.'
        )

# Only CLI tools and their direct internal libraries are necessary to build an
# ETS2 routepack. The upstream monorepo also contains an Electron-based GUI,
# whose postinstall script calls fs.symlinkSync and fails on standard Windows
# accounts (EPERM). Skip all installation lifecycle scripts; then explicitly
# build only the native addon used by the parser.
MAP_WORKSPACES = (
    'packages/clis/parser',
    'packages/clis/generator',
    'packages/libs/base',
    'packages/libs/io',
    'packages/libs/map',
)


def install_map_tools(maps: Path):
    workspace_args = [item for workspace in MAP_WORKSPACES
                      for item in ('--workspace', workspace)]
    print('Installing map CLI dependencies without GUI postinstall scripts.', flush=True)
    run('npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund',
        *workspace_args, cwd=maps)
    # npm install --ignore-scripts skips node-gyp lifecycle hooks; explicitly
    # build just the C++ bindings the parser uses.
    run('npm', 'run', 'build', '--workspace', 'packages/clis/parser', cwd=maps)


def run_parser_and_graph(maps: Path, game: Path, parser: Path, output_dir: Path):
    # The upstream parser's UNIX shebang sets an 8 GiB heap; running the
    # TypeScript entrypoint through npx on Windows bypasses that shebang.
    os.environ.setdefault('NODE_OPTIONS', '--max-old-space-size=8192')
    # Use TypeScript entrypoints directly: npm lifecycle scripts that create
    # .bin/parser and .bin/generator symlinks were intentionally skipped.
    run('npx', '--no-install', 'tsx', 'packages/clis/parser/index.ts',
        '-i', game, '-o', parser, cwd=maps)
    run('npx', '--no-install', 'tsx', 'packages/clis/generator/index.ts',
        'graph', '-m', 'europe', '-i', parser, '-o', output_dir, '-c', cwd=maps)


def main():
    ap=argparse.ArgumentParser(description='Extract ETS2 roads into ETS2 Navigator routepack')
    ap.add_argument('--game-path',default=None,help='Path to Euro Truck Simulator 2 install')
    ap.add_argument('--toolchain-dir',type=Path,default=None,help='Where to clone truckermudgeon/maps')
    ap.add_argument('--output',type=Path,default=Path.home()/'Downloads'/'ets2-routepack.json')
    args=ap.parse_args()
    try:
        require_command('git');require_command('node');require_command('npm');require_command('npx')
        node_version=subprocess.check_output(['node','-v'],text=True).strip()
        major=int(re.search(r'v?(\d+)',node_version).group(1))
        if major<24:raise RuntimeError(f'Нужен Node.js 24+, установлен {node_version}.')
        game=find_game(args.game_path)
        maps=(args.toolchain_dir or Path.home()/'ETS2NavigatorTools'/'maps').expanduser().resolve()
        print('Игра:',game)
        print('Инструментарий:',maps)
        print('Будет скачан и выполнен открытый сторонний проект truckermudgeon/maps (GPL-3.0).')
        if not (maps/'.git').exists():
            maps.parent.mkdir(parents=True,exist_ok=True)
            run('git','clone','--recurse-submodules',SOURCE,maps)
        if not (maps/'package.json').is_file():
            raise RuntimeError('Неполный каталог инструментов. Удали его и повтори запуск.')
        check_windows_cpp_toolchain()
        install_map_tools(maps)
        updated_sources = patch_parser(maps)
        if updated_sources:
            print('Applied local SII parser compatibility fixes:', *updated_sources,
                  sep='\\n  ', flush=True)
        else:
            print('Local SII compatibility patch is already in place.', flush=True)
        parser=maps/'out'/'parser';output_dir=maps/'out'
        parser.mkdir(parents=True,exist_ok=True);output_dir.mkdir(parents=True,exist_ok=True)
        run_parser_and_graph(maps, game, parser, output_dir)
        pack=make_pack(read_json(parser/'europe-nodes.json'),read_json(parser/'europe-cities.json'),
                       read_json(output_dir/'europe-graph.json'))
        target=args.output.expanduser().resolve();target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(pack,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
        print(f'ГОТОВО: {target}')
        print(f"{len(pack['cities'])} городов · {len(pack['points'])} узлов · {len(pack['links'])} связей")
        print('Открой https://duumbling.github.io/ets_test/ и выбери этот файл в разделе карты.')
    except (OSError,ValueError,RuntimeError,subprocess.CalledProcessError) as exc:
        print('Ошибка:',exc,file=sys.stderr)
        print('При ошибке компиляции проверь Visual Studio C++ Build Tools. '
              'При EPERM проверь, не блокирует ли антивирус или другое приложение '
              'папку node_modules.',file=sys.stderr)
        sys.exit(1)


if __name__=='__main__':main()
