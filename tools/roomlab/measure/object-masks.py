import re,json
from pathlib import Path
from PIL import Image
# Requires Pillow; run from any working directory. Sources are repository-relative.
root=Path(__file__).resolve().parents[3]
def entity(name,file,rect,dest,trim=False,mirror=False):
 im=Image.open(root/file).convert('RGBA');x,y,w,h=rect;crop=im.crop((x,y,x+w,y+h));dx,dy=dest
 if trim:
  box=crop.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
  if not box:return None
  x+=box[0];y+=box[1];crop=crop.crop(box);w,h=crop.size
 if mirror:crop=crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT);dx=204-dx-w
 alpha=crop.getchannel('A');mask=[''.join('1'if alpha.getpixel((xx,yy))>8 else'0'for xx in range(w))for yy in range(h)]
 occupied=[]
 for row in mask:
  if '1'not in row:occupied.append(row)
  else:
   a=row.find('1');b=row.rfind('1');occupied.append('0'*a+'1'*(b-a+1)+'0'*(w-b-1))
 return dict(id=name,bounds=[dx,dy,w,h],baseY=dy+h,mask=mask,footprintMask=occupied,source=dict(file=file,rect=[x,y,w,h],mirrored=mirror))
objects={}
text=(root/'tools/roomlab/diggings.html').read_text();chunk=text[text.index('const TRACE = {'):text.index('// Which reference')]
for room,key in [('dig1','twoRooms'),('dig2','twoRoomsB'),('games','bedsit')]:
 block=re.search(r'\b'+key+r':\s*\[(.*?)\n  \]',chunk,re.S).group(1);arrays=re.findall(r'\[\s*([\d,\s]+)\]',block)
 objects[room]=[]
 for n,a in enumerate(arrays):
  sx,sy,w,h,dx,dy=map(int,a.replace(' ','').replace('\n','').split(','))
  if (sx,sy,w,h)==(194,290,60,59):continue # The blue rug is floor.
  objects[room].append(entity(f'{room}-trace-{n}','public/assets/props/makeshift.png',[sx,sy,w,h],[dx,dy]))
base=[('bunk-a',14,10,1,2,8,82),('locker',8,13,1,1,38,93),('bunk-b',14,10,1,2,70,82),('trestle',11,9,2,2,141,93),('blanket-c',16,6,1,1,140,86),('blanket-b',16,6,1,1,140,83),('blanket-a',16,6,1,1,140,80),('kit',2,8,1,1,169,90),('desk',7,6,1,2,167,129),('chair-left',6,4,1,2,41,157),('table',7,4,1,2,67,160),('chair-right',5,4,1,2,107,157)]
for n in range(1,6):
 objects['cabin'+str(n)]=[entity(f'cabin{n}-{name}','public/assets/props/shelter_furniture.png',[c*32,r*32,w*32,h*32],[x,y],trim=True,mirror=n>=4)for name,c,r,w,h,x,y in base]
 if n==1:objects['cabin1'].append(entity('cabin1-passenger-case','public/assets/props/shelter_furniture.png',[17*32,13*32,32,32],[136,132],trim=True))
 if n==5:objects['cabin5'].append(entity('cabin5-extra-locker','public/assets/props/shelter_furniture.png',[10*32,3*32,32,64],[38,140],trim=True))
# Compositions lack layers. These placements were matched to the original RGBA
# sheets, then reviewed against contact sheets. Only elevated objects become
# foreground layers; adding depth does not silently change floor collision.
matches=json.loads((root/'tools/roomlab/measure/room-object-matches.json').read_text())
for room,items in matches.items():
 if room in ['dig5','dig6']:continue # declared layers below are stronger evidence
 for n,item in enumerate(items):
  if not item['depth']:continue
  obj=entity(f'{room}-matched-{n}',item['file'],item['rect'],item['at'])
  if item['flip']:
   obj['mask']=[row[::-1]for row in obj['mask']]
   obj['source']['mirrored']=True
  obj.pop('footprintMask')
  obj['source']['ncc']=item['ncc']
  obj['source']['inliers']=item['inliers']
  objects.setdefault(room,[]).append(obj)
for room,items in json.loads((root/'tools/roomlab/measure/room-object-placements.json').read_text()).items():
 for item in items:
  dx,dy,dw,dh=item['destination'];assert item['rect'][2:]==[dw,dh], 'Only native 1:1 object layers are accepted'
  obj=entity(item['id'],item['file'],item['rect'],[dx,dy])
  objects.setdefault(room,[]).append(obj)
(root/'tools/roomlab/room-objects.js').write_text('// Exact alpha and scanline footprints of existing, measured sprite placements.\n// Generated from the original sheets; sources are retained per object for auditing.\n// No RGB pixel is generated or changed. Flat rugs and paper are excluded.\nexport const ROOM_OBJECTS = '+json.dumps(objects,separators=(',',':'))+';\n')
print({k:len(v)for k,v in objects.items()})
