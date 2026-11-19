// ETS2 Navigator relay. No accounts, no persistence, no game modification.
// Each room is addressed by a random secret 12-character pairing code.
import { DurableObject } from 'cloudflare:workers';
const CODE_RE = /^[A-HJ-NP-Z2-9]{12}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ok: true, service: 'ets2-navigator-relay'}), {
        headers: {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'}
      });
    }
    if (url.pathname !== '/ws') return new Response('Not found', {status: 404});
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket required', {status: 426});
    const code = (url.searchParams.get('code') || '').toUpperCase();
    const role = url.searchParams.get('role');
    if (!CODE_RE.test(code) || !['sender','viewer'].includes(role)) return new Response('Invalid code or role', {status: 400});
    // A random unguessable room code is the only access credential for this MVP.
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  }
};

export class Room extends DurableObject {
  constructor(ctx, env) { super(ctx, env); }
  connections(role) {
    return this.ctx.getWebSockets().filter(ws => ws.readyState===WebSocket.OPEN && ws.deserializeAttachment()?.role===role);
  }
  broadcastStatus() {
    const packet=JSON.stringify({type:'status',senderOnline:this.connections('sender').length>0});
    for (const ws of this.connections('viewer')) { try {ws.send(packet);} catch {} }
  }
  async fetch(request) {
    const url=new URL(request.url);
    const role=url.searchParams.get('role');
    // Avoid confusing multiple game sources in one room.
    if(role==='sender' && this.connections('sender').length>0) return new Response('Sender already connected', {status:409});
    const pair=new WebSocketPair();
    const [client, server]=Object.values(pair);
    server.serializeAttachment({role});
    this.ctx.acceptWebSocket(server);
    if(role==='viewer') server.send(JSON.stringify({type:'status',senderOnline:this.connections('sender').length>0}));
    else this.broadcastStatus();
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message) {
    if(ws.deserializeAttachment()?.role!=='sender' || typeof message!=='string' || message.length>2048) return;
    let payload;
    try {payload=JSON.parse(message);} catch {return;}
    if(payload?.type!=='telemetry'||!Number.isFinite(payload.x)||!Number.isFinite(payload.z)) return;
    const clean={
      type:'telemetry',game:payload.game==='ats'?'ats':'ets2',
      x:payload.x,z:payload.z,
      heading:Number.isFinite(payload.heading)?payload.heading:0,
      speedKmh:Number.isFinite(payload.speedKmh)?payload.speedKmh:0,
      timestamp:Date.now()
    };
    const out=JSON.stringify(clean);
    for(const viewer of this.connections('viewer')) {try{viewer.send(out);}catch{}}
  }
  async webSocketClose() {this.broadcastStatus();}
  async webSocketError() {this.broadcastStatus();}
}
