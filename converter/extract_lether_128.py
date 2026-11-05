from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import json
src=Image.open('/var/home/jpf/Downloads/Lether_and_Kolanse_by_Joshua_Butler.jpg').convert('RGB')
# Artwork exclusion rectangles are source coordinates; mountain corridors are
# hand-traced from the illustrated ridges, not inferred from text or parchment colour.
w,h=src.size
sea=Image.new('L',src.size);forest=Image.new('L',src.size)
a=src.filter(ImageFilter.GaussianBlur(1.1));s=[];f=[]
for r,g,b in a.getdata():
 water=b-r>=1 and g-r>=0 and b>=g-8
 s.append(255 if water else 0)
 f.append(255 if not water and r<124 and g>=.90*r and b<.78*g else 0)
sea.putdata(s);forest.putdata(f)
sea=sea.filter(ImageFilter.MedianFilter(7));forest=forest.filter(ImageFilter.MedianFilter(5))
for img,value in [(sea,255),(forest,0)]:
 d=ImageDraw.Draw(img)
 for box in [(658,29,974,140),(656,786,974,826),(24,681,137,818)]:d.rectangle(box,fill=value)
mount=Image.new('L',src.size);d=ImageDraw.Draw(mount)
paths=[
 ([(257,26),(280,39),(277,65)],22),([(307,104),(321,127),(335,144)],22),
 ([(241,166),(234,190),(246,210)],22),
 ([(344,231),(341,257),(330,281),(319,299)],30),
 ([(373,221),(381,244),(368,270),(352,292)],28),
 ([(158,349),(196,358),(231,360),(275,348)],28),
 ([(376,352),(348,369),(325,394),(304,425),(294,449),(316,470),(349,472),(380,485),(403,465),(423,444),(434,431)],30),
 ([(298,432),(274,450),(260,471)],22),
 ([(455,418),(486,410),(517,391),(545,383),(572,391),(594,403),(622,388),(653,390),(685,382),(713,383)],30),
 ([(745,325),(776,336),(811,349),(839,377),(851,405),(861,429),(874,460),(885,489)],25),
 ([(773,421),(804,425),(834,433)],22),
 ([(499,467),(506,491),(489,517)],24),
 ([(468,558),(491,541),(511,525)],24),
 ([(419,601),(449,580),(477,594),(496,609),(522,612),(550,596),(580,585),(612,580),(645,570),(677,560),(714,550),(748,536),(778,515),(808,509),(836,515),(863,531),(890,551)],30),
 ([(115,607),(148,615),(182,621),(205,623)],24),
 ([(905,199),(921,211),(944,213)],22),
 ([(734,282),(749,296),(763,303)],20)
]
for points,width in paths:d.line(points,fill=255,width=width,joint='curve')
# Crop the decorative frame. Preserve geographic proportions in the 80x100 grid.
box=(18,18,982,836);targetH=round(128*(box[3]-box[1])/(box[2]-box[0]));top=(160-targetH)//2
sm=sea.crop(box).resize((128,targetH),Image.Resampling.BOX)
fm=forest.crop(box).resize((128,targetH),Image.Resampling.BOX)
mm=mount.crop(box).resize((128,targetH),Image.Resampling.BOX)
cells=[1]*20480
for y in range(targetH):
 for x in range(128):
  t=0
  if sm.getpixel((x,y))>=115:t=1
  elif mm.getpixel((x,y))>=75:t=4
  elif fm.getpixel((x,y))>=72:t=3
  cells[(y+top)*128+x]=t
Path('work/converter/lether_128_raw.json').write_text(json.dumps(cells))
Path('work/converter/lether_128_extraction.json').write_text(json.dumps({'crop':box,'image_rows':targetH,'top_ocean_margin':top,'method':'colour-based sea/forest extraction and hand-traced mountain corridors','mountain_corridors':paths},indent=2))
print('Map extraction:',targetH,'rows, starting row',top)
