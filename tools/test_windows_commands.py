"""Regression tests for Windows npm/npx command resolution.

The Linux CI runner cannot execute .cmd wrappers, so these tests simulate
Windows command lookup and confirm subprocess is given the full .cmd path.
"""
import unittest
from unittest.mock import patch

import build_real_map


class WindowsLauncherTests(unittest.TestCase):
    def test_npm_and_npx_are_resolved_as_cmd_files(self):
        for program in ('npm', 'npx'):
            with self.subTest(program=program):
                expected = 'C:\\Program Files\\nodejs\\' + program + '.cmd'

                def which(name):
                    return expected if name == program + '.cmd' else None

                with patch.object(build_real_map.sys, 'platform', 'win32'), \
                     patch.object(build_real_map.shutil, 'which', side_effect=which), \
                     patch.object(build_real_map.subprocess, 'run') as runner:
                    build_real_map.run(program, '--version', cwd='C:\\maps')
                    runner.assert_called_once_with(
                        [expected, '--version'], cwd='C:\\maps', check=True
                    )


class MapCliInstallTests(unittest.TestCase):
    def test_install_skips_postinstall_and_gui_workspaces(self):
        from pathlib import Path

        with patch.object(build_real_map, 'run') as runner:
            build_real_map.install_map_tools(Path('maps'))

        install_args = runner.call_args_list[0].args
        self.assertEqual(install_args[:5], (
            'npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'))
        self.assertNotIn('packages/guis/navigator', install_args)
        self.assertIn('packages/clis/parser', install_args)
        self.assertIn('packages/clis/generator', install_args)
        self.assertEqual(runner.call_args_list[1].args[:4],
                         ('npm', 'run', 'build', '--workspace'))

    def test_uses_typescript_entrypoints_without_postinstall_symlinks(self):
        from pathlib import Path

        with patch.object(build_real_map, 'run') as runner:
            with patch.dict(build_real_map.os.environ, {}, clear=False):
                build_real_map.run_parser_and_graph(
                    Path('maps'), Path('game'), Path('maps/out/parser'),
                    Path('maps/out'))

        self.assertEqual(runner.call_count, 2)
        self.assertEqual(runner.call_args_list[0].args[:4],
                         ('npx', '--no-install', 'tsx',
                          'packages/clis/parser/index.ts'))
        self.assertEqual(runner.call_args_list[1].args[:4],
                         ('npx', '--no-install', 'tsx',
                          'packages/clis/generator/index.ts'))

    def test_graph_generation_avoids_broken_tinypool_check(self):
        from pathlib import Path

        with patch.object(build_real_map, 'run') as runner:
            build_real_map.run_parser_and_graph(
                Path('maps'), Path('game'), Path('maps/out/parser'),
                Path('maps/out'))
        graph_args = runner.call_args_list[1].args
        self.assertEqual(graph_args[:4], (
            'npx', '--no-install', 'tsx', 'packages/clis/generator/index.ts'))
        self.assertIn('graph', graph_args)
        self.assertNotIn('-c', graph_args)
        self.assertNotIn('--check', graph_args)

    def test_graph_only_reuses_existing_parser_output(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            parser = root / 'out/parser'
            parser.mkdir(parents=True)
            (parser / 'europe-nodes.json').write_text('[]')
            (parser / 'europe-cities.json').write_text('[]')
            with patch.object(build_real_map, 'run') as runner:
                build_real_map.run_parser_and_graph(
                    root, root / 'game', parser, root / 'out', graph_only=True)
            self.assertEqual(runner.call_count, 1)
            graph_args = runner.call_args.args
            self.assertEqual(graph_args[:4], (
                'npx', '--no-install', 'tsx',
                'packages/clis/generator/index.ts'))
            self.assertNotIn('-c', graph_args)

    def test_graph_only_rejects_incomplete_parser_output(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(build_real_map, 'run') as runner:
                with self.assertRaisesRegex(RuntimeError, 'missing'):
                    build_real_map.run_parser_and_graph(
                        root, root / 'game', root / 'out/parser',
                        root / 'out', graph_only=True)
                runner.assert_not_called()


if __name__ == '__main__':
    unittest.main()
