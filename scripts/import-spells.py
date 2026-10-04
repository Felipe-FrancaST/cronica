#!/usr/bin/env python3
"""Rebuild the user's Portuguese spell reference. Requires PyMuPDF (fitz).
Usage: python scripts/import-spells.py /path/to/reference.pdf
Text is read in column order; cross-page descriptions are retained.
"""
import sys, json, re, unicodedata, hashlib
from pathlib import Path
import fitz
ROOT = Path(__file__).resolve().parents[1]
pdf_path = Path(sys.argv[1])
doc = fitz.open(pdf_path)
def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
def slug(s): return norm(s).replace(' ','-')
def lines(page):
    result=[]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            spans=line['spans']
            result.append(dict(text=''.join(s['text'] for s in spans).strip(), x=line['bbox'][0], y=line['bbox'][1], size=max(s['size'] for s in spans), font=spans[0]['font']))
    return result
# Body pages 7–74: two columns, headings in Calisto bold 10 pt.
spells=[]; current=None
for pi in range(6,74):
    page=doc[pi]
    boxes=[d['rect'] for d in page.get_drawings() if d['type']=='s' and d['rect'].width>120 and d['rect'].height>30]
    boxes.sort(key=lambda r:(0 if r.x0<100 else 1,r.y0))
    all_lines=lines(page)
    for box in boxes:
        ls=[l for l in all_lines if l['text'] and box.x0<=l['x']<box.x1 and box.y0<=l['y']<box.y1]
        ls.sort(key=lambda l:(l['y'],l['x']))
        for line in ls:
            if 9.5 <= line['size'] <= 10.5 and 'Bold' in line['font']:
                if current: spells.append(current)
                current={'name':line['text'],'source_page':pi+1,'source_reference_page':pi-5,'source_pages':[pi+1],'raw':[],'ritual':False,'classes':[], 'id':slug(line['text'])}
            elif current:
                current['raw'].append(line['text'])
                if pi+1 not in current['source_pages']: current['source_pages'].append(pi+1)
if current: spells.append(current)
issues=[]
for s in spells:
    raw='\n'.join(s.pop('raw'))
    header,_,body=raw.partition('\nTempo de lançamento:')
    match=re.match(r'(Truque|[1-9]\s*[º°ªo]?\s*Nível)\s+(.*)',header,re.I)
    if not match:
        issues.append({'name':s['name'],'bad_header':header[:180]}); continue
    s['id']=slug(s['name']);s['level']=0 if match[1].lower()=='truque' else int(match[1][0])
    school=match[2].strip();s['ritual']='ritual' in school.lower();s['school']=re.sub(r'\s*\(?ritual\)?','',school,flags=re.I).strip().capitalize()
    fields=re.match(r'\s*(.*?)\nAlcance:\s*(.*?)\nComponentes:\s*(.*?)\nDuração:\s*([^\n]+)\n(.*)',body,re.S)
    if not fields:
        issues.append({'name':s['name'],'bad_fields':body[:180]}); continue
    for key,v in zip(['casting_time','range','components','duration','description'],fields.groups()):
        # Soft wraps are joined; bullet paragraphs stay separate.
        s[key]=re.sub(r'\s+',' ',v).strip() if key!='description' else re.sub(r'\n(?![•])',' ',v).strip()
    s['concentration']='concentra' in s['duration'].lower();s['classes']=[]
# Class lists from the five index pages. Normalize inconsistent spelling in PDF.
aliases={'invocar elementais menor':'Invocar Elementais Menores','reecarnaçao':'Reencarnação','telecinese':'Telecinésia'}
lookup={norm(s['name']):s for s in spells}
for a,b in aliases.items(): lookup[norm(a)]=lookup[norm(b)]
# Explicit index/body spelling variants, if any, are reported below for review.
classes={'Bardo':'bard','Bruxo':'warlock','Clérigo':'cleric','Druida':'druid','Feiticeiro':'sorcerer','Mago':'wizard','Paladino':'paladin','Ranger':'ranger'}
index=[]; cls=None; level=None; pending=[]
def flush():
    if not pending:return
    name=re.sub(r'\s*\(p?\d+\)\s*','', ' '.join(pending)).strip();pending.clear()
    if not name or cls is None or level is None:return
    index.append({'name':name,'class':cls,'level':level})
for pi in range(5):
    for line in doc[pi].get_text().splitlines():
        t=line.strip()
        if not t or t.startswith(('LISTA DE','Diagramação','Tradução')):continue
        if t.startswith(('Aprisionar Alma','no livro)')):
            flush(); continue
        if t=='Névoa Fétida': t+=' (p28)'
        if t in classes:
            flush();cls=classes[t];level=None;continue
        if t=='Truques' or re.match(r'^[1-9][º°ª]\s*Nível$',t):
            flush();level=0 if t=='Truques' else int(t[0]);continue
        pending.append(t)
        if re.search(r'\(p?\d+\)',t):flush()
    flush()
for row in index:
    key=norm(row['name']); s=lookup.get(key)
    if not s:
        issues.append({'index_unmatched':row});continue
    if row['level']!=s.get('level'):issues.append({'level_mismatch':row,'body_level':s.get('level')})
    if row['class'] not in s['classes']:s['classes'].append(row['class'])
# Appendix gives English aliases. The sequential pairs also recover wrapped names.
english_pending=[]
for pi in range(74,len(doc)):
    raw=[l.strip() for l in doc[pi].get_text().splitlines() if l.strip()]
    i=0
    while i<len(raw):
        t=raw[i]
        if t.startswith(('Aprisionar Alma','no livro)')):
            english_pending=[];i+=1;continue
        if t=='Trap the Soul':
            english_pending=[];i+=1;continue
        if t in ['Original','Tradução','TRUQUES'] or re.match(r'^[1-9][º°]\s*Nível$',t) or t.startswith('Apêndice'):
            english_pending=[];i+=1;continue
        found=None;used=1
        for n in range(1,4):
            candidate=' '.join(raw[i:i+n]);found=lookup.get(norm(candidate))
            if found:used=n;break
        if found and found['name']==t and not english_pending and i+1<len(raw) and raw[i+1]==t:
            english_pending.append(t); i+=1; continue
        if found:
            english=' '.join(english_pending).strip();english_pending=[]
            if english:
                found['english_name']=re.sub(r'\s*\(Ritual\)','',english,flags=re.I).strip()
                if '(ritual)' in english.lower():found['ritual']=True
            i+=used;continue
        # Some appendix rows are a single line containing both table cells.
        for s in spells:
            if t.endswith(s['name']) and t!=s['name']:
                found=s;break
        if found:
            english=' '.join(english_pending+[t[:-len(found['name'])].strip()]);english_pending=[]
            found['english_name']=re.sub(r'\s*\(Ritual\)','',english,flags=re.I).strip();found['ritual']|='(ritual)' in english.lower()
        else:english_pending.append(t)
        i+=1
for s in spells:
    s['classes'].sort();s['source']='Lista de Magias D&D 5 v1.4 — PDF fornecido';s['edition']='2014'
spells.sort(key=lambda s:(s.get('level',0),norm(s['name'])))
output=ROOT/'src/systems/dnd5e/data/spells.json'
output.write_text(json.dumps(spells,ensure_ascii=False,indent=2)+'\n')
report={'pdf_sha256':hashlib.sha256(pdf_path.read_bytes()).hexdigest(),'total':len(spells),'cantrips':sum(s.get('level')==0 for s in spells),'by_level':{str(i):sum(s.get('level')==i for s in spells) for i in range(10)},'by_class':{v:sum(v in s['classes'] for s in spells) for v in classes.values()},'missing_classes':[s['name'] for s in spells if not s['classes']],'missing_english':[s['name'] for s in spells if not s.get('english_name')],'issues':issues}
(ROOT/'docs/spell-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='issues'},ensure_ascii=False,indent=2)); print(json.dumps(issues,ensure_ascii=False,indent=2))
