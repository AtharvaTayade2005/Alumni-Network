"""
Automated Test Runner for Alumni Network Auth Test Suite.
Executes both pytest and unittest and summarizes results.
"""

import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).parent


def run_pytest():
    print("=" * 70)
    print(">>> RUNNING PYTEST TEST SUITE (pytest tests/python/test_auth_pytest.py)")
    print("=" * 70)
    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(BASE_DIR / "test_auth_pytest.py"), "-v", "--tb=short"],
        cwd=str(BASE_DIR.parent.parent),
    )
    return result.returncode


def run_unittest():
    print("\n" + "=" * 70)
    print(">>> RUNNING UNITTEST SUITE (python -m unittest tests/python/test_auth_unittest.py)")
    print("=" * 70)
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "tests/python/test_auth_unittest.py", "-v"],
        cwd=str(BASE_DIR.parent.parent),
    )
    return result.returncode


if __name__ == "__main__":
    pytest_exit = run_pytest()
    unittest_exit = run_unittest()

    print("\n" + "=" * 70)
    print("TEST EXECUTION SUMMARY:")
    print(f"  Pytest Runner:   {'PASSED [OK]' if pytest_exit == 0 else 'FAILED [X]'}")
    print(f"  Unittest Runner: {'PASSED [OK]' if unittest_exit == 0 else 'FAILED [X]'}")
    print("=" * 70)

    sys.exit(max(pytest_exit, unittest_exit))
