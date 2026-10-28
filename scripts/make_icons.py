# Programėlės ikona: Elreda ženklas (žaibas ir dvi juostos) baltame fone
from PIL import Image, ImageDraw
import os
Y=(254,223,21,255); T1=(39,174,178,255); T2=(12,122,121,255); BG=(255,255,255,255)
BOLT=[(667,0),(276,1),(184,259),(282,263),(180,559),(481,187),(362,187),(402,114),(666,111)]
BAR1=[(445,292),(635,293),(635,184),(532,184)]
BAR2=[(286,483),(667,479),(667,373),(376,373)]
X0,Y0,W,H=180,0,488,559
def mark(d,S,box):
    s=box/max(W,H); ox=(S-W*s)/2; oy=(S-H*s)/2
    for poly,col in ((BOLT,Y),(BAR1,T1),(BAR2,T2)):
        d.polygon([(ox+(x-X0)*s, oy+(y-Y0)*s) for x,y in poly], fill=col)
def icon(size, kind):
    S=size*4; im=Image.new("RGBA",(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    if kind=="fg": mark(d,S,S*0.56)
    else:
        if kind=="round": d.ellipse([0,0,S-1,S-1],fill=BG)
        else: d.rounded_rectangle([0,0,S-1,S-1],radius=int(S*.18),fill=BG)
        mark(d,S,S*(0.62 if kind=="round" else 0.7))
    return im.resize((size,size),Image.LANCZOS)
for k,m in {"mdpi":1,"hdpi":1.5,"xhdpi":2,"xxhdpi":3,"xxxhdpi":4}.items():
    p=f"android-res/mipmap-{k}"; os.makedirs(p,exist_ok=True)
    icon(int(108*m),"fg").save(f"{p}/ic_launcher_foreground.png")
    icon(int(48*m),"sq").save(f"{p}/ic_launcher.png")
    icon(int(48*m),"round").save(f"{p}/ic_launcher_round.png")
os.makedirs("android-res/values",exist_ok=True)
open("android-res/values/ic_launcher_background.xml","w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
