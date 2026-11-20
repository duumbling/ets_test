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


# SCS map POIs are produced by truckermudgeon/maps in europe-pois.json.
# These are genuine world-space positions; they are not synthesized from cities.
POI_ICON_CATEGORY = {
    'gas_ico': 'fuel',
    'service_ico': 'service',
    'parking_ico': 'parking',
    'weigh_station_ico': 'weigh',
    'dealer_ico': 'dealer',
    'garage_large_ico': 'garage',
    'recruitment_ico': 'recruitment',
}
POI_TYPE_CATEGORY = {
    'company': 'company',
    'ferry': 'ferry',
    'train': 'train',
    'viewpoint': 'viewpoint',
    'landmark': 'landmark',
}
POI_LABELS = {
    'fuel': 'Заправка', 'service': 'Автосервис',
    'parking': 'Парковка / отдых', 'weigh': 'Весовая станция',
    'dealer': 'Дилер грузовиков', 'garage': 'Гараж',
    'recruitment': 'Кадровое агентство', 'company': 'Предприятие',
    'ferry': 'Паром', 'train': 'Поезд', 'viewpoint': 'Смотровая площадка',
    'landmark': 'Достопримечательность',
}


def create_pois(pois_json, ids, points, grid, cell_size=4000.0):
    """Return compact POIs [id, category, name, x, z, graphNode, approx].

    Use an explicitly referenced graph node if present; otherwise spatially
    snap to the closest graph node. This is only an approximate road approach,
    not guaranteed entrance/driveway or turn-by-turn navigation.
    """
    if not isinstance(pois_json, list):
        raise ValueError('POI input must be europe-pois.json array')
    result = []
    seen = set()
    for source_index, poi in enumerate(pois_json):
        if not isinstance(poi, dict):
            continue
        x, z = poi.get('x'), poi.get('y')
        if not isinstance(x, (int, float)) or not isinstance(z, (int, float)):
            continue
        if not math.isfinite(x) or not math.isfinite(z):
            continue
        category = POI_TYPE_CATEGORY.get(poi.get('type'))
        if poi.get('type') == 'facility':
            category = POI_ICON_CATEGORY.get(poi.get('icon'))
        if not category:
            continue
        label = poi.get('label')
        if not isinstance(label, str) or not label.strip():
            label = POI_LABELS[category]
        # Stable within a given exported map; unique even for adjacent pumps.
        key = (category, round(x, 1), round(z, 1), label)
        if key in seen:
            continue
        seen.add(key)
        road_node = None
        refs = ([poi.get('nodeUid')] if poi.get('nodeUid') is not None else [])
        refs += poi.get('itemNodeUids', []) if isinstance(poi.get('itemNodeUids'), list) else []
        for ref in refs:
            if str(ref) in ids:
                road_node = ids[str(ref)]
                break
        approximate = road_node is None
        if approximate:
            road_node = nearest_neighbor_index(x, z, grid, points, cell_size)
        # Keep category and actual world position, even if the reachable graph
        # node is some distance away from this location.
        result.append(['poi-' + str(source_index), category, label.strip()[:120],
                       round(float(x), 2), round(float(z), 2), road_node,
                       1 if approximate else 0])
    return result


def make_pack(nodes_json, cities_json, graph_json, pois_json=None):
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
    pois = create_pois(pois_json, ids, points, grid, cell_size) if pois_json is not None else []
    return {
        'format':FORMAT,'coordinateSystem':'ets2','title':'Дорожный граф ETS2',
        'source':'Из локальной копии ETS2; топология graph generator (truckermudgeon/maps)',
        'points':points,'links':links,'cities':sorted(cities,key=lambda c:c[1].casefold()),
        'pois':pois
    }


def main():
    parser=argparse.ArgumentParser(description='Build ETS2 Navigator routepack from parser+graph files')
    parser.add_argument('--parser-dir',required=True,type=Path)
    parser.add_argument('--graph',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    poi_file = args.parser_dir/'europe-pois.json'
    pack=make_pack(read_json(args.parser_dir/'europe-nodes.json'),
                   read_json(args.parser_dir/'europe-cities.json'),read_json(args.graph),
                   read_json(poi_file) if poi_file.is_file() else None)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('w',encoding='utf-8') as handle:
        json.dump(pack,handle,ensure_ascii=False,separators=(',',':'))
    print(f"Готово: {args.output} | {len(pack['points'])} узлов, "
          f"{len(pack['links'])} направленных связей, {len(pack['cities'])} городов, "
          f"{len(pack['pois'])} объектов")
    print('Это дорожная топология, не точная картинка всех изгибов и не гарантированная модель поворотов.')


if __name__=='__main__':
    main()
