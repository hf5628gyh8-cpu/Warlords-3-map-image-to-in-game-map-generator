/* Reusable, browser-independent terrain conversion core. */
const W3 = (() => {
  const WIDTH=80, HEIGHT=100, BASE=9008, STRIDE=128;
  const DIRS=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const CARDINAL=85;
  function maskAt(cells,x,y,type){let m=0; DIRS.forEach(([dx,dy],i)=>{let xx=x+dx,yy=y+dy;if(xx>=0&&xx<80&&yy>=0&&yy<100&&cells[yy*80+xx]===type)m|=1<<i;});return m;}
  const mountainCardinal={};
  for(const [key,counts] of Object.entries(MOUNTAIN_PATTERNS)) {
    if(!key.startsWith('mountain:'))continue;
    const m=(+key.split(':')[1])&CARDINAL, dest=mountainCardinal[m]??={};
    for(const [v,n] of Object.entries(counts))dest[parseInt(v,16)]=(dest[parseInt(v,16)]||0)+n;
  }
  const forest={20:3,84:131,80:163,21:355,85:387,81:419,5:515,69:547,65:579};
  const waters={};
  for(const [mask,counts] of Object.entries(WATER_PATTERNS)) {
    waters[mask]=Object.fromEntries(Object.entries(counts).filter(([v])=>+mask===255||![9,12].includes(+v>>5)));
  }
  function supported(type,m){return type===4?!!mountainCardinal[m&CARDINAL]:type===3?forest[m&CARDINAL]!==undefined:type===1?Object.keys(waters[m]||{}).length>0:true;}
  function normalize(input,smoothing=1,buffer=true) {
    if(input.length!==8000)throw Error('Expected an 80 × 100 map.');
    let cells=Uint8Array.from(input);if(cells.some(t=>![0,1,3,4].includes(t)))throw Error('Unknown terrain colour.');
    for(let pass=0;pass<smoothing;pass++){
      const next=cells.slice();
      for(let y=1;y<99;y++)for(let x=1;x<79;x++){
        const counts=[0,0,0,0,0];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)counts[cells[(y+dy)*80+x+dx]]++;
        const best=counts.indexOf(Math.max(...counts));if(counts[best]>=5)next[y*80+x]=best;
      }cells=next;
    }
    let border=0,mixed=0,unsupported=0;
    for(let y=0;y<100;y++)for(let x=0;x<80;x++)if((x===0||y===0||x===79||y===99)&&cells[y*80+x]){cells[y*80+x]=0;border++;}
    if(buffer){const next=cells.slice();for(let y=1;y<99;y++)for(let x=1;x<79;x++){
      const t=cells[y*80+x];if(!t)continue;
      if(DIRS.some(([dx,dy])=>{const n=cells[(y+dy)*80+x+dx];return n!==0&&n!==t;})){next[y*80+x]=0;mixed++;}
    }cells=next;}
    let rounds=0;
    while(true){const removed=[];for(let y=1;y<99;y++)for(let x=1;x<79;x++){
      const t=cells[y*80+x];if(t&&!supported(t,maskAt(cells,x,y,t)))removed.push(y*80+x);
    }if(!removed.length)break;removed.forEach(i=>cells[i]=0);unsupported+=removed.length;if(++rounds>8000)throw Error('Terrain cleanup did not converge.');}
    let changed=0;for(let i=0;i<8000;i++)if(input[i]!==cells[i])changed++;
    return {cells,changed,border,mixed,unsupported,rounds};
  }
  function choose(counts,rng){const a=Object.entries(counts).sort((a,b)=>+a[0]-b[0]);let n=rng()*a.reduce((n,[,v])=>n+v,0);for(const [v,c]of a){n-=c;if(n<0)return +v;}return +a[a.length-1][0];}
  function generate(cells,seed=143){
    if(cells.length!==8000)throw Error('Expected 8,000 map cells.');
    const bytes=Uint8Array.from(atob(TEMPLATE_B64),c=>c.charCodeAt(0)), view=new DataView(bytes.buffer);
    if(bytes.length!==209786)throw Error('Template size is incorrect.');
    let state=seed>>>0;const rng=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
    const counts={plains:0,water:0,forest:0,mountains:0}, keys={0:'plains',1:'water',3:'forest',4:'mountains'};
    for(let y=0;y<100;y++)for(let x=0;x<80;x++){
      const t=cells[y*80+x];if(!keys[t])throw Error('Unknown terrain type.');counts[keys[t]]++;
      const m=maskAt(cells,x,y,t);let v=0;
      if(t&&!supported(t,m))throw Error(`Unsupported terrain at column ${x+1}, row ${y+1}. Update the preview first.`);
      if(t===4){v=choose(MOUNTAIN_PATTERNS['mountain:'+m] ? Object.fromEntries(Object.entries(MOUNTAIN_PATTERNS['mountain:'+m]).map(([k,n])=>[parseInt(k,16),n])) : mountainCardinal[m&CARDINAL],rng);}
      else if(t===3)v=forest[m&CARDINAL];
      else if(t===1)v=choose(waters[m],rng);
      else {
        const mm=maskAt(cells,x,y,4);
        if(mm){let options=Object.entries(MOUNTAIN_PATTERNS).filter(([k])=>k.startsWith('surrounding:'));
          const pop=n=>{let c=0;for(;n;n&=n-1)c++;return c;};
          options.sort((a,b)=>{const ma=+a[0].split(':')[1],mb=+b[0].split(':')[1];return (4*pop((ma^mm)&85)+pop((ma^mm)&170))-(4*pop((mb^mm)&85)+pop((mb^mm)&170))||ma-mb;});
          const best=Object.entries(options[0][1]).sort((a,b)=>b[1]-a[1]||parseInt(a[0],16)-parseInt(b[0],16))[0];v=parseInt(best[0],16);
        }
      }
      if((v&31)!==t)throw Error('Terrain slot mismatch.');
      if(t===1&&m!==255&&[9,12].includes(v>>5))throw Error('Beachless water tile on coastline.');
      view.setUint16(BASE+10*(y*STRIDE+x)+6,v,true);
    }
    return {bytes,counts};
  }
  function classify(rgba,palette){if(rgba.length!==32000)throw Error('Expected 80 × 100 image pixels.');const result=new Uint8Array(8000);
    for(let i=0;i<8000;i++){if(rgba[4*i+3]<128)continue;let distance=Infinity,type=0;for(const p of palette){const d=(rgba[4*i]-p.rgb[0])**2+(rgba[4*i+1]-p.rgb[1])**2+(rgba[4*i+2]-p.rgb[2])**2;if(d<distance){distance=d;type=p.type;}}result[i]=type;}return result;
  }
  return {normalize,generate,classify,maskAt,supported};
})();
