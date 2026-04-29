"""One-off: splice tools/leomund_shell_new.txt into src/pages/Warehouse.jsx"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
wh = root / 'src/pages/Warehouse.jsx'
new = (root / 'tools/leomund_shell_new.txt').read_text(encoding='utf-8')
t = wh.read_text(encoding='utf-8')
start = t.index('          <div className={WAREHOUSE_PUBLIC_BAG_OUTER_SHELL_CLASS}>')
end = t.find('      </div>\n\n      {/* 魔法物品制作工厂 */}', start)
if end < 0:
    raise SystemExit('end marker not found')
wh.write_text(t[:start] + new + t[end:], encoding='utf-8')
print('OK', wh)
