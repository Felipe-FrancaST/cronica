"""Review the supplied 2014 catalogue without mistaking later checks for initial saves."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1];path=root/'src/features/vtt'
spells=json.loads((root/'src/systems/dnd5e/data/spells.json').read_text());profiles=json.loads((path/'spell-effects.json').read_text())
initial={'dex':'area-escorregadia fogo-das-fadas esfera-resiliente-de-otiluke inverter-a-gravidade','str':'constricao lufada-de-vento','con':'cegueira-surdez carne-para-pedra','wis':'comando enfeiticar-animal enfeiticar-pessoa forcar-duelo riso-histerico-de-tasha cativar coroa-da-loucura forca-fantasmagorica imobilizar-pessoa sugestao lentidao medo padrao-hipnotico rogar-maldicao assassino-fantasmagorico compulsao confusao dominar-animais dominar-pessoa imobilizar-monstro missao modificar-memoria ataque-visual sugestao-em-massa dominar-monstro antipatia-simpatia aprisionamento pavor','cha':'maldicao acalmar-emocoes zona-da-verdade banimento ancora-planar palavra-divina'}
changed=set()
for ability,ids in initial.items():
 for id in ids.split():profiles[id]['save']=ability;changed.add(id)
# Only conditions with a clear initial outcome; special eligibility still follows the description.
conditions={'constricao':('Impedido','',10),'imobilizar-pessoa':('Paralisado','end',10),'imobilizar-monstro':('Paralisado','end',10),'enfeiticar-pessoa':('Enfeitiçado','',600),'enfeiticar-animal':('Enfeitiçado','',14400),'cegueira-surdez':('Cego','end',10),'coroa-da-loucura':('Enfeitiçado','end',10),'medo':('Amedrontado','',10),'padrao-hipnotico':('Incapacitado','',10),'riso-histerico-de-tasha':('Incapacitado','end',10),'area-escorregadia':('Caído','',0),'raio-doentio':('Envenenado','',1),'toque-chocante':('Reações bloqueadas','',1),'toque-macabro':('Cura bloqueada','',1),'zombaria-malevola':('Desvantagem no próximo ataque','',1)}
for id,(condition,repeat,rounds) in conditions.items():profiles[id].update(condition=condition,repeatSave=repeat,conditionRounds=rounds,review=True);changed.add(id)
patches={'raio-doentio':{'effectSave':'con'},'mente-debil':{'effectSave':'int','review':True},'raio-do-enfraquecimento':{'attackRoll':True,'review':True},'constricao':{'shape':'cube','size':6,'range':27},'fogo-das-fadas':{'shape':'cube','size':6,'range':18},'area-escorregadia':{'shape':'cube','size':3,'range':18},'padrao-hipnotico':{'shape':'cube','size':9,'range':36},'medo':{'shape':'cone','size':9,'range':9,'origin':'self'},'acalmar-emocoes':{'shape':'sphere','size':6,'range':18},'zona-da-verdade':{'shape':'sphere','size':4.5,'range':18},'lentidao':{'shape':'cube','size':12,'range':36,'selective':True,'maxTargets':6},'maldicao':{'selective':True,'maxTargets':3,'targetsPerSlot':1},'onda-trovejante':{'timing':'immediate'},'flecha-acida-de-melf':{'attackRoll':True,'missHalf':True,'review':True,'note':'O ataque aplica metade do dano inicial no erro. O dano posterior segue o gatilho da descrição.'},'vitalidade-ilusoria':{'kind':'temporary','dice':'1d4+4','upcast':'5','shape':'self','origin':'self','range':0,'review':False},'armadura-de-agathys':{'kind':'temporary','dice':'5','upcast':'5','shape':'self','origin':'self','range':0,'review':True}}
for id in 'imobilizar-pessoa imobilizar-monstro enfeiticar-pessoa banimento cegueira-surdez comando'.split():patches.setdefault(id,{})['targetsPerSlot']=1
patches['toque-chocante']={'expiryScope':'target_start'}
patches['toque-macabro']={'expiryScope':'source_start'}
patches['zombaria-malevola']={'expiryScope':'target_end'}
for id,p in patches.items():profiles[id].update(p);changed.add(id)
abilities={'força':'str','destreza':'dex','constituição':'con','inteligência':'int','sabedoria':'wis','carisma':'cha'};audit={}
for s in spells:
 e=profiles[s['id']];saved=list(dict.fromkeys(abilities[m.lower()] for m in re.findall(r'(?:\bTR|teste de resistência)\s+(?:de\s+)?(Força|Destreza|Constituição|Inteligência|Sabedoria|Carisma)',s['description'],re.I)))
 mode='attack' if e.get('attackRoll') else 'save' if e['save'] else 'numeric' if e['dice'] and e['kind']!='utility' else 'narrative'
 if e['timing']=='trigger':mode='trigger'
 audit[s['id']]={'resolution':mode,'initialSave':e['save'],'effectSave':e.get('effectSave',''),'conditionalSaves':saved,'abilityCheck':bool(re.search(r'teste de (?:inteligência|força|sabedoria|destreza).*?(?:CD|contra)',s['description'],re.I)),'condition':e.get('condition',''),'specialReview':bool(e['review'] or mode in ('trigger','narrative'))}
assert len(audit)==361 and set(audit)==set(profiles)
for name,data in [('spell-effects.json',profiles),('spell-audit.json',audit),('spell-profile-updates.json',{id:profiles[id] for id in sorted(changed)})]:(path/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('361 spells reviewed; initial saves and conditional effects classified separately.')
