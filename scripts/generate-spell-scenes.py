from pathlib import Path
import json
r=Path(__file__).resolve().parents[1];p=json.loads((r/'src/features/vtt/spell-effects.json').read_text())
sql="-- 042: description-linked spell scenes, durations and automatic area decisions. Apply after 041.\nbegin;\nupdate public.dnd_spells s set combat=j.value from jsonb_each($scenes42$"+json.dumps(p,ensure_ascii=False,separators=(',',':'))+"$scenes42$::jsonb) j where s.id=j.key;\n"+(r/'supabase/patches/spell-scenes.sql').read_text()+"\ncommit;\n"
assert len(sql.encode())<240000,len(sql.encode())
(r/'supabase/migrations/202610240042_spell_scenes.sql').write_text(sql);print(len(sql.encode()),'bytes')
