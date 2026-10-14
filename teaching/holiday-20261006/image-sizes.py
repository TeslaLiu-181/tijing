from zipfile import ZipFile
import xml.etree.ElementTree as ET
import pathlib,json,re,argparse
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','v':'urn:schemas-microsoft-com:vml'}
parser=argparse.ArgumentParser(description='Read image sizes from your authorized teaching DOCX directory')
parser.add_argument('--source-dir',required=True,type=pathlib.Path)
args=parser.parse_args()
for file in args.source_dir.glob('*.docx'):
 n=int(re.search(r'作业\s*(\d+)',file.name)[1])
 with ZipFile(file) as z:
  doc=ET.fromstring(z.read('word/document.xml'))
  sizes={}
  for shape in doc.findall('.//v:shape',ns):
   image=shape.find('.//v:imagedata',ns)
   if image is None:continue
   rid=image.get('{'+ns['r']+'}id')
   style=shape.get('style','')
   found={m.group(1):float(m.group(2))*96/72 for m in re.finditer(r'(width|height):([0-9.]+)pt',style)}
   if len(found)==2:sizes[rid]={**found,'formula':found['height']<=48}
  for drawing in doc.findall('.//w:drawing',ns):
   ext=drawing.find('.//wp:extent',ns)
   image=drawing.find('.//a:blip',ns)
   if ext is None or image is None:continue
   rid=image.get('{'+ns['r']+'}embed')
   size={'width':float(ext.get('cx'))/9525,'height':float(ext.get('cy'))/9525}
   sizes[rid]={**size,'formula':size['height']<=48}
  out=pathlib.Path('.qa/holiday-20261006')/f'source-{n}'/'image-sizes.json'
  out.write_text(json.dumps(sizes,ensure_ascii=False,indent=2),encoding='utf8')
  # A few answer options use Word's automatic A-list rather than literal
  # characters. Read the original numbering definition instead of guessing.
  prefixes={}
  if 'word/numbering.xml' in z.namelist():
   nums=ET.fromstring(z.read('word/numbering.xml'))
   abstract={a.get('{'+ns['w']+'}abstractNumId'):a for a in nums.findall('w:abstractNum',ns)}
   numbered={a.get('{'+ns['w']+'}numId'):a for a in nums.findall('w:num',ns)}
   paragraphs=[]
   def blocks(parent):
    for child in parent:
     tag=child.tag.split('}')[-1]
     if tag=='p':paragraphs.append(child)
     elif tag in ['tbl','tr','tc','sdt','sdtContent']:blocks(child)
   blocks(doc.find('w:body',ns))
   counters={}
   for index,p in enumerate(paragraphs):
    props=p.find('w:pPr/w:numPr',ns)
    if props is None:continue
    num_id=props.find('w:numId',ns)
    if num_id is None or num_id.get('{'+ns['w']+'}val')=='0':continue
    key=num_id.get('{'+ns['w']+'}val');num=numbered[key]
    level_node=props.find('w:ilvl',ns);level=int(level_node.get('{'+ns['w']+'}val')) if level_node is not None else 0
    parent_id=num.find('w:abstractNumId',ns).get('{'+ns['w']+'}val')
    spec=next(l for l in abstract[parent_id].findall('w:lvl',ns) if int(l.get('{'+ns['w']+'}ilvl'))==level)
    kind=spec.find('w:numFmt',ns).get('{'+ns['w']+'}val')
    if kind=='bullet':continue
    if kind!='upperLetter' or level!=0:raise ValueError('Unexpected numbering type; inspect the source before continuing')
    start=int(spec.find('w:start',ns).get('{'+ns['w']+'}val'))
    counters[key]=counters.get(key,start-1)+1
    if not 1<=counters[key]<=26:raise ValueError('Unexpected option number')
    prefix=spec.find('w:lvlText',ns).get('{'+ns['w']+'}val').replace('%1',chr(64+counters[key]))
    prefixes[str(index)]=prefix
  (out.parent/'numbering.json').write_text(json.dumps(prefixes,ensure_ascii=False,indent=2),encoding='utf8')
  print(json.dumps({'paper':n,'sizes':len(sizes),'first':list(sizes.items())[:4]}))
