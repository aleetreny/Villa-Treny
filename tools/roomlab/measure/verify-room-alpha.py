"""Verify every exported depth mask against its source PNG alpha, including flips.
Requires Pillow and NumPy. Reads only: no source, metadata or pixels are changed.
"""
from pathlib import Path
from PIL import Image
import numpy as np,json
root=Path(__file__).resolve().parents[3];m=json.loads((root/'src/lib/habitat/generated/rooms.json').read_text())['rooms'];count=0;errors=[];outside=0
for id,art in m.items():
 room=np.array(Image.open(root/f'public/habitat/rooms/{id}.png').convert('RGBA'))
 for o in art.get('objects',[]):
  src=o['source'];im=Image.open(root/src['file']).convert('RGBA');x,y,w,h=src['rect'];a=np.array(im.crop((x,y,x+w,y+h)))[:,:,3]>8
  if src['mirrored']:a=a[:,::-1]
  rows=[''.join(part.split(':')[1]*int(part.split(':')[0],36)for part in row[1:].split(';'))if row.startswith('~')else row for row in o['mask']]
  mask=np.array([[p=='1'for p in row]for row in rows])
  if a.shape!=mask.shape or not np.array_equal(a,mask):errors.append(o['id'])
  count+=1
print(dict(objects=count,alphaEqualsOriginal=not errors,errors=errors))
