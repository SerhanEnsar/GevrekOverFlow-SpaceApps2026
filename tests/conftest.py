import os
import sys
from pathlib import Path

# GDAL compares option names case-insensitively; a Turkish locale breaks that.
os.environ["LC_ALL"] = "C.UTF-8"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
