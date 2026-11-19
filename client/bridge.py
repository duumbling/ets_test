#!/usr/bin/env python3
"""Bridge ETS2 telemetry from SCS Telemetry Hub (localhost SSE) to our WSS relay.

Usage:
    py -m pip install -r client/requirements.txt
    py client/bridge.py --relay wss://NAME.SUBDOMAIN.workers.dev

Optional --demo sends synthetic coordinates without a game (for connection testing).
No Steam login, no tokens, no credentials. The room code is a secret: don't share it publicly.
"""
import argparse
import json
import math
import secrets
import sys
import time
import urllib.request

from websockets.sync.client import connect

ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
DEFAULT_HUB = 'http://127.0.0.1:38471/stream'


def new_code() -> str:
    return ''.join(secrets.choice(ALPHABET) for _ in range(12))


def snapshot_to_packet(message):
    if not isinstance(message, dict) or message.get('type') != 'snapshot':
        return None
    data = message.get('data') or {}
    placement = data.get('placement') or {}
    pos = placement.get('position') or {}
    orient = placement.get('orientation') or {}
    x, z = pos.get('x'), pos.get('z')
    if not isinstance(x, (int, float)) or not isinstance(z, (int, float)):
        return None
    if not math.isfinite(x) or not math.isfinite(z):
        return None
    speed = data.get('speed_mps') or 0
    heading = orient.get('heading') or 0
    return {
        'type': 'telemetry', 'game': message.get('game', 'ets2'),
        'x': float(x), 'z': float(z),
        'heading': float(heading), 'speedKmh': round(float(speed) * 3.6, 1)
    }


def read_snapshots(endpoint):
    req = urllib.request.Request(endpoint, headers={
        'Accept': 'text/event-stream', 'User-Agent': 'ets2-navigator-starter/0.1'
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        for raw in response:
            if not raw.startswith(b'data:'):
                continue
            try:
                item = json.loads(raw[5:].strip().decode('utf-8'))
                packet = snapshot_to_packet(item)
                if packet:
                    yield packet
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError, TypeError):
                continue


def demo_snapshots():
    t = 0.0
    while True:
        t += .4
        yield {'type': 'telemetry','game': 'ets2','x': 200*math.cos(t/22),
               'z': 200*math.sin(t/22), 'heading': (t/100) % 1,
               'speedKmh': 60 + 15*math.sin(t/3)}
        time.sleep(.4)


def main():
    ap = argparse.ArgumentParser(description='ETS2 Navigator - client bridge')
    ap.add_argument('--relay', required=True, help='wss://...workers.dev, without /ws')
    ap.add_argument('--hub', default=DEFAULT_HUB, help='SCS Telemetry Hub SSE address')
    ap.add_argument('--code', default='', help='Optional fixed 12-character pairing code')
    ap.add_argument('--demo', action='store_true', help='Generate fake data to test the relay without ETS2')
    args = ap.parse_args()
    base = args.relay.rstrip('/')
    if not base.startswith('wss://'):
        ap.error('--relay must begin with wss://')
    code = args.code.strip().upper() if args.code else new_code()
    if len(code) != 12 or any(c not in ALPHABET for c in code):
        ap.error('--code must consist of 12 characters A-H J-N P-Z 2-9')
    from urllib.parse import urlencode
    ws_url = f"{base}/ws?{urlencode({'role':'sender','code':code})}"
    print('\n' + '='*54)
    print(' ETS2 NAVIGATOR - КОД СЕАНСА: ', code)
    print(' Введите этот код на вашем сайте GitHub Pages.')
    print(' Не публикуйте код: он даёт доступ к телеметрии.')
    print('='*54)
    print('Режим:', 'ТЕСТОВЫЙ (без игры)' if args.demo else 'ETS2 / SCS Telemetry Hub')
    print('Нажмите Ctrl+C для выхода.\n')
    try:
        while True:
            try:
                with connect(ws_url, open_timeout=10, ping_interval=20, ping_timeout=20) as ws:
                    print('[OK] Подключение к реле установлено.')
                    last = 0.0
                    for snapshot in (demo_snapshots() if args.demo else read_snapshots(args.hub)):
                        if time.monotonic()-last < .5: continue
                        ws.send(json.dumps(snapshot, separators=(',',':')))
                        last = time.monotonic()
            except (OSError, ValueError, TimeoutError, Exception) as ex:
                print(f'[WARN] {type(ex).__name__}: {ex}')
                print('Повтор через 4 секунды. Проверьте: игра запущена, DLL установлена, сервер работает.')
                time.sleep(4)
    except KeyboardInterrupt:
        print('\nОтключено.')


if __name__ == '__main__':
    main()
