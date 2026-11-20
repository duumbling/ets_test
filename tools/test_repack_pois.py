"""Ensure POI enrichment can be done from cached graph/parser outputs only."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


class CachedPoiExportTests(unittest.TestCase):
    def test_repack_without_node_or_game_installation(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / 'maps'
            (root / 'out' / 'parser').mkdir(parents=True)
            (root / 'package.json').write_text('{}', encoding='utf-8')
            parser = root / 'out' / 'parser'
            (parser / 'europe-nodes.json').write_text(json.dumps([
                {'uid':'n0','x':0,'y':0}, {'uid':'n1','x':20,'y':0}
            ]), encoding='utf-8')
            (parser / 'europe-cities.json').write_text(json.dumps([
                {'token':'a','name':'A','x':0,'y':0},
                {'token':'b','name':'B','x':20,'y':0}
            ]), encoding='utf-8')
            (parser / 'europe-pois.json').write_text(json.dumps([
                {'type':'facility','icon':'gas_ico','x':15,'y':1}
            ]), encoding='utf-8')
            (root / 'out' / 'europe-graph.json').write_text(json.dumps({
                'graph': [
                    ['n0',{'forward':[{'nodeUid':'n1','distance':20}],'backward':[]}],
                    ['n1',{'forward':[],'backward':[]}],
                ]
            }), encoding='utf-8')
            output=Path(tmp)/'export.json'
            script=Path(__file__).with_name('build_real_map.py')
            result=subprocess.run([
                sys.executable,str(script),'--repack-only',
                '--toolchain-dir',str(root),'--output',str(output)
            ],capture_output=True,text=True,encoding='utf-8',
               env={**os.environ, 'PYTHONIOENCODING':'utf-8'})
            self.assertEqual(result.returncode,0,msg=result.stdout+'\n'+result.stderr)
            data=json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(len(data['pois']),1)
            self.assertEqual(data['pois'][0][1],'fuel')
            self.assertEqual(len(data['links']),1)

if __name__ == '__main__':
    unittest.main()
