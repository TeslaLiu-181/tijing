"""Read the supplied DOCX without changing it; retain original text, OMML and figures."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import base64, hashlib, json, argparse

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Path to your authorized guide DOCX')
SOURCE = parser.parse_args().source.resolve()
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'm':'http://schemas.openxmlformats.org/officeDocument/2006/math',
      'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'v':'urn:schemas-microsoft-com:vml'}

def local(el): return el.tag.rsplit('}', 1)[-1]
def child(el, key): return next((x for x in el if local(x)==key), None)
def math(el):
    if el is None: return ''
    name=local(el)
    if name=='t': return el.text or ''
    if name.endswith('Pr') or name in ('ctrlPr','deg'): return ''
    if name=='f': return r'\frac{'+math(child(el,'num'))+'}{'+math(child(el,'den'))+'}'
    if name=='rad': return r'\sqrt{'+math(child(el,'e'))+'}'
    if name=='sSub': return '{'+math(child(el,'e'))+'}_{'+math(child(el,'sub'))+'}'
    if name=='sSup': return '{'+math(child(el,'e'))+'}^{'+math(child(el,'sup'))+'}'
    if name=='sSubSup': return '{'+math(child(el,'e'))+'}_{'+math(child(el,'sub'))+'}^{'+math(child(el,'sup'))+'}'
    if name=='d': return '('+''.join(math(x) for x in el if local(x)=='e')+')'
    return ''.join(math(x) for x in el)

with ZipFile(SOURCE) as z:
    rels={e.attrib['Id']:e.attrib['Target'] for e in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
    doc=ET.fromstring(z.read('word/document.xml'))
    paragraphs=[]
    for idx,p in enumerate(doc.findall('./w:body/w:p',NS),1):
        segments=[]
        for node in p:
            if local(node) in ('oMath','oMathPara'):
                segments.append({'math':math(node)})
            elif local(node)=='r':
                t=''.join(e.text or '' for e in node.findall('.//w:t',NS))
                valign=node.find('./w:rPr/w:vertAlign',NS)
                if t:
                    segments.append({'text':t, 'align':valign.attrib.get('{'+NS['w']+'}val') if valign is not None else None})
            else:
                t=''.join(e.text or '' for e in node.findall('.//w:t',NS))
                if t: segments.append({'text':t})
        figures=[]
        for e in p.findall('.//a:blip',NS):
            rid=e.attrib.get('{'+NS['r']+'}embed')
            if rid: figures.append(rid)
        for e in p.findall('.//v:imagedata',NS):
            rid=e.attrib.get('{'+NS['r']+'}id')
            if rid: figures.append(rid)
        paragraphs.append({'index':idx,'segments':segments,'figures':figures})
    images={}
    folder=ROOT/'assets'/'guide';folder.mkdir(parents=True,exist_ok=True)
    for rid,target in rels.items():
        if target.startswith('media/'):
            raw=z.read('word/'+target)
            (folder/(rid+'.png')).write_bytes(raw)
            images[rid]='data:image/png;base64,'+base64.b64encode(raw).decode()
    data={'source':SOURCE.name,'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'paragraphs':paragraphs,'images':images}
    (ROOT/'src'/'guide-source.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    dump='\n'.join(str(p['index'])+': '+''.join(' ⟦'+s['math']+'⟧ ' if 'math' in s else s.get('text','') for s in p['segments'])+' [ '+','.join(p['figures'])+' ]' for p in paragraphs)
    (ROOT/'.qa'/'guide-paragraphs.txt').write_text(dump,encoding='utf-8')
    print(f'Extracted {len(paragraphs)} paragraphs, {len(images)} original figures; SHA-256 {data["sha256"]}')
