from pathlib import Path
from PIL import Image,ImageDraw
import json
# Trace the snowfield from the illustrated source, without overwriting its ridges.
ice=Image.new('L',(1000,853));d=ImageDraw.Draw(ice)
d.polygon([(245,211),(266,217),(287,232),(296,251),(313,241),(329,265),(323,286),(304,306),(287,319),(268,334),(239,345),(213,345),(188,332),(181,319),(196,306),(201,285),(212,273),(204,254),(222,246),(223,231)],fill=255)
ice=ice.crop((18,18,982,836)).resize((80,68),Image.Resampling.BOX)
positions=[(x,y+16) for y in range(68) for x in range(80) if ice.getpixel((x,y))>=95]
mount=json.loads(Path('outputs/mountain_observed_patterns.json').read_text())['patterns']
script='''#!/usr/bin/env python3
"""Apply the requested Lether/Kolanse terrain corrections. Standard library only.
Keep Lether_and_Kolanse_base.w3s beside this script, or pass --template.
"""
import argparse,struct,hashlib,json,collections
from pathlib import Path
D=((0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1))
# Geometric tile families checked against the 48x48 source graphics atlas.
CARD={20:[0,3],84:[1,4],80:[2,5],21:[8,11],81:[10,13],5:[16,19],69:[17,20],65:[18,21]}
CONCAVE={0:[9,12],2:[14,30],8:[6,22],32:[7,23],128:[15,31],34:[28],136:[29]}
def candidates(mask):
 c=mask&85
 if c==85:return CONCAVE.get((~mask)&170,[])
 if c==0 and mask==0:return [24,25]
 return CARD.get(c,[])
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--template',default=str(Path(__file__).with_name('Lether_and_Kolanse_base.w3s')))
 p.add_argument('--output',default='Lether_and_Kolanse_v2.w3s')
 a=p.parse_args();src=Path(a.template).read_bytes()
 if hashlib.sha256(src).hexdigest()!=BASE_HASH:raise SystemExit('Use the supplied base scenario.')
 dst=Path(a.output)
 if dst.exists():raise SystemExit('Output exists; select a new filename.')
 cells=[struct.unpack_from('<H',src,9008+10*(y*128+x)+6)[0]&31 for y in range(100) for x in range(80)]
 old=cells[:]
 for y in range(100):
  for x in range(80):
   if x in (0,79) or y in (0,99):cells[y*80+x]=1
 for x,y in ICE_CELLS:
  if cells[y*80+x]==0:cells[y*80+x]=8
 # A three-tile-wide north/south pass, above the coastal forest,
 # left of the middle of the long eastern southern mountain range.
 for y in range(61,68):
  for x in range(44,47):
   if cells[y*80+x]==4:cells[y*80+x]=0
 def mask(x,y,t):
  value=0
  for i,(dx,dy) in enumerate(D):
   xx=x+dx;yy=y+dy
   # Ocean continues beyond the playable boundary.
   same=(cells[yy*80+xx]==t) if 0<=xx<80 and 0<=yy<100 else t==1
   if same:value|=1<<i
  return value
 mountain=collections.defaultdict(collections.Counter)
 for k,counts in MOUNTAINS.items():
  if k.startswith('mountain:'):
   m=int(k.split(':')[1])&85
   for v,n in counts.items():mountain[m][int(v,16)]+=n
 cleaned=collections.Counter()
 while True:
  remove=[]
  for y in range(100):
   for x in range(80):
    t=cells[y*80+x];m=mask(x,y,t)
    if (t in (1,8) and not candidates(m)) or (t==4 and m&85 not in mountain):remove.append(y*80+x)
  if not remove:break
  for i in remove:cleaned[cells[i]]+=1;cells[i]=0
 data=bytearray(src);shore_corrected=0
 for y in range(100):
  for x in range(80):
   i=y*80+x;t=cells[i];pos=9008+10*(y*128+x)+6;before=struct.unpack_from('<H',src,pos)[0];v=before;m=mask(x,y,t)
   if t in (1,8):
    options=candidates(m)
    if before&31!=t or before>>5 not in options:
     v=(options[(x+3*y)%len(options)]<<5)|t
     if t==1:shore_corrected+=1
   elif t==4:
    direct=MOUNTAINS.get('mountain:'+str(m));counts={int(k,16):n for k,n in direct.items()} if direct else mountain[m&85]
    if v not in counts:v=max(sorted(counts),key=lambda k:counts[k])
   elif t==0:
    if before&31!=0:v=0
   elif t==3:pass
   else:raise RuntimeError('Unknown terrain')
   assert v&31==t
   struct.pack_into('<H',data,pos,v)
 # Verify field boundaries and all terrain graphics against the corrected layout.
 allowed={9008+10*(y*128+x)+6+j for y in range(100) for x in range(80) for j in (0,1)}
 assert len(data)==len(src) and all(a==b or i in allowed for i,(a,b) in enumerate(zip(src,data)))
 for y in range(100):
  for x in range(80):
   t=cells[y*80+x];v=struct.unpack_from('<H',data,9008+10*(y*128+x)+6)[0]
   if t in (1,8):assert v>>5 in candidates(mask(x,y,t))
   if x in (0,79) or y in (0,99):assert t==1
 assert all(cells[y*80+x]!=4 for y in range(61,68) for x in range(44,47))
 report={'counts':dict(collections.Counter(cells)),'shoreline_tiles_corrected':shore_corrected,'unsupported_cells_removed':dict(cleaned),'gap':{'columns':[44,46],'rows':[61,67]},'sha256':hashlib.sha256(data).hexdigest(),'validation':'All border cells are water; ice/water graphics match geometric orientation; mountain pass contains no mountains; only terrain graphics fields changed.'}
 dst.write_bytes(data);dst.with_suffix('.layout.json').write_text(json.dumps(cells));dst.with_suffix('.validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
if __name__=='__main__':main()
'''
import hashlib
constants='BASE_HASH='+repr(hashlib.sha256(Path('outputs/Lether_and_Kolanse_test.w3s').read_bytes()).hexdigest())+'\nICE_CELLS='+repr(positions)+'\nMOUNTAINS='+repr(mount)+'\n'
script=script.replace('D=((0,-1)',constants+'\nD=((0,-1)',1)
Path('outputs/Lether_and_Kolanse_corrections.py').write_text(script)
