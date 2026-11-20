"""Validate the OpenHaul release's actual ready-to-use ETS2 vector map.

This only downloads a publisher-provided public release artifact on a CI
runner. It never scans, includes, or republishes SCS game files.
"""
import gzip
import json
import struct
import urllib.request

URL = ("https://github.com/NekoSuneProjects/OpenHaul/releases/download/map-data/"
       "ets2-a24c1761d59c69b02cbe811a6ee62d6e8be457b804b1207b9cc86f9d06d8de3e.pmtiles")

def main():
    req=urllib.request.Request(URL,headers={"User-Agent":"ETS2-Navigator-map-compatibility-check"})
    with urllib.request.urlopen(req,timeout=60) as r:
        data=r.read()
    print("Downloaded official OpenHaul release PMTiles bytes:",len(data))
    if len(data)<1000 or data[:7]!=b"PMTiles" or data[7]!=3:
        raise ValueError("Not a PMTiles v3 archive")
    off,sz=struct.unpack_from("<QQ",data,24)
    comp=data[97]
    tiletype=data[99]
    meta=data[off:off+sz]
    if comp==2:meta=gzip.decompress(meta)
    elif comp!=1:raise ValueError(f"Unsupported PMTiles metadata compression {comp}")
    info=json.loads(meta)
    layer_ids=[str(layer.get("id")) for layer in info.get("vector_layers",[])]
    if tiletype!=1 or not layer_ids or not any(x in layer_ids for x in ("ets2","europe")):
        raise ValueError(f"Unsupported ETS2 vector tile data: type={tiletype} layers={layer_ids}")
    print("Vector source layers:",layer_ids)
    print("Zoom range:",data[100],data[101])
    print("PMTiles metadata fields:",list(info.keys()))
    print("OpenHaul visual map asset verified; DLC completeness and routing not established.")
if __name__=="__main__":main()
