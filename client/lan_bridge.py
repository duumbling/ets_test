#!/usr/bin/env python3
"""ETS2 Navigator LAN bridge: SCS Telemetry Hub -> authenticated local WebSocket.
Usage:
  py -m pip install -r client/requirements.txt
  py client/lan_bridge.py --demo
  py client/lan_bridge.py

Local only. Do not forward the port to the Internet.
"""
import argparse
import asyncio
import json
import secrets
import socket
import threading
import time
from urllib.parse import parse_qs, urlsplit

from websockets.asyncio.server import serve
from bridge import ALPHABET, DEFAULT_HUB, demo_snapshots, new_code, read_snapshots


def local_addresses():
    found = set()
    try:
        for answer in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = answer[4][0]
            if not ip.startswith('127.') and ip != '0.0.0.0':
                found.add(ip)
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('192.0.2.1', 80))  # no packets sent
            found.add(sock.getsockname()[0])
    except OSError:
        pass
    return sorted(found)


class Hub:
    def __init__(self, code):
        self.code = code
        self.viewers = set()
        self.sender_online = False
        self.last_packet = None

    async def status(self):
        await self.broadcast({'type': 'status', 'senderOnline': self.sender_online})

    async def broadcast(self, packet):
        if not self.viewers:
            return
        message = json.dumps(packet, ensure_ascii=False, separators=(',', ':'))
        await asyncio.gather(*(self.send_to(ws, message) for ws in tuple(self.viewers)))

    async def send_to(self, ws, message):
        try:
            await ws.send(message)
        except Exception:
            self.viewers.discard(ws)

    async def publish(self, packet):
        if not self.sender_online:
            self.sender_online = True
            await self.status()
        self.last_packet = packet
        await self.broadcast(packet)

    async def unavailable(self):
        if self.sender_online:
            self.sender_online = False
            await self.status()

    async def viewer(self, ws):
        parsed = urlsplit(ws.request.path)
        params = parse_qs(parsed.query)
        code = params.get('code', [''])[0].strip().upper()
        role = params.get('role', [''])[0]
        if parsed.path != '/ws' or role != 'viewer' or not secrets.compare_digest(code, self.code):
            await ws.close(code=1008, reason='Неверный код или адрес подключения')
            return
        origin = ws.request.headers.get('Origin', '')
        o = urlsplit(origin)
        ok = (origin == 'https://duumbling.github.io' or
              (o.scheme == 'http' and o.hostname in ('localhost', '127.0.0.1')))
        if not ok:
            await ws.close(code=1008, reason='Не разрешён источник подключения')
            return
        self.viewers.add(ws)
        try:
            await ws.send(json.dumps({'type': 'status', 'senderOnline': self.sender_online}))
            if self.last_packet is not None and self.sender_online:
                await ws.send(json.dumps(self.last_packet))
            await ws.wait_closed()
        finally:
            self.viewers.discard(ws)


def producer(loop, hub, endpoint, demo, stop):
    while not stop.is_set():
        try:
            snapshots = demo_snapshots() if demo else read_snapshots(endpoint)
            last = 0
            for packet in snapshots:
                if stop.is_set():
                    return
                if time.monotonic() - last < .4:
                    continue
                asyncio.run_coroutine_threadsafe(hub.publish(packet), loop).result(timeout=5)
                last = time.monotonic()
            raise RuntimeError('Поток телеметрии прервался')
        except Exception as error:
            print(f'[WARN] Нет данных от игры: {error}', flush=True)
            try:
                asyncio.run_coroutine_threadsafe(hub.unavailable(), loop).result(timeout=5)
            except Exception:
                pass
            stop.wait(3)


async def run(args):
    hub = Hub(args.code)
    stop = threading.Event()
    loop = asyncio.get_running_loop()
    thread = threading.Thread(target=producer, args=(loop, hub, args.hub, args.demo, stop), daemon=True)
    async with serve(hub.viewer, args.host, args.port, max_size=4096, ping_interval=20):
        print('\n' + '=' * 62, flush=True)
        print(' ETS2 NAVIGATOR · ЛОКАЛЬНОЕ ПОДКЛЮЧЕНИЕ', flush=True)
        print(' Код сеанса:', args.code, flush=True)
        print(' На ПК:       ws://127.0.0.1:' + str(args.port), flush=True)
        for ip in local_addresses():
            print(f' На телефоне:  ws://{ip}:{args.port} (одна Wi-Fi сеть)', flush=True)
        print(' Режим: ' + ('ДЕМО (не ETS2)' if args.demo else 'Телеметрия ETS2'), flush=True)
        print(' В браузере выбери «Локальная сеть» и введи адрес и код.', flush=True)
        print(' Не перенаправляй этот порт в интернет. Ctrl+C — выход.', flush=True)
        print('=' * 62 + '\n', flush=True)
        thread.start()
        try:
            await asyncio.Future()
        finally:
            stop.set()


def main():
    ap = argparse.ArgumentParser(description='ETS2 Navigator LAN/WebSocket bridge')
    ap.add_argument('--host', default='0.0.0.0', help='IP для прослушивания, 0.0.0.0 = вся локальная сеть')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--hub', default=DEFAULT_HUB, help='SCS Telemetry Hub SSE endpoint')
    ap.add_argument('--code', default='', help='Необязательный фиксированный 12-символьный код')
    ap.add_argument('--demo', action='store_true', help='Тестовые данные без игры')
    args = ap.parse_args()
    args.code = args.code.upper().strip() if args.code else new_code()
    if len(args.code) != 12 or any(c not in ALPHABET for c in args.code):
        ap.error('Код должен состоять из 12 символов A-H J-N P-Z 2-9')
    if not 1 <= args.port <= 65535:
        ap.error('Неверный порт')
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print('\nОстановлено.')


if __name__ == '__main__':
    main()
