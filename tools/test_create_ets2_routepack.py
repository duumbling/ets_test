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

    def test_nearest(self):
        self.assertEqual(nearest_neighbor_index(8,9,{(0,0):[0,1]},[[0,0],[10,10]]),1)

    def test_empty_graph(self):
        with self.assertRaises(ValueError):
            make_pack([],[],{'graph':[]})

if __name__=='__main__':unittest.main()
