"""Find source alpha components in approved flattened compositions.
Requires Pillow, NumPy and SciPy. Candidate results need visual review before
adding a depth flag in room-object-matches.json. This never edits room pixels.
"""
import json,sys
from pathlib import Path
from functools import lru_cache
from PIL import Image
import numpy as np
from scipy import ndimage
sys.path.insert(0,str(Path(__file__).resolve().parent))
from provenance import luma,ncc_map
root=Path(__file__).resolve().parents[3]; sheet=root/'tools/roomlab/library/sheets';P=root/'public/assets/props'
def first(pattern):return next(sheet.glob(pattern))
S={
 'office':[first('**/Office_Furniture_32x32.png'),first('**/Office_Exterior_32x32.png'),first('**/Office_BuildingTiles_32x32.png')],
 'shelter':[P/'shelter_furniture.png',P/'shelter_exterior.png',P/'shelter_buildings.png'],
 'mid':[sheet/'midcentury_modern_furnitureset.png',sheet/'Xmas/Xmas_Decorations.png'],
 'mansion':[sheet/'FancyMansion_Furniture/fancy_mansion_furnitureset.png'],
 'diner':[sheet/'50s_Diner/50sdiner_set.png'],
 'workshop':[P/'workshop.png'],
 'kitchen':[P/'kitchen.png'],
 'bathroom':[sheet/'Public_Bathroom/dirty_publicbathroom_set.png',P/'bathroom.png'],
 'garden':list((P/'garden').glob('*.png')),
 'graveyard':[sheet/'Graveyard/Graveyard_Set.png'],
 'makeshift':[P/'makeshift.png'],
}
groups={
'office':'bridge administration dispatch archive records breach',
'shelter':'dock hold sheltergate face',
'mid':'common study sparebedroom parlour projection winter dig4',
'mansion':'library grandbedroom salon hearth',
'diner':'maindiner sodabar servicecounter',
'workshop':'maintenance workshops yard',
'kitchen':'kitchen',
'bathroom':'stalls washroom infirmary well',
'garden':'garden',
'graveyard':'graveyard',
'makeshift':'dig3 dig5 dig6 camp',
}
# Room assemblies can mix these existing packs.
extra={'common':['mansion'],'winter':['mansion'],'dig3':['shelter'],'dig4':['shelter'],'dig5':['mid','shelter'],'dig6':['mid','shelter'],'infirmary':['shelter'],'well':['shelter'],'camp':['shelter']}
@lru_cache(None)
def templates(path):
 rgba=np.asarray(Image.open(path).convert('RGBA'));alpha=rgba[:,:,3]>200
 labels,num=ndimage.label(alpha,structure=np.ones((3,3)))
 out=[]
 for n,sl in enumerate(ndimage.find_objects(labels),1):
  if sl is None:continue
  ys,xs=sl;mask=labels[sl]==n;h,w=mask.shape;area=int(mask.sum())
  if area<80 or h<10 or w<6 or h>220 or w>250:continue
  rgb=rgba[sl];out.append((xs.start,ys.start,w,h,rgb,mask))
 return out
hits={}
for group,ids in groups.items():
 for id in ids.split():
  image=np.asarray(Image.open(root/f'public/habitat/rooms/{id}.png').convert('RGBA'));lum=luma(image);H,W=lum.shape
  hits[id]=[]
  for path in dict.fromkeys(S[group]+[p for g in extra.get(id,[]) for p in S[g]]):
   for sx,sy,w,h,rgb,mask in templates(str(path)):
    if w>W or h>H:continue
    for flip in [False,True]:
     m=mask[:,::-1]if flip else mask;t=luma(rgb[:,::-1]if flip else rgb)
     scores=ncc_map(lum,t,m.astype(float))
     if scores is None:continue
     for iteration in range(12):
      yy,xx=np.unravel_index(np.nanargmax(scores),scores.shape);score=float(scores[yy,xx]);threshold=.78 if id in ['camp','sheltergate','records','maintenance','dig3','dig4']else .82
      if score<threshold:break
      original=(rgb[:,::-1]if flip else rgb)[:,:,:3].astype(float)
      actual=image[yy:yy+h,xx:xx+w,:3].astype(float)
      inliers=float((np.max(np.abs(actual-original),axis=2)[m] <= (24 if id in ['camp','sheltergate','records','maintenance','dig3','dig4'] else 4)).mean())
      if inliers >= .70 and float((image[yy:yy+h,xx:xx+w,3][m]>200).mean())>.995:
       hits[id].append(dict(file=str(path.relative_to(root)),rect=[sx,sy,w,h],at=[int(xx),int(yy)],flip=flip,ncc=round(score,6),inliers=round(inliers,4),area=int(m.sum())))
      scores[max(0,yy-h//2):min(scores.shape[0],yy+h//2+1),max(0,xx-w//2):min(scores.shape[1],xx+w//2+1)]=-1
  hits[id].sort(key=lambda h:-h['ncc']);selected=[]
  for hit in hits[id]:
   x,y=hit['at'];w,h=hit['rect'][2:];duplicate=False
   for other in selected:
    ox,oy=other['at'];ow,oh=other['rect'][2:];inter=max(0,min(x+w,ox+ow)-max(x,ox))*max(0,min(y+h,oy+oh)-max(y,oy))
    if inter/min(w*h,ow*oh)>.8:duplicate=True;break
   if not duplicate:selected.append(hit)
  hits[id]=selected
  print(id,len(selected),flush=True)
(root/'tools/roomlab/measure/room-object-match-candidates.json').write_text(json.dumps(hits,indent=2))
