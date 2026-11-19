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


if __name__ == '__main__':
    unittest.main()
