"""Generate 043 and the same final schema section; never rewrite migrations 001–042."""
from pathlib import Path
import json
r=Path(__file__).resolve().parents[1]
profiles=json.loads((r/'src/features/vtt/spell-effects.json').read_text())
sql="-- 043: NPCs, condições e visão. Execute após 042.\nbegin;\n"
for id in ['ver-o-invisivel','escuridao']:
    profile=json.dumps(profiles[id],ensure_ascii=False,separators=(',',':'))
    sql+="update public.dnd_spells set combat=$vision43$"+profile+"$vision43$::jsonb where id='"+id+"';\n"
sql+="update public.dnd_spells set data=data||'{\"range\":\"18 metros (12 quadrados)\"}'::jsonb where id='escuridao';\n"
sql+=(r/'supabase/patches/npcs-conditions-vision.sql').read_text()+"\nnotify pgrst,'reload schema';\ncommit;\n"
assert len(sql.encode())<240000
(r/'supabase/migrations/202610240043_npcs_conditions_and_vision.sql').write_text(sql)
schema=r/'supabase/schema.sql';base=schema.read_text().split('\n-- BEGIN NPCS-CONDITIONS-VISION 043')[0]
schema.write_text(base+'\n-- BEGIN NPCS-CONDITIONS-VISION 043\n'+sql+'\n-- END NPCS-CONDITIONS-VISION 043\n')
print(len(sql.encode()),'bytes')
