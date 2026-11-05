/* Variable-size terrain engine. MAP.DAT uses an 18-byte header and 10-byte cells. */
const W3=(()=>{
 const D=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],CARD=85;
 const EDGES={20:[0,3],84:[1,4],80:[2,5],21:[8,11],81:[10,13],5:[16,19],69:[17,20],65:[18,21]};
 const CORNERS={0:[9,12],2:[14,30],8:[6,22],32:[7,23],128:[15,31],34:[28],136:[29]};
 function options(m){if((m&85)===85)return CORNERS[(~m)&170]||[];if(m===0)return[24,25];return EDGES[m&85]||[];}
 function dimensions(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<4||w>128||h<4||h>160)throw Error('Map size must be between 4 × 4 and 128 × 160.');}
 function maskAt(c,x,y,t,w=80,h=100){let m=0;D.forEach(([dx,dy],i)=>{let xx=x+dx,yy=y+dy;const same=xx>=0&&xx<w&&yy>=0&&yy<h?c[yy*w+xx]===t:t===1;if(same)m|=1<<i;});return m;}
 const mountains={};for(const[k,counts]of Object.entries(MOUNTAIN_PATTERNS)){if(!k.startsWith('mountain:'))continue;let m=(+k.split(':')[1])&85,v=mountains[m]??={};for(const[a,n]of Object.entries(counts))v[parseInt(a,16)]=(v[parseInt(a,16)]||0)+n;}
 const forest={20:3,84:131,80:163,21:355,85:387,81:419,5:515,69:547,65:579};
 function supported(t,m){return t===4?!!mountains[m&85]:t===3?forest[m&85]!==undefined:t===1||t===8?options(m).length>0:t===0;}
 function normalize(input,smoothing=1,buffer=true,w=80,h=100){dimensions(w,h);if(input.length!==w*h)throw Error('Image dimensions do not match map size.');let c=Uint8Array.from(input);if(c.some(t=>![0,1,3,4,8].includes(t)))throw Error('Unknown terrain type.');
  for(let pass=0;pass<smoothing;pass++){const n=c.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let count=Array(9).fill(0);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)count[c[(y+dy)*w+x+dx]]++;let best=count.indexOf(Math.max(...count));if(count[best]>=5)n[y*w+x]=best;}c=n;}
  let border=0,mixed=0,unsupported=0,rounds=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x===0||y===0||x===w-1||y===h-1)&&c[y*w+x]!==0&&c[y*w+x]!==1){c[y*w+x]=0;border++;}
  if(buffer){const n=c.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let t=c[y*w+x];if(!t)continue;if(D.some(([dx,dy])=>{let a=c[(y+dy)*w+x+dx];return a!==0&&a!==t;})){n[y*w+x]=0;mixed++;}}c=n;}
  while(true){const remove=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){let t=c[y*w+x];if(t&&!supported(t,maskAt(c,x,y,t,w,h)))remove.push(y*w+x);}if(!remove.length)break;remove.forEach(i=>c[i]=0);unsupported+=remove.length;if(++rounds>w*h)throw Error('Cleanup did not converge.');}
  let changed=0;for(let i=0;i<c.length;i++)if(input[i]!==c[i])changed++;return{cells:c,changed,border,mixed,unsupported,rounds};
 }
 function choose(counts,rng){let a=Object.entries(counts).sort((a,b)=>+a[0]-b[0]),n=rng()*a.reduce((s,[,v])=>s+v,0);for(let[v,k]of a){n-=k;if(n<0)return+v;}return+a[a.length-1][0];}
 function makeTemplate(w,h){dimensions(w,h);const src=Uint8Array.from(atob(TEMPLATE_B64),c=>c.charCodeAt(0));const v=new DataView(src.buffer);let pos=73,entry=-1,oldLength=0;
  while(pos+88<=src.length){let name=String.fromCharCode(...src.slice(pos,pos+24)).split('\0')[0],size=v.getUint32(pos+80,true);if(!size)break;if(pos+88+size>src.length)throw Error('Invalid scenario container.');if(name.endsWith('MAP.DAT')){entry=pos;oldLength=size;break;}pos+=88+size;}
  if(entry<0)throw Error('Map entry not found.');const dataStart=entry+88,records=dataStart+18,length=18+128*h*10,bytes=new Uint8Array(src.length-oldLength+length);
  bytes.set(src.slice(0,dataStart));bytes.set(src.slice(dataStart,dataStart+18),dataStart);const out=new DataView(bytes.buffer);out.setUint32(entry+80,length,true);out.setUint16(dataStart,w,true);out.setUint16(dataStart+2,h,true);out.setUint16(dataStart+4,128,true);out.setUint16(dataStart+8,128*h,true);
  const plain=src.slice(records,records+10);plain[0]=0;plain[1]=0;for(let i=0;i<128*h;i++)bytes.set(plain,records+10*i);
  bytes.set(src.slice(dataStart+oldLength),dataStart+length);return{bytes,records};
 }
 function generate(c,seed=143,w=80,h=100){dimensions(w,h);if(c.length!==w*h)throw Error('Map cell count does not match selected size.');const{bytes,records}=makeTemplate(w,h),view=new DataView(bytes.buffer);let state=seed>>>0;const rng=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};const keys={0:'plains',1:'water',3:'forest',4:'mountains',8:'ice'},counts={plains:0,water:0,forest:0,mountains:0,ice:0};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let t=c[y*w+x],m=maskAt(c,x,y,t,w,h),v=0;if(!keys[t]||!supported(t,m))throw Error(`Unsupported terrain at column ${x+1}, row ${y+1}. Update the preview.`);counts[keys[t]]++;
   if(t===4){const exact=MOUNTAIN_PATTERNS['mountain:'+m],counts=exact?Object.fromEntries(Object.entries(exact).map(([k,n])=>[parseInt(k,16),n])):mountains[m&85];v=choose(counts,rng);}
   else if(t===3)v=forest[m&85];
   else if(t===1||t===8){const valid=options(m),observed=t===1?WATER_PATTERNS[m]:null,counts={};for(const idx of valid)counts[(idx<<5)|t]=observed?.[(idx<<5)|1]||1;v=choose(counts,rng);}
   else{const mm=maskAt(c,x,y,4,w,h);if(mm){const pop=n=>{let k=0;for(;n;n&=n-1)k++;return k;};let opts=Object.entries(MOUNTAIN_PATTERNS).filter(([k])=>k.startsWith('surrounding:'));opts.sort((a,b)=>{let ma=+a[0].split(':')[1],mb=+b[0].split(':')[1];return 4*(pop((ma^mm)&85)-pop((mb^mm)&85))+pop((ma^mm)&170)-pop((mb^mm)&170)||ma-mb;});v=parseInt(Object.entries(opts[0][1]).sort((a,b)=>b[1]-a[1]||parseInt(a[0],16)-parseInt(b[0],16))[0][0],16);}}
   if((v&31)!==t)throw Error('Terrain slot mismatch.');if((t===1||t===8)&&!options(m).includes(v>>5))throw Error('Incorrect shoreline/ice graphics.');view.setUint16(records+10*(y*128+x),v,true);
  }return{bytes,counts,records};
 }
 function classify(rgba,palette,w=80,h=100){dimensions(w,h);if(rgba.length!==w*h*4)throw Error('Pixel count does not match map dimensions.');const c=new Uint8Array(w*h);for(let i=0;i<c.length;i++){if(rgba[4*i+3]<128)continue;let d=Infinity,t=0;for(const p of palette){let n=(rgba[4*i]-p.rgb[0])**2+(rgba[4*i+1]-p.rgb[1])**2+(rgba[4*i+2]-p.rgb[2])**2;if(n<d){d=n;t=p.type;}}c[i]=t;}return c;}
 return{normalize,generate,classify,maskAt,supported,makeTemplate,options};
})();
