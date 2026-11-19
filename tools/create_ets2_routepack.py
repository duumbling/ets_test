#!/usr/bin/env python3
"""Convert ETS2 node/city/graph JSON from truckermudgeon/maps to a compact local routepack.

All input files must be generated from the user's own copy of ETS2. This
converter never downloads or redistributes game resources. Requires Python 3.10+.

Usage:
    py tools/create_ets2_routepack.py --parser-dir C:\\maps\\out\\parser \
      --graph C:\\maps\\out\\europe-graph.json \
      --output C:\\maps\\ets2-routepack.json

Input: europe-nodes.json, europe-cities.json, europe-graph.json.
Output: ets2-routepack-v1.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


FORMAT = 'ets2-routepack-v1'


def read_json(path: Path):
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)


def nearest_neighbor_index(x, z, grid, points, cell_size=4000.0):
    bx, bz = math.floor(x / cell_size), math.floor(z / cell_size)
    best, best_dist = None, float('inf')
    # Search concentric squares and stop when all closer cells are scanned.
    for radius in range(0, 18):
        for xx in range(bx-radius, bx+radius+1):
            for zz in range(bz-radius, bz+radius+1):
                if max(abs(xx-bx),abs(zz-bz)) != radius:
                    continue
                for idx in grid.get((xx,zz), ()):
                    px,pz=points[idx]
                    dist=(x-px)**2+(z-pz)**2
                    if dist<best_dist:best,best_dist=idx,dist
        if best is not None and (radius * cell_size)**2 > best_dist * 2:
            return best
    if best is not None:
        return best
    # Fallback for outlying cities / very sparse games.
    return min(range(len(points)),key=lambda i:(points[i][0]-x)**2+(points[i][1]-z)**2)


def make_pack(nodes_json, cities_json, graph_json):
    if not isinstance(nodes_json,list) or not isinstance(cities_json,list):
        raise ValueError('Nodes and cities must be arrays from truckermudgeon/maps parser')
    if not isinstance(graph_json,dict) or not isinstance(graph_json.get('graph'),list):
        raise ValueError('Graph file must have a graph array from truckermudgeon/maps generator')
    all_nodes={str(n['uid']): n for n in nodes_json
               if isinstance(n,dict) and 'uid' in n and
               isinstance(n.get('x'), (int,float)) and isinstance(n.get('y'), (int,float))}
    keys=set()
    for entry in graph_json['graph']:
        if not isinstance(entry,list) or len(entry)!=2:continue
        source, neighbors=entry
        keys.add(str(source))
        for direction in ('forward','backward'):
            for nxt in neighbors.get(direction,[]):
                if isinstance(nxt,dict) and 'nodeUid' in nxt:
                    keys.add(str(nxt['nodeUid']))
    node_uids=sorted(uid for uid in keys if uid in all_nodes)
    if len(node_uids)<2:
        raise ValueError('Graph has too few nodes with matching coordinates')
    ids={uid:i for i,uid in enumerate(node_uids)}
    # ETS2's horizontal map coordinate y is the telemetry world z axis.
    points=[[round(float(all_nodes[uid]['x']),2),round(float(all_nodes[uid]['y']),2)]
            for uid in node_uids]
    outgoing={}
    for source, neighbors in graph_json['graph']:
        source_idx=ids.get(str(source))
        if source_idx is None:continue
        if not isinstance(neighbors,dict):continue
        for direction in ('forward','backward'):
            for neighbor in neighbors.get(direction,[]):
                target_idx=ids.get(str(neighbor.get('nodeUid')))
                if target_idx is None or target_idx==source_idx:continue
                distance=neighbor.get('distance')
                if not isinstance(distance,(int,float)) or not math.isfinite(distance) or distance<=0:
                    continue
                key=(source_idx,target_idx)
                outgoing[key]=min(outgoing.get(key,float('inf')),float(distance))
    links=[[a,b,round(length,1)] for (a,b),length in sorted(outgoing.items())]
    if not links:raise ValueError('Graph has no usable links')
    grid={};cell_size=4000.0
    for i,(x,z) in enumerate(points):
        grid.setdefault((math.floor(x/cell_size),math.floor(z/cell_size)),[]).append(i)
    cities=[];seen=set()
    for city in cities_json:
        if not isinstance(city,dict):continue
        city_id=city.get('token');name=city.get('nameLocalized') or city.get('name')
        x,z=city.get('x'),city.get('y')
        if not isinstance(city_id,str) or not isinstance(name,str) or city_id in seen:
            continue
        if not isinstance(x,(int,float)) or not isinstance(z,(int,float)):
            continue
        near=nearest_neighbor_index(x,z,grid,points,cell_size)
        cities.append([city_id,name,round(float(x),2),round(float(z),2),near])
        seen.add(city_id)
    if len(cities)<2:raise ValueError('Found fewer than two valid cities')
    return {
        'format':FORMAT,'coordinateSystem':'ets2','title':'Дорожный граф ETS2',
        'source':'Из локальной копии ETS2; топология graph generator (truckermudgeon/maps)',
        'points':points,'links':links,'cities':sorted(cities,key=lambda c:c[1].casefold())
    }


def main():
    parser=argparse.ArgumentParser(description='Build ETS2 Navigator routepack from parser+graph files')
    parser.add_argument('--parser-dir',required=True,type=Path)
    parser.add_argument('--graph',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    pack=make_pack(read_json(args.parser_dir/'europe-nodes.json'),
                   read_json(args.parser_dir/'europe-cities.json'),read_json(args.graph))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('w',encoding='utf-8') as handle:
        json.dump(pack,handle,ensure_ascii=False,separators=(',',':'))
    print(f"Готово: {args.output} | {len(pack['points'])} узлов, "
          f"{len(pack['links'])} направленных связей, {len(pack['cities'])} городов")
    print('Это дорожная топология, не точная картинка всех изгибов и не гарантированная модель поворотов.')


if __name__=='__main__':
    main()
