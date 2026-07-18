import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ttf_font_merger_fixed", ROOT / "ttf_font_merger_fixed.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_sync_output_to_target_copies_merged_font(tmp_path):
    output_path = tmp_path / "merged.ttf"
    output_path.write_bytes(b"merged-font-data")

    target_path = tmp_path / "target.ttf"
    target_path.write_bytes(b"old-font-data")

    MODULE.sync_output_to_target(output_path, target_path)

    assert target_path.read_bytes() == b"merged-font-data"
