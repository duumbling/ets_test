import unittest
from create_ets2_routepack import make_pack, nearest_neighbor_index


class RoutePackTests(unittest.TestCase):
    def test_graph_conversion(self):
        nodes=[{'uid':'a','x':0,'y':0,'z':10}, {'uid':'b','x':10,'y':0,'z':11},
               {'uid':'c','x':20,'y':10,'z':12}]
        cities=[{'token':'alpha','name':'Alpha','x':0,'y':0},
                {'token':'beta','name':'Beta','x':19,'y':9}]
        graph={'graph':[
            ['a', {'forward':[{'nodeUid':'b','distance':12}], 'backward':[]}],
            ['b', {'forward':[{'nodeUid':'c','distance':18}], 'backward':[]}],
            ['c', {'forward':[], 'backward':[]}]]}
        p=make_pack(nodes,cities,graph)
        self.assertEqual(p['format'],'ets2-routepack-v1')
        self.assertEqual(p['points'],[[0.0,0.0],[10.0,0.0],[20.0,10.0]])
        self.assertEqual(p['links'],[[0,1,12.0],[1,2,18.0]])
        self.assertEqual([c[4] for c in p['cities']],[0,2])

    def test_actual_ets2_pois_have_categories_and_road_nodes(self):
        nodes=[
            {'uid':'node-a','x':0,'y':0},
            {'uid':'node-b','x':10,'y':0},
            {'uid':'node-c','x':20,'y':0},
        ]
        cities=[{'token':'city-a','name':'City A','x':0,'y':0},
                {'token':'city-b','name':'City B','x':20,'y':0}]
        graph={'graph':[
            ['node-a',{'forward':[{'nodeUid':'node-b','distance':10}],'backward':[]}],
            ['node-b',{'forward':[{'nodeUid':'node-c','distance':10}],'backward':[]}],
            ['node-c',{'forward':[],'backward':[]}],
        ]}
        pois=[
            {'type':'facility','icon':'gas_ico','x':9,'y':1,
             'nodeUid':'node-b'},
            {'type':'facility','icon':'service_ico','x':20.1,'y':2},
            {'type':'facility','icon':'parking_ico','x':-2,'y':1},
            {'type':'facility','icon':'garage_large_ico','x':8,'y':1},
            {'type':'company','label':'Cargo Depot','x':2,'y':2},
            {'type':'ferry','label':'Ferry Terminal','x':6,'y':3},
            {'type':'road','icon':'generic_road_ico','x':4,'y':2},
            {'type':'facility','icon':'gas_ico','x':9,'y':1,
             'nodeUid':'node-b'},
        ]
        p=make_pack(nodes,cities,graph,pois)
        self.assertEqual([poi[1] for poi in p['pois']],
                         ['fuel','service','parking','garage','company','ferry'])
        self.assertEqual(p['pois'][0][5],1)
        self.assertEqual(p['pois'][0][6],0)  # explicit anchor
        self.assertEqual(p['pois'][1][5],2)
        self.assertEqual(p['pois'][1][6],1)  # approximate snap
        self.assertEqual(p['pois'][2][5],0)
        self.assertEqual(p['pois'][4][2],'Cargo Depot')

    def test_nearest(self):
        self.assertEqual(nearest_neighbor_index(8,9,{(0,0):[0,1]},[[0,0],[10,10]]),1)

    def test_empty_graph(self):
        with self.assertRaises(ValueError):
            make_pack([],[],{'graph':[]})

if __name__=='__main__':unittest.main()
