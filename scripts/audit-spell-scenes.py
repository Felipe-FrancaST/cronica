"""Description-linked scene rules and coverage ledger for the supplied 2014 catalogue."""
from pathlib import Path
import json,re,hashlib,unicodedata
root=Path(__file__).resolve().parents[1]
spells=json.loads((root/'src/systems/dnd5e/data/spells.json').read_text());profiles=json.loads((root/'src/features/vtt/spell-effects.json').read_text());scenes={}
def scene(ids,**fields):
 for id in ids.split():scenes.setdefault(id,{}).update(fields)
def light(id,bright,dim,anchor='point',**fields):scene(id,light=dict(bright=bright,dim=dim,anchor=anchor,**fields))
profiles['escuridao']['range']=18
light('luz',6,6,'target');light('chama-continua',6,6,'target');light('globos-de-luz',0,3,count=4)
light('produzir-chama',3,3,'caster');light('lamina-flamejante',3,3,'caster');light('esfera-flamejante',6,6)
light('fogo-das-fadas',0,3,'failedTargets');light('luz-do-dia',18,18,'target');light('raio-lunar',0,1.5);light('escudo-de-fogo',3,3,'caster');light('raio-de-sol',9,9,'caster')
scene('nevoa nevasca nevoa-mortal',visual='mist',opaque=True);scene('escuridao',visual='darkness',darkness='magical');scene('fome-de-hadar',visual='void',darkness='absolute',difficult=True)
scene('esfera-flamejante muralha-de-fogo nuvem-incendiaria',visual='fire');scene('muralha-de-fogo nuvem-incendiaria',opaque=True)
scene('nevoa-mortal',drift={'metres':3,'mode':'away'})
scene('nuvem-incendiaria',drift={'metres':3,'mode':'bearing'})
scene('raio-lunar',visual='radiant');scene('nuvem-de-adagas barreira-de-laminas',visual='blades');scene('crescer-espinhos teia constricao tentaculos-negros-de-evard praga-de-insetos nevasca',difficult=True)
for id,visual in [('crescer-espinhos','thorns'),('teia','web'),('constricao','vines'),('tentaculos-negros-de-evard','void'),('muralha-de-gelo','ice')]:scene(id,visual=visual)
scene('guardioes-espirituais',visual='spirit',anchor='caster');scene('silencio zona-da-verdade circulo-magico',visual='arcane');scene('muralha-de-energia muralha-de-pedra muralha-de-espinhos',visual='barrier');scene('area-escorregadia',visual='grease',difficult=True)
for id,shape,size,width in [('muralha-de-fogo','wall',18,.3),('barreira-de-laminas','wall',30,1.5),('nevoa-mortal','sphere',6,1.5),('nevasca','sphere',12,1.5)]:profiles[id].update(shape=shape,size=size,width=width,maxTargets=99)
profiles['luz'].update(shape='single',size=0,maxTargets=1);profiles['muralha-de-fogo']['timing']='immediate';profiles['forca-fantasmagorica']['save']='int';profiles['onda-trovejante']['durationOverride']='Instantâneo'
for id,triggers in {'nuvem-de-adagas':['enter','start'],'raio-lunar':['enter','start'],'esfera-flamejante':['end'],'nevoa-mortal':['enter','start'],'praga-de-insetos':['enter','start'],'nuvem-incendiaria':['enter','end']}.items():scene(id,triggers=triggers)
manual={
'muralha-de-fogo':'Escolha o lado quente. Surgimento: Destreza e metade no sucesso. Gatilhos posteriores: sem salvaguarda, inclusive até 3 m do lado quente.',
'guardioes-espirituais':'Escolha criaturas isentas e dano radiante/necrótico. A aura acompanha o conjurador; aplique apenas aos alvos não isentos.',
'crescer-espinhos':'2d4 por 1,5 m percorrido, não por início/fim de turno.',
'fome-de-hadar':'Início: 2d6 frio sem teste. Fim: Destreza para evitar 2d6 ácido. Use os controles manuais para cada fase.',
'globos-de-luz':'O ponto representa o grupo de quatro luzes ou sua forma combinada. Mova como ação bônus, até 18 m, dentro de 36 m do conjurador. A separação individual fica com o mestre.',
'produzir-chama':'Escolha iluminar ou arremessar. Arremessar encerra a chama e exige ataque mágico; iluminar não causa dano.',
'nevoa-mortal':'A névoa se desloca automaticamente 3 m para longe do conjurador a cada turno dele. Dispersão por vento é decidida pelo mestre.',
'nuvem-incendiaria':'A nuvem se desloca automaticamente 3 m no começo do turno do conjurador na direção escolhida ao conjurar. Dispersão por vento é decidida pelo mestre.'}
for id,note in manual.items():scene(id,manual=note)
ledger=[]
for s in spells:
 id=s['id'];e=profiles[id];rule=scenes.setdefault(id,{});duration=e.get('durationOverride',s['duration']);m=re.search(r'(\d+)\s*(rodada|turno|minuto|hora|dia)',duration,re.I)
 if m:rule['rounds']=int(m[1])*{'rodada':1,'turno':1,'minuto':10,'hora':600,'dia':14400}[m[2].lower()]
 persistent=not duration.lower().startswith('instant')
 if persistent and e['shape'] in ['sphere','cube','wall'] and e['size']>0 and id not in ['luz','produzir-chama','lamina-flamejante']:rule.setdefault('visual','arcane')
 if not persistent:rule.pop('visual',None);rule.pop('light',None)
 if rule.get('visual'):rule['persistent']=True
 if id in ['produzir-chama','lamina-flamejante','raio-de-sol','escudo-de-fogo']:rule['anchor']='caster'
 e['scene']=rule;implemented=[];review=[]
 for key,label in [('light','iluminação no mapa'),('visual','área persistente 2D/3D'),('triggers','gatilhos de entrada/turno com testes')]:
  if rule.get(key):implemented.append(label)
 if e['dice']:implemented.append('cálculo numérico existente')
 if e['save']:implemented.append('CD da classe de conjuração')
 if e.get('condition'):implemented.append('condição rastreada')
 if e['review']:review.append('Conferir elegibilidade, escolhas e exceções da descrição com o mestre.')
 if rule.get('manual'):review.append(rule['manual'])
 if e['kind']=='utility' and not any(rule.get(k) for k in ['light','visual']) and not e.get('condition'):review.append('Efeito narrativo/especial: não altera automaticamente estatísticas, inventário, criaturas ou cenário.')
 ledger.append(dict(id=id,name=s['name'],level=s['level'],description=s['description'],description_sha256=hashlib.sha256(s['description'].encode()).hexdigest(),duration=duration,implementation=implemented,review=review,scene=rule))
for path,data in [('src/features/vtt/spell-scenes.json',scenes),('src/features/vtt/spell-effects.json',profiles),('docs/auditoria-magias-grid.json',ledger)]: (root/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
audit=json.loads((root/'src/features/vtt/spell-audit.json').read_text())
for id,e in profiles.items():audit[id]['initialSave']=e['save']
(root/'src/features/vtt/spell-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
sort=lambda row:''.join(c for c in unicodedata.normalize('NFD',row['name'].casefold()) if not unicodedata.combining(c))
lines=['# Auditoria das magias no grid','',str(len(ledger))+' descrições, base 2014. O JSON conserva o texto e seu SHA-256. A tabela separa execução pelo programa das decisões necessárias na mesa.','','| Magia | Círculo | Implementação | Conferência / escolhas |','|---|---:|---|---|']
for row in sorted(ledger,key=sort):lines.append('| '+row['name']+' | '+str(row['level'])+' | '+('; '.join(row['implementation']) or 'Registro conforme descrição')+' | '+('; '.join(row['review']) or 'Cálculo conforme perfil')+' |')
(root/'docs/auditoria-magias-grid.md').write_text('\n'.join(lines)+'\n')
print(len(ledger),'descrições;',sum(bool(x.get('light')) for x in scenes.values()),'luzes;',sum(bool(x.get('visual')) for x in scenes.values()),'áreas')
