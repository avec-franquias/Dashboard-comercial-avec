import subprocess
from pathlib import Path

STABLE = "c37c1387530923db4dccaa7cdbf751b37435f71e"

subprocess.run(["git","fetch","origin",STABLE,"--depth=1"], check=True)
html = subprocess.check_output(["git","show",f"{STABLE}:index.html"])
Path("index.html").write_bytes(html)
print("Extrator restaurado para a ultima versao estavel:", STABLE)
