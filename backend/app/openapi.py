import sys

import yaml

from app.main import app

if __name__ == "__main__":
    yaml.safe_dump(app.openapi(), sys.stdout, allow_unicode=True, sort_keys=False)
