"""Derive ground-area metadata from the supplied catalog, with reviewed combat rules.
Complex/conditional spells stay explicitly marked for GM review. Never treat HP pools as damage.
Re-running this script only updates the JSON seed, never a previously applied migration.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spells = json.loads((ROOT / 'src/systems/dnd5e/data/spells.json').read_text())
def number(s): return float(s.replace(',', '.'))
def norm(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')

# dice, damage type, save, half on save, per-slot increment
damage = {
 'borrifada-venenosa': ('1d12','veneno','con',False,''),
 'chama-sagrada': ('1d8','radiante','dex',False,''),
 'chicote-de-espinhos': ('1d6','perfurante','',False,''),
 'lanca-de-fogo': ('1d10','fogo','',False,''),
 'produzir-chama': ('1d8','fogo','',False,''),
 'raio-de-acido': ('1d6','ácido','dex',False,''),
 'raio-de-gelo': ('1d8','frio','',False,''),
 'rajada-mistica': ('1d10','energia','',False,''),
 'toque-chocante': ('1d8','elétrico','',False,''),
 'toque-macabro': ('1d8','necrótico','',False,''),
 'zombaria-malevola': ('1d4','psíquico','wis',False,''),
 'bracos-de-hadar': ('2d6','necrótico','str',True,'1d6'),
 'infligir-ferimentos': ('3d10','necrótico','',False,'1d10'),
 'maos-flamejantes': ('3d6','fogo','dex',True,'1d6'),
 'misseis-magicos': ('3d4+3','energia','',False,'1d4+1'),
 'orbe-cromatico': ('3d8','fogo','',False,'1d8'),
 'onda-trovejante': ('2d8','trovejante','con',True,'1d8'),
 'raio-doentio': ('2d8','veneno','',False,'1d8'),
 'repreensao-infernal': ('2d10','fogo','dex',True,'1d10'),
 'sussurros-perturbadores': ('3d6','psíquico','wis',True,'1d6'),
 'despedacar': ('3d8','trovejante','con',True,'1d8'),
 'raio-ardente': ('6d6','fogo','',False,'2d6'),
 'flecha-acida-de-melf': ('4d4','ácido','',True,'1d4'),
 'toque-vampirico': ('3d6','necrótico','',False,'1d6'),
 'bola-de-fogo': ('8d6','fogo','dex',True,'1d6'),
 'conjurar-artilharia': ('3d8','perfurante','dex',True,''),
 'relampago': ('8d6','elétrico','dex',True,'1d6'),
 'secar': ('8d8','necrótico','con',True,'1d8'),
 'tempestade-glacial': ('2d8+4d6','frio','dex',True,'1d8'),
 'coluna-de-chamas': ('4d6+4d6','fogo','dex',True,'1d6'),
 'cone-glacial': ('8d8','frio','con',True,'1d8'),
 'conjurar-rajada': ('8d8','perfurante','dex',True,''),
 'circulo-da-morte': ('8d6','necrótico','con',True,'2d6'),
 'corrente-de-relampagos': ('10d8','elétrico','dex',True,''),
 'desintegrar': ('10d6+40','energia','dex',False,'3d6'),
 'doenca-plena': ('14d6','necrótico','con',True,''),
 'esfera-gelida-de-otiluke': ('10d6','frio','con',True,'1d6'),
 'dedo-da-morte': ('7d8+30','necrótico','con',True,''),
 'explosao-solar': ('12d6','radiante','con',True,''),
 'mente-debil': ('4d6','psíquico','',False,''),
 'guardioes-espirituais': ('3d8','radiante','wis',True,'1d8'),
 'crescer-espinhos': ('2d4','perfurante','',False,''),
 'esfera-flamejante': ('2d6','fogo','dex',True,'1d6'),
 'raio-de-sol': ('6d8','radiante','con',True,''),
 'barreira-de-laminas': ('6d10','cortante','dex',True,''),
 'nevoa-mortal': ('5d8','veneno','con',True,'1d8'),
 'muralha-de-fogo': ('5d8','fogo','dex',True,'1d8'),
 'fome-de-hadar': ('2d6','frio','',False,''),
 'tentaculos-negros-de-evard': ('3d6','concussão','dex',False,''),
}
heals = {'curar-ferimentos':('1d8','1d8',1), 'palavra-de-cura':('1d4','1d4',1),
 'oracao-de-cura':('2d8','1d8',6), 'palavra-de-cura-em-massa':('1d4','1d4',6),
 'curar-ferimentos-em-massa':('3d8','1d8',6), 'cura':('70','10',1),
 'cura-em-massa':('','',99), 'regeneracao':('4d8+15','',1), 'palavra-de-poder-curar':('','',1)}

# Overrides protect against ambiguous units/secondary light areas in the PDF.
areas = {
 'bracos-de-hadar':('sphere',3,'self'), 'maos-flamejantes':('cone',4.5,'self'),
 'leque-cromatico':('cone',4.5,'self'), 'onda-trovejante':('cube',4.5,'self'),
 'bola-de-fogo':('sphere',6,'point'), 'despedacar':('sphere',3,'point'),
 'relampago':('line',30,'self'), 'cone-glacial':('cone',18,'self'),
 'conjurar-artilharia':('cone',18,'self'), 'conjurar-rajada':('sphere',12,'point'),
 'coluna-de-chamas':('sphere',3,'point'), 'tempestade-glacial':('sphere',6,'point'),
 'circulo-da-morte':('sphere',18,'point'), 'esfera-gelida-de-otiluke':('sphere',18,'point'),
 'explosao-solar':('sphere',18,'point'), 'curar-ferimentos-em-massa':('sphere',9,'point'),
 'palavra-de-cura-em-massa':('sphere',18,'self'), 'oracao-de-cura':('sphere',9,'self'),
 'guardioes-espirituais':('sphere',4.5,'self'), 'crescer-espinhos':('sphere',6,'point'),
 'esfera-flamejante':('sphere',1.5,'point'), 'sono':('sphere',6,'point'),
 'raio-de-sol':('line',18,'self'), 'fome-de-hadar':('sphere',6,'point'),
 'raio-de-acido':('single',0,'point'), 'produzir-chama':('single',0,'point'),
 'misseis-magicos':('single',0,'point'), 'cura-em-massa':('sphere',18,'self'),
 'toque-vampirico':('single',0,'point'),
 'tentaculos-negros-de-evard':('cube',6,'point'), 'nevoa':('sphere',6,'point'),
}
special = {
 'misseis-magicos': 'O padrão reúne todos os dardos em um alvo. Para dividir dardos, o mestre ajusta alvos e dano.',
 'rajada-mistica': 'Cada raio exige um ataque separado. O mestre ajusta o dano para os raios que acertaram.',
 'raio-de-acido': 'Pode atingir duas criaturas adjacentes. O mestre confirma o segundo alvo.',
 'tempestade-glacial': 'Dano misto: 2d8 concussão e 4d6 frio. Revise resistências separadamente.',
 'coluna-de-chamas': 'Dano misto: 4d6 fogo e 4d6 radiante. Revise resistências separadamente.',
 'doenca-plena': 'O dano não pode reduzir o alvo abaixo de 1 PV; revise redução do máximo e condições.',
 'secar': 'Construtos e mortos-vivos são imunes; plantas têm regras próprias.',
 'orbe-cromatico': 'Escolha o tipo de dano no painel de aprovação.',
 'corrente-de-relampagos': 'O mestre confirma os alvos secundários a até 9 m do alvo principal.',
 'cura-em-massa': 'Distribua até 700 PV entre os alvos; o mestre informa a cura por alvo. A soma é conferida no servidor.',
 'raio-ardente': 'O padrão reúne todos os raios em um alvo. O mestre ajusta alvos e dano para os raios que acertaram.',
 'flecha-acida-de-melf': 'Aplique 4d4 no acerto e mais 2d4 no fim do próximo turno. Falha de ataque causa metade do dano inicial: o mestre pode marcar Sucesso com valor reduzido para essa exceção.',
 'regeneracao': 'Cura inicial de 4d8+15; depois, 1 PV no começo de cada turno por 1 hora. O mestre acompanha regeneração de membros.',
 'palavra-de-poder-curar': 'Restaura todos os PV. O mestre também remove as condições da descrição na ficha.',
 'sono': '5d8 é uma reserva de PV, não dano. O mestre aplica sono na ordem crescente de PV.',
 'leque-cromatico': '6d10 é uma reserva de PV, não dano. O mestre aplica a condição Cego.',
}
result = {}
for s in spells:
    desc, rng = norm(s['description']), norm(s['range'])
    own = bool(re.search(r'^(o jogador|do jogador|pessoal)',rng))
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(km|metros|m\b)',rng)
    reach = number(m[1]) * (1000 if m[2]=='km' else 1) if m else 1.5 if 'toque' in rng else 0 if own else 9
    if s['id']=='zombaria-malevola': reach=18
    if re.search(r'vista|ilimitado|especial',rng): reach=10000
    p = dict(shape='self' if own else 'single',kind='utility',range=reach,size=0,width=1.5,
      origin='self' if own else 'point',dice='',damageType='',ability=False,upcast='',cantripScale=False,
      save='',halfOnSave=False,selective=False,maxTargets=1,timing='immediate',review=True,
      note='O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.')
    # Only dimensions explicitly describing a ground area are candidates; all inferred rules remain reviewable.
    patterns=[('cone',r'cone de (\d+(?:[.,]\d+)?)\s*(?:metros|m\b)'),
      ('cube',r'cubo de (\d+(?:[.,]\d+)?)\s*(?:metros|m\b)'),
      ('sphere',r'(?:raio (?:esferico )?de|esfera de|esfera com (?:um )?raio de) (\d+(?:[.,]\d+)?)\s*(?:metros|m\b)'),
      ('line',r'linha de (\d+(?:[.,]\d+)?)\s*(?:metros|m\b)')]
    for shape,pat in patterns:
        match=re.search(pat,rng+' '+desc[:1400])
        if match:
            p.update(shape=shape,size=number(match[1]),maxTargets=99)
            break
    if s['id'] in areas:
        sh,sz,origin=areas[s['id']]; p.update(shape=sh,size=sz,origin=origin,maxTargets=99 if sh not in ['self','single'] else 1)
    if s['id'] in damage:
        dice,kind,save,half,up=damage[s['id']]
        p.update(kind='damage',dice=dice,damageType=kind,save=save,halfOnSave=half,upcast=up,
          cantripScale=s['level']==0,review=False)
        if s['id']=='produzir-chama': p.update(range=9)
        if s['id']=='rajada-mistica': p.update(cantripScale=False,review=True)
        if not norm(s['duration']).startswith('instant') and s['level']>0:
            p.update(timing='trigger',review=True,note='Área persistente: o mestre aplica dano apenas no gatilho da descrição, usando Aplicar efeito.')
    if s['id'] in heals:
        dice,up,max_targets=heals[s['id']]
        p.update(kind='healing',dice=dice,upcast=up,ability=s['id'] not in ['cura','cura-em-massa','regeneracao','palavra-de-poder-curar'],
            selective=True,maxTargets=max_targets,review=False)
    if s['id']=='cura-em-massa': p.update(pool=700)
    if s['id']=='palavra-de-poder-curar': p.update(restoreFull=True)
    if s['id']=='regeneracao': p.update(pulseDice='1')
    if s['id']=='toque-vampirico': p.update(range=1.5,timing='immediate',lifeSteal=0.5,pulseCost='action')
    if s['id']=='raio-de-sol': p.update(timing='immediate',pulseCost='action')
    if s['id']=='flecha-acida-de-melf': p.update(pulseDice='2d4',pulseUpcast='1d4',pulseOnce=True)
    if s['id']=='nevoa': p.update(sizePerSlot=6)
    if s['id']=='vitalidade-falsa': p.update(kind='temporary',dice='1d4+4',upcast='5',review=False)
    if s['id'] in special: p.update(review=True,note=special[s['id']])
    if p['shape']=='self': p.update(origin='self')
    result[s['id']]=p

(ROOT/'src/features/vtt/spell-effects.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'{len(result)} perfis; {sum(p["kind"]!="utility" for p in result.values())} efeitos de PV; {sum(p["shape"] not in ["single","self"] for p in result.values())} áreas.')
