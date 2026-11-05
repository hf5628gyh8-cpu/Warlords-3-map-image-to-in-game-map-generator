from pathlib import Path
import json,base64,ast
out=Path('outputs');s=Path('outputs/warlords3_water_generator.py').read_text();tree=ast.parse(s)
water=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PATTERNS' for t in n.targets))
mount=json.loads((out/'mountain_observed_patterns.json').read_text())['patterns']
data='const TEMPLATE_B64='+json.dumps(base64.b64encode((out/'warlords3_clean_80x100.w3s').read_bytes()).decode())+';\nconst MOUNTAIN_PATTERNS='+json.dumps(mount)+';\nconst WATER_PATTERNS='+json.dumps(water)+';\n'
core=Path('work/converter/core.js').read_text();shell=Path('work/converter/shell.html').read_text()
(out/'warlords3_image_converter.html').write_text(shell.replace('/*__DATA__*/',data).replace('/*__CORE__*/',core))
Path('work/converter/engine.js').write_text(data+core+'\nglobalThis.W3=W3;')
print('Built', (out/'warlords3_image_converter.html').stat().st_size,'byte self-contained converter')
