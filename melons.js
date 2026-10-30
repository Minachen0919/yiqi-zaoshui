/* 一起早睡 · watermelon collection: drawings, catalogue and growing rules.
   Wrapped so none of these names collide with app.js; everything is reached through window.Melon. */
(function () {
let uid = 0; // unique ids for clip paths and gradients inside each drawing
/* ---------- drawing ---------- */
// seeds in several styles, drawn at (x,y)
function seed(x,y,s,c,rot=0){
  if(s==="none") return "";
  if(s==="soft") return `<ellipse cx="${x}" cy="${y}" rx="1.1" ry="1.8" fill="#fff" opacity=".55" transform="rotate(${rot} ${x} ${y})"/>`;
  if(s==="star"){let p="";for(let i=0;i<10;i++){const r=i%2?1.2:3,a=-Math.PI/2+i*Math.PI/5;p+=`${(x+r*Math.cos(a)).toFixed(2)},${(y+r*Math.sin(a)).toFixed(2)} `;}return `<polygon points="${p}" fill="${c}"/>`;}
  if(s==="heart") return `<path d="M${x} ${y+1.8}c-2.6-1.6-3.4-3-3-4 .4-1.1 2-1.3 3-.1 1-1.2 2.6-1 3 .1.4 1-.4 2.4-3 4z" fill="${c}"/>`;
  if(s==="glow") return `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="2.4" fill="${c}" filter="url(#glow)" transform="rotate(${rot} ${x} ${y})"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="2.4" fill="${c}" transform="rotate(${rot} ${x} ${y})"/>`;
}
// wavy dark stripes over the rind, clipped to the melon outline
function stripes(id,cx,cy,w,h,color,n,wav){
  if(!color) return "";
  let s="";
  for(let i=0;i<n;i++){
    const x=cx-w+((i+.5)/n)*2*w;
    let d=`M${x} ${cy-h-4}`;
    for(let k=0;k<6;k++){const y1=cy-h+(k+.5)*(2*h/6),y2=cy-h+(k+1)*(2*h/6);d+=` Q${x+(k%2?-wav:wav)} ${y1} ${x} ${y2}`;}
    s+=`<path d="${d}" stroke="${color}" stroke-width="${(w/n)*.55}" fill="none" stroke-linecap="round"/>`;
  }
  return `<g clip-path="url(#${id})">${s}</g>`;
}
function wholeShape(m,cx,cy){
  const sz=m.size||1;
  if(m.shape==="square"){const a=30*sz;return {clip:`<rect x="${cx-a}" y="${cy-a}" width="${2*a}" height="${2*a}" rx="${8*sz}"/>`,w:a,h:a,top:cy-a};}
  if(m.shape==="oval"){const rx=40*sz,ry=25*sz;return {clip:`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`,w:rx,h:ry,top:cy-ry};}
  if(m.shape==="heart"){const s=sz*1.15;return {clip:`<path d="M${cx} ${cy+30*s}C${cx-40*s} ${cy+4*s} ${cx-36*s} ${cy-30*s} ${cx-14*s} ${cy-28*s}C${cx-5*s} ${cy-27*s} ${cx} ${cy-20*s} ${cx} ${cy-14*s}C${cx} ${cy-20*s} ${cx+5*s} ${cy-27*s} ${cx+14*s} ${cy-28*s}C${cx+36*s} ${cy-30*s} ${cx+40*s} ${cy+4*s} ${cx} ${cy+30*s}Z"/>`,w:36*s,h:30*s,top:cy-27*s};}
  const r=32*sz;return {clip:`<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r*.95}"/>`,w:r,h:r*.95,top:cy-r*.95};
}
function whole(m,cx,cy){
  const id="c"+(++uid), g="g"+uid, sh=wholeShape(m,cx,cy);
  const fill=m.rindGrad?`url(#${g})`:m.rind;
  const shine=`<ellipse cx="${cx-sh.w*.35}" cy="${cy-sh.h*.4}" rx="${sh.w*.22}" ry="${sh.h*.14}" fill="#fff" opacity="${m.shine??.18}" transform="rotate(-25 ${cx-sh.w*.35} ${cy-sh.h*.4})"/>`;
  const frost=m.frost?Array.from({length:16},(_,i)=>`<circle cx="${cx-sh.w+((i*37)%100)/100*2*sh.w}" cy="${cy-sh.h+((i*53)%100)/100*2*sh.h}" r="${.8+(i%3)*.5}" fill="#fff" opacity=".7"/>`).join(""):"";
  const stem=`<path d="M${cx+2} ${sh.top+2}c1-6 6-9 11-7" stroke="#5a8f4e" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return `<defs><clipPath id="${id}">${sh.clip}</clipPath>${m.rindGrad?`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.rindGrad[0]}"/><stop offset="1" stop-color="${m.rindGrad[1]}"/></linearGradient>`:""}</defs>
  <g clip-path="url(#${id})"><rect x="${cx-60}" y="${cy-60}" width="120" height="120" fill="${fill}"/></g>
  ${stripes(id,cx,cy,sh.w,sh.h,m.stripe,m.stripes||7,m.wave??2.2)}<g clip-path="url(#${id})">${frost}${shine}</g>${stem}`;
}
// half-disc slice, flat edge up, with the seeds of this variety
function slice(m,cx,cy,r,rot){
  const rindR=r, whiteR=r*(m.thin?.94:.88), fleshR=r*(m.thin?.89:.8);
  const seeds=[[-.45,.28,-20],[-.12,.52,-8],[.2,.5,8],[.48,.26,22],[-.3,.12,-15],[.05,.25,0],[.32,.1,15]]
    .map(([x,y,a])=>seed(cx+x*r,cy+y*r,m.seed||"oval",m.seedColor||"#141012",a)).join("");
  const heartCut=m.shape==="heart";
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <path d="M${cx-rindR} ${cy}a${rindR} ${rindR} 0 0 0 ${2*rindR} 0z" fill="${m.rindGrad?m.rindGrad[1]:m.rind}"/>
    <path d="M${cx-whiteR} ${cy}a${whiteR} ${whiteR} 0 0 0 ${2*whiteR} 0z" fill="${m.white||"#fff4ea"}"/>
    <path d="M${cx-fleshR} ${cy}a${fleshR} ${fleshR} 0 0 0 ${2*fleshR} 0z" fill="${m.flesh}" ${m.fleshGlow?'filter="url(#glow)"':""}/>
    ${m.crystal?`<path d="M${cx-fleshR*.6} ${cy+3}l${fleshR*.3} ${fleshR*.4}M${cx+fleshR*.2} ${cy+4}l${fleshR*.25} ${fleshR*.3}" stroke="#fff" stroke-width="1.4" opacity=".7" stroke-linecap="round"/>`:""}
    ${seeds}
    <path d="M${cx-fleshR} ${cy}h${2*fleshR}" stroke="#fff" stroke-width="1" opacity=".35"/>
  </g>`;
}
function art(m){
  const glowDef=`<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  let w="";
  if(m.shape==="twin") w=whole({...m,shape:"round",size:.78},34,46)+whole({...m,shape:"round",size:.78},64,50);
  else if(m.shape==="crescent") w="";
  else w=whole(m,m.size&&m.size<.8?50:46,48);
  let s=m.shape==="crescent"
    ? slice(m,60,42,40,-28)
    : slice(m,84,74,24,-14);
  const aura=m.aura?`<circle cx="60" cy="52" r="46" fill="${m.aura}" opacity=".16" filter="url(#glow)"/>`:"";
  const sparkle=m.sparkle?[[18,16],[104,20],[100,86],[14,80]].map(([x,y])=>`<path d="M${x} ${y-4}l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="${m.sparkle}"/>`).join(""):"";
  return `<svg viewBox="0 0 120 100" role="img" aria-label="${m.name}">${glowDef}${aura}${sparkle}${w}${s}</svg>`;
}

/* ---------- varieties ---------- */
const R={common:["Common","var(--common)"],uncommon:["Uncommon","var(--uncommon)"],rare:["Rare","var(--rare)"],epic:["Epic","var(--epic)"],legend:["Legendary","var(--legend)"],sweet:["Sweets","var(--red)"]};
const melons=[
 {name:"Classic Red",cn:"经典红瓤",r:"common",tag:"一切的开始，又甜又沙的那种。",how:"第一次连续 7 晚一起达标",rind:"#3f9a5e",stripe:"#1f5c35",flesh:"#ff4d63"},
 {name:"Sunny Yellow",cn:"黄瓤小西瓜",r:"common",tag:"切开是一整块阳光。",how:"轮流出现的普通品种",rind:"#4aa36a",stripe:"#22603a",flesh:"#ffd34d"},
 {name:"Qilin",cn:"麒麟瓜",r:"common",tag:"椭圆的身子，花纹像水波。",how:"轮流出现的普通品种",shape:"oval",rind:"#5cb26f",stripe:"#2a6b3f",stripes:9,wave:3,flesh:"#ff5e70"},
 {name:"Mini",cn:"迷你瓜",r:"common",tag:"一个人一半，刚刚好。",how:"轮流出现的普通品种",size:.7,rind:"#56ad6c",stripe:"#2a6b3f",flesh:"#ff6b7c"},
 {name:"Seedless",cn:"无籽西瓜",r:"uncommon",tag:"不用吐籽，可以大口吃。",how:"7 晚里谁都没有请假",rind:"#3c955a",stripe:"#1f5c35",flesh:"#ff5468",seed:"soft"},
 {name:"Xiaolan",cn:"小兰",r:"uncommon",tag:"皮薄得能透光，嫩黄色的瓤。",how:"7 晚都在约定时间前 10 分钟睡",rind:"#8ccf8a",stripe:"#4e9a55",stripes:10,wave:1.5,flesh:"#ffe27a",thin:true},
 {name:"Milky Pink",cn:"冰淇淋瓜",r:"uncommon",tag:"粉白色的瓤，吃起来像冰淇淋。",how:"7 晚都写了晚安话",rind:"#4aa36a",stripe:"#22603a",flesh:"#ffc2cc",seedColor:"#5a3a40"},
 {name:"Black Beauty",cn:"黑美人",r:"rare",tag:"深得几乎看不出花纹，瓤红得发亮。",how:"连续 14 晚一起达标",rind:"#1d2a22",stripe:"#101812",flesh:"#e8273f",shine:.25},
 {name:"Square",cn:"方西瓜",r:"rare",tag:"规规矩矩，像你们俩的作息。",how:"7 晚的入睡时间前后差不超过 15 分钟",shape:"square",rind:"#3f9a5e",stripe:"#1f5c35",flesh:"#ff4d63"},
 {name:"Starseed",cn:"星星籽西瓜",r:"rare",tag:"每一颗籽都是一颗小星星。",how:"7 晚都在 23:00 前一起睡下",rind:"#2f6f4a",stripe:"#173d28",flesh:"#ff4d63",seed:"star",seedColor:"#fff1a8",sparkle:"#fff1a8"},
 {name:"Snowy",cn:"雪地西瓜",r:"rare",tag:"表皮结了一层霜，冰冰凉凉。",how:"12 月到 2 月里收获的西瓜",rind:"#8fc9b6",stripe:"#5e9c8c",frost:true,flesh:"#ff9aaa",white:"#f2fbff",crystal:true},
 {name:"Twins",cn:"双生瓜",r:"epic",tag:"两颗长在同一根藤上。",how:"同一周里，两个人每晚入睡时间相差不到 10 分钟",shape:"twin",rind:"#3f9a5e",stripe:"#1f5c35",flesh:"#ff4d63"},
 {name:"Sweetheart",cn:"心形西瓜",r:"epic",tag:"留给纪念日的那一颗。",how:"在恋爱纪念日或生日当周收获",shape:"heart",rind:"#3f9a5e",stripe:"#1f5c35",flesh:"#ff4d63",seed:"heart",seedColor:"#8a1f30"},
 {name:"Moon Slice",cn:"月亮西瓜",r:"epic",tag:"就是 App 图标上那一弯。",how:"累计收获 10 个西瓜",shape:"crescent",rind:"#68c49a",flesh:"#ff4d63",white:"#fff4f1"},
 {name:"Glow",cn:"夜光西瓜",r:"legend",tag:"关了灯也会发光的西瓜。",how:"连续 30 晚一起达标",rind:"#173a2c",stripe:"#0d2219",flesh:"#ff7a8f",fleshGlow:true,seed:"glow",seedColor:"#b6fff0",aura:"#7cffd9"},
 {name:"Golden",cn:"金西瓜",r:"legend",tag:"传说中的金西瓜，要一整周都做到最好。",how:"连续 100 晚一起达标",rindGrad:["#ffe08a","#c9932a"],stripe:"#a8761c",flesh:"#ffb547",white:"#fff2c8",seedColor:"#7a4d0e",aura:"#ffc94d",sparkle:"#ffe08a",shine:.4}
];


/* ---------- dress-up melons: a whole melon wearing an accessory ---------- */
const BASE={rind:"#3f9a5e",stripe:"#1f5c35",flesh:"#ff4d63"};
function face(cx,cy,kind){
  const eyes=kind==="sleepy"
    ?`<path d="M${cx-11} ${cy}q3 3 6 0M${cx+5} ${cy}q3 3 6 0" stroke="#141012" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    :`<ellipse cx="${cx-8}" cy="${cy}" rx="1.9" ry="2.4" fill="#141012"/><ellipse cx="${cx+8}" cy="${cy}" rx="1.9" ry="2.4" fill="#141012"/>`;
  return `<g>${eyes}<ellipse cx="${cx-14}" cy="${cy+5}" rx="3.6" ry="2.2" fill="#ff8fa0" opacity=".75"/><ellipse cx="${cx+14}" cy="${cy+5}" rx="3.6" ry="2.2" fill="#ff8fa0" opacity=".75"/>
    <path d="M${cx-2.5} ${cy+5}q2.5 2.4 5 0" stroke="#141012" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`;
}
const acc={
  crown:(cx,t)=>`<g transform="translate(${cx} ${t+2})"><path d="M-17 0L-19 -17L-9 -9L0 -22L9 -9L19 -17L17 0Z" fill="#ffc94d" stroke="#c9932a" stroke-width="1.4" stroke-linejoin="round"/><rect x="-17" y="-3" width="34" height="5" rx="2" fill="#f2b52e"/><circle cx="0" cy="-22" r="2.4" fill="#ff4d63"/><circle cx="-19" cy="-17" r="2" fill="#8fb7ff"/><circle cx="19" cy="-17" r="2" fill="#8fb7ff"/><circle cx="0" cy="-8" r="2.6" fill="#ff4d63"/></g>`,
  strawberry:(cx,t)=>{const sb=(x,y,sc,r)=>`<g transform="translate(${x} ${y}) rotate(${r}) scale(${sc})"><path d="M0 14C-9 10 -11 0 -9 -4C-6 -8 6 -8 9 -4C11 0 9 10 0 14Z" fill="#ff3b54"/><path d="M-8 -5l4 2 4-4 4 4 4-2-3 4-5-1-5 1z" fill="#4fae7f"/>${[[-4,0],[3,1],[-1,6],[4,8],[-5,7]].map(([a,b])=>`<ellipse cx="${a}" cy="${b}" rx=".8" ry="1.2" fill="#ffe08a"/>`).join("")}</g>`;return sb(cx+16,t+2,1.15,18)+sb(cx-34,t+58,.85,-20);},
  ribbon:(cx,t)=>`<g transform="translate(${cx+16} ${t+4}) rotate(18) scale(.9)"><path d="M0 0C-6 -10 -22 -14 -22 -4C-22 6 -6 4 0 0Z" fill="#ff8fb3"/><path d="M0 0C6 -10 22 -14 22 -4C22 6 6 4 0 0Z" fill="#ff8fb3"/><path d="M0 0C-3 4 -7 8 -9 11M0 0C3 4 7 8 9 11" stroke="#ff8fb3" stroke-width="4" stroke-linecap="round"/><circle r="4.5" fill="#ff5e8e"/><path d="M-16 -5c3-3 7-3 9 0M16 -5c-3-3-7-3-9 0" stroke="#fff" stroke-width="1.4" opacity=".6" fill="none"/></g>`,
  star:(cx,t)=>{let p="";for(let i=0;i<10;i++){const r=i%2?6:14,a=-Math.PI/2+i*Math.PI/5;p+=`${(r*Math.cos(a)).toFixed(1)},${(r*Math.sin(a)).toFixed(1)} `;}
    return `<g transform="translate(${cx+18} ${t+4}) rotate(14)"><polygon points="${p}" fill="#ffe08a" stroke="#f2b52e" stroke-width="1.5" stroke-linejoin="round"/><circle cx="-3" cy="-1" r="1.3" fill="#141012"/><circle cx="3" cy="-1" r="1.3" fill="#141012"/></g>${[[cx-34,t+6],[cx+40,t+30],[cx-38,t+44]].map(([x,y])=>`<path d="M${x} ${y-5}l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#fff1a8"/>`).join("")}`;},
  bunny:(cx,t)=>`<g transform="translate(${cx} ${t+6})"><g transform="rotate(-14 -9 0)"><ellipse cx="-9" cy="-16" rx="6.5" ry="17" fill="#fff4f1"/><ellipse cx="-9" cy="-15" rx="3.2" ry="12" fill="#ffb3c4"/></g><g transform="rotate(16 9 0)"><ellipse cx="9" cy="-16" rx="6.5" ry="17" fill="#fff4f1"/><ellipse cx="9" cy="-15" rx="3.2" ry="12" fill="#ffb3c4"/></g></g>`,
  kitty:(cx,t)=>`<g transform="translate(${cx} ${t+8})"><path d="M-24 4L-20 -16L-6 -4Z" fill="#3f9a5e" stroke="#1f5c35" stroke-width="1.6" stroke-linejoin="round"/><path d="M-20 -10L-18 -2L-11 -4Z" fill="#ffb3c4"/><path d="M24 4L20 -16L6 -4Z" fill="#3f9a5e" stroke="#1f5c35" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 -10L18 -2L11 -4Z" fill="#ffb3c4"/></g>`,
  angel:(cx,t)=>{const wing=(dir)=>`<g transform="translate(${cx+dir*30} ${t+34}) scale(${dir} 1)"><path d="M0 0C10 -18 26 -20 30 -10C26 -8 22 -4 24 0C18 -2 14 2 16 6C10 4 6 6 0 0Z" fill="#fff4f1" stroke="#e8d6da" stroke-width="1.2" stroke-linejoin="round"/></g>`;
    return `${wing(-1)}${wing(1)}<ellipse cx="${cx}" cy="${t-8}" rx="16" ry="4.5" fill="none" stroke="#ffd34d" stroke-width="3.2"/><ellipse cx="${cx}" cy="${t-8}" rx="16" ry="4.5" fill="none" stroke="#fff1a8" stroke-width="1" opacity=".8"/>`;}
};
const whiskers=(cx,cy)=>`<path d="M${cx-18} ${cy+3}h-12M${cx-18} ${cy+7}l-11 3M${cx+18} ${cy+3}h12M${cx+18} ${cy+7}l11 3" stroke="#fff4f1" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>`;
function dressArt(d){
  const cx=60,cy=58,m={...BASE,...(d.base||{}),size:.95};
  const top=cy-32*.95*.95;
  const back=d.acc==="angel"?acc.angel(cx,top):"";
  const front=d.acc==="angel"?"":acc[d.acc](cx,top);
  const glowDef=`<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  return `<svg viewBox="0 0 120 100" role="img" aria-label="${d.name}">${glowDef}${back}${whole(m,cx,cy)}${d.face?face(cx,cy+4,d.face):""}${d.acc==="kitty"?whiskers(cx,cy+6):""}${front}</svg>`;
}
const dress=[
 {name:"Crown Melon",cn:"皇冠西瓜",r:"rare",acc:"crown",tag:"这一周的早起王。",how:"一周 7 天里，有 5 天是先起床的那个人"},
 {name:"Strawberry Melon",cn:"草莓西瓜",r:"uncommon",acc:"strawberry",tag:"西瓜和草莓，夏天和春天。",how:"一周里两个人都附了 5 张以上早安照片"},
 {name:"Ribbon Melon",cn:"蝴蝶结西瓜",r:"uncommon",acc:"ribbon",tag:"像一份包好的礼物。",how:"一周里两个人的晚安话都没有重样"},
 {name:"Twinkle Melon",cn:"星星西瓜",r:"rare",acc:"star",tag:"头上别着一颗会眨眼的星星。",how:"一周里有 3 晚两个人都在 22:30 前睡下"},
 {name:"Angel Melon",cn:"天使西瓜",r:"legend",acc:"angel",tag:"一整个月都乖乖的。",how:"整整一个自然月，两个人都没有请假也没有断签"}
];

/* ---------- sweets: desserts made from melons, bought with seeds ---------- */
const sweetsArt={
  cake:`<ellipse cx="60" cy="84" rx="40" ry="7" fill="#3a2d31"/><path d="M28 50v28a32 8 0 0 0 64 0V50z" fill="#3f9a5e"/><path d="M28 50v6a32 8 0 0 0 64 0v-6z" fill="#fff4ea"/><ellipse cx="60" cy="50" rx="32" ry="8" fill="#ff4d63"/>
    ${[[-24,62],[-12,66],[0,67],[12,66],[24,62]].map(([x,y])=>`<path d="M${60+x} ${y}q-2 6 0 14" stroke="#1f5c35" stroke-width="3" fill="none"/>`).join("")}
    ${[-22,-11,0,11,22].map(x=>`<circle cx="${60+x}" cy="${46+Math.abs(x)*.12}" r="4.6" fill="#fff"/>`).join("")}
    <g transform="translate(52 30) rotate(-10)"><path d="M-10 6a10 10 0 0 0 20 0z" fill="#68c49a"/><path d="M-8.5 6a8.5 8.5 0 0 0 17 0z" fill="#fff4ea"/><path d="M-7 6a7 7 0 0 0 14 0z" fill="#ff4d63"/><ellipse cx="-2" cy="9" rx=".9" ry="1.4" fill="#141012"/><ellipse cx="3" cy="9" rx=".9" ry="1.4" fill="#141012"/></g>
    <g transform="translate(70 34)"><path d="M0 10C-7 7 -8 0 -6 -3C-4 -6 4 -6 6 -3C8 0 7 7 0 10Z" fill="#ff3b54"/><path d="M-6 -4l3 2 3-3 3 3 3-2-2 3-4-1-4 1z" fill="#4fae7f"/></g>
    <path d="M78 20v12" stroke="#ffe08a" stroke-width="2.4"/><path d="M78 15c2 2 2 4 0 5c-2-1-2-3 0-5z" fill="#ffb547"/>`,
  donut:`<ellipse cx="60" cy="84" rx="36" ry="6" fill="#3a2d31"/><circle cx="60" cy="50" r="32" fill="#e8b77a"/><path d="M60 22c10 0 26 6 28 20s-4 26 -10 30-12-2-18 2-14 0-18-6-12-8-10-20 12-26 28-26z" fill="#68c49a"/>
    <path d="M60 25c9 0 22 5 24 17s-4 23 -9 26-11-2-15 2-12 0-16-5-11-7-9-18 10-22 25-22z" fill="#ff4d63"/><circle cx="60" cy="50" r="10" fill="#171113"/><circle cx="60" cy="50" r="10" fill="none" stroke="#e8b77a" stroke-width="3"/>
    ${[[44,34,-30],[72,32,20],[80,52,60],[42,60,-60],[56,70,10],[74,66,40],[50,30,0]].map(([x,y,a])=>`<ellipse cx="${x}" cy="${y}" rx="1.4" ry="2.4" fill="#141012" transform="rotate(${a} ${x} ${y})"/>`).join("")}
    <ellipse cx="48" cy="30" rx="7" ry="3" fill="#fff" opacity=".3" transform="rotate(-25 48 30)"/>`,
  slush:`<ellipse cx="60" cy="90" rx="22" ry="4" fill="#3a2d31"/><path d="M40 34L46 88h28L80 34z" fill="#ffffff" opacity=".18"/><path d="M42 44L47 87h26L78 44z" fill="#ff5e70"/>
    ${[[52,56],[64,62],[56,72],[68,78],[50,80]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.1" ry="1.8" fill="#141012"/>`).join("")}<path d="M44 52l32 0" stroke="#fff" stroke-width="1" opacity=".35"/>
    <path d="M36 34h48a24 14 0 0 0 -48 0z" fill="#fff" opacity=".28"/><rect x="36" y="32" width="48" height="4" rx="2" fill="#fff" opacity=".5"/><path d="M64 34L72 8" stroke="#68c49a" stroke-width="4" stroke-linecap="round"/><path d="M64 34L72 8" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 3" stroke-linecap="round"/>
    <g transform="translate(84 36) rotate(30)"><path d="M-12 0a12 12 0 0 0 24 0z" fill="#68c49a"/><path d="M-10 0a10 10 0 0 0 20 0z" fill="#fff4ea"/><path d="M-8.5 0a8.5 8.5 0 0 0 17 0z" fill="#ff4d63"/></g>
    <path d="M58 40l4 4 4-4" stroke="#fff" stroke-width="1.2" opacity=".5" fill="none"/>`,
  cone:`<ellipse cx="60" cy="92" rx="14" ry="3" fill="#3a2d31"/><path d="M44 46L60 90L76 46z" fill="#e3a65e"/><path d="M48 52l20 20M52 46l20 20M46 60l14 14M56 46l18 18M68 50L54 64M74 48L58 64M62 46L50 58M72 58L60 70" stroke="#b9782f" stroke-width="1.4"/>
    <circle cx="60" cy="38" r="20" fill="#ff6b7c"/><path d="M40 42c4 6 8 2 12 6s8-2 12 2 8-2 12-4l2-6H40z" fill="#68c49a"/><path d="M40 42c4 6 8 2 12 6s8-2 12 2 8-2 12-4" stroke="#fff4ea" stroke-width="2.5" fill="none"/>
    ${[[52,30],[62,26],[68,36],[56,40],[48,36]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.2" ry="2" fill="#141012"/>`).join("")}<ellipse cx="52" cy="26" rx="5" ry="2.6" fill="#fff" opacity=".3" transform="rotate(-30 52 26)"/>`,
  pop:`<ellipse cx="60" cy="92" rx="10" ry="2.5" fill="#3a2d31"/><rect x="56" y="62" width="8" height="30" rx="4" fill="#e3c08f"/><g transform="translate(60 40)"><path d="M-30 -16L0 34L30 -16z" fill="#68c49a" stroke-linejoin="round"/><path d="M-26 -16L0 28L26 -16z" fill="#fff4ea"/><path d="M-23 -16L0 23L23 -16z" fill="#ff4d63"/>
    <circle cx="20" cy="-16" r="7" fill="#1c1517"/><circle cx="12" cy="-17" r="5" fill="#1c1517"/>${[[-10,-6],[0,0],[-4,8],[8,-4]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.2" ry="2" fill="#141012"/>`).join("")}</g>`,
  macaron:(()=>{
    const mac=(cx,cy,sh,dark,foot,cream,ring,seed)=>`
      <ellipse cx="${cx}" cy="${cy+11}" rx="30" ry="9" fill="${dark}"/><rect x="${cx-30}" y="${cy+4}" width="60" height="7" fill="${dark}"/><ellipse cx="${cx}" cy="${cy+4}" rx="30" ry="9" fill="${sh}"/>
      <ellipse cx="${cx}" cy="${cy+2}" rx="29" ry="8.5" fill="none" stroke="${foot}" stroke-width="3" stroke-dasharray="1.6 1.4"/>
      <rect x="${cx-28}" y="${cy-3}" width="56" height="5" fill="${ring}"/><ellipse cx="${cx}" cy="${cy+2}" rx="28" ry="8" fill="${ring}"/><ellipse cx="${cx}" cy="${cy-3}" rx="28" ry="8" fill="${cream}"/>
      <ellipse cx="${cx}" cy="${cy-5}" rx="29" ry="8.5" fill="none" stroke="${foot}" stroke-width="3" stroke-dasharray="1.6 1.4"/>
      <path d="M${cx-30} ${cy-7}C${cx-30} ${cy-31} ${cx+30} ${cy-31} ${cx+30} ${cy-7}A30 9 0 0 1 ${cx-30} ${cy-7}Z" fill="${sh}"/>
      <path d="M${cx-30} ${cy-7}A30 9 0 0 0 ${cx+30} ${cy-7}" stroke="${dark}" stroke-width="1.2" fill="none" opacity=".5"/>
      <ellipse cx="${cx-12}" cy="${cy-19}" rx="9" ry="3.6" fill="#fff" opacity=".35" transform="rotate(-12 ${cx-12} ${cy-19})"/>
      ${seed?[[-6,-14,-20],[6,-16,15],[14,-11,30],[-16,-10,-35],[0,-9,0]].map(([x,y,r])=>`<ellipse cx="${cx+x}" cy="${cy+y}" rx="1.2" ry="2" fill="${seed}" transform="rotate(${r} ${cx+x} ${cy+y})"/>`).join(""):""}`;
    return `<ellipse cx="62" cy="88" rx="40" ry="6" fill="#3a2d31"/>
      <g transform="translate(78 50) rotate(16) scale(.72) translate(-60 -50)">${mac(60,50,"#7fd3a7","#4fae7f","#b3ead0","#ff6f84","#ff4d63",null)}</g>
      ${mac(54,62,"#ff7d91","#e2556b","#ffb3c0","#fff4ea","#68c49a","#141012")}`;
  })(),
  jelly:`<ellipse cx="60" cy="82" rx="38" ry="8" fill="#e8d6da"/><ellipse cx="60" cy="80" rx="34" ry="6" fill="#fff"/><path d="M32 78C32 46 44 30 60 30S88 46 88 78z" fill="#ff4d63" opacity=".88"/><path d="M36 78C38 70 82 70 84 78" fill="#68c49a" opacity=".9"/>
    ${[[48,50],[60,44],[70,56],[54,62],[66,66]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.3" ry="2.2" fill="#141012" opacity=".75"/>`).join("")}<path d="M42 44c3-6 8-9 12-10" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55" fill="none"/><path d="M60 30c-2-6 2-10 6-10" stroke="#4fae7f" stroke-width="2" fill="none"/><ellipse cx="68" cy="20" rx="5" ry="2.6" fill="#68c49a" transform="rotate(-20 68 20)"/>`,
  parfait:`<ellipse cx="60" cy="94" rx="16" ry="3" fill="#3a2d31"/><path d="M58 76h4v16h-4z" fill="#ffffff" opacity=".3"/><ellipse cx="60" cy="92" rx="12" ry="2.5" fill="#ffffff" opacity=".3"/><path d="M40 30h40l-6 46H46z" fill="#ffffff" opacity=".16"/>
    <path d="M42 36h36l-1.5 10h-33z" fill="#fff"/><path d="M43.5 46h33l-1.5 10h-30z" fill="#ff4d63"/><path d="M45 56h30l-1 8h-28z" fill="#fff4ea"/><path d="M46 64h28l-1.5 12h-25z" fill="#68c49a"/>
    ${[[52,50],[64,51],[58,53]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1" ry="1.6" fill="#141012"/>`).join("")}<path d="M42 36c2-10 12-10 18-6 6-4 16-4 18 6z" fill="#fff"/>
    <g transform="translate(66 24) rotate(-25)"><path d="M-9 0a9 9 0 0 0 18 0z" fill="#68c49a"/><path d="M-7.5 0a7.5 7.5 0 0 0 15 0z" fill="#fff4ea"/><path d="M-6.2 0a6.2 6.2 0 0 0 12.4 0z" fill="#ff4d63"/></g><path d="M52 26c-2-5 1-8 5-8-1 3-2 6-5 8z" fill="#4fae7f"/><circle cx="56" cy="30" r="3.2" fill="#ff3b54"/>`
};
const sweets=[
 {name:"Melon Slush",cn:"西瓜冰沙",k:"slush",cost:5,tag:"夏天最需要的一杯。"},
 {name:"Melon Pop",cn:"西瓜冰棒",k:"pop",cost:8,tag:"被咬了一口，大概是你吧。"},
 {name:"Melon Donut",cn:"西瓜甜甜圈",k:"donut",cost:12,tag:"粉红糖霜，西瓜籽当巧克力豆。"},
 {name:"Melon Macaron",cn:"西瓜马卡龙",k:"macaron",cost:15,tag:"西瓜红的壳撒着籽，后面还躲着一个绿色的。"},
 {name:"Melon Cone",cn:"西瓜甜筒",k:"cone",cost:20,tag:"一勺西瓜味的冰淇淋。"},
 {name:"Melon Jelly",cn:"西瓜果冻",k:"jelly",cost:25,tag:"晃一晃会抖的那种。"},
 {name:"Melon Parfait",cn:"西瓜芭菲",k:"parfait",cost:30,tag:"一层奶油一层西瓜，一层又一层。"},
 {name:"Melon Mini Cake",cn:"西瓜小蛋糕",k:"cake",cost:50,tag:"用整个西瓜做的蛋糕，留给纪念日。"}
];


/* ---------- what each seed asks of you ---------- */
// nights to grow, the extra challenge (empty = none), and when the packet is available
const PLAN={
 "Classic Red":[3,""],"Sunny Yellow":[3,""],"Qilin":[3,""],"Mini":[3,""],
 "Seedless":[3,"这 3 晚里谁都没有请假"],"Xiaolan":[3,"每晚都比约定时间早 10 分钟睡"],"Milky Pink":[3,"每晚两个人都写了晚安话"],
 "Black Beauty":[7,"有 5 晚两个人都在 23:15 前睡下"],"Square":[7,"每晚的入睡时间前后差不超过 15 分钟"],"Starseed":[7,"每晚都在 23:00 前一起睡下"],
 "Snowy":[3,""],"Twins":[7,"每晚两个人的入睡时间相差不到 10 分钟"],
 "Sweetheart":[3,""],"Moon Slice":[7,""],
 "Glow":[7,"每晚都在 23:00 前睡下，而且都写了晚安话"],"Golden":[7,"每晚都提前 10 分钟睡、都写了晚安话，也没有人请假"],
 "Crown Melon":[7,"7 天里有 5 天是先起床的那个人"],"Strawberry Melon":[3,"两个人加起来附了 3 张以上早安照片"],
 "Ribbon Melon":[3,"两个人的晚安话一句都没有重样"],"Twinkle Melon":[7,"有 3 晚两个人都在 22:30 前睡下"],
 "Angel Melon":[7,"每晚都提前 15 分钟睡，而且没有人请假"],
 "Melon Slush":[3,""],"Melon Pop":[3,""],"Melon Donut":[3,""],"Melon Macaron":[3,""],
 "Melon Cone":[7,""],"Melon Jelly":[7,""],"Melon Parfait":[7,""],"Melon Mini Cake":[7,""]
};
const howText=(name)=>{const [n,ch,av]=PLAN[name];return `${n} 晚${ch?" · 挑战："+ch:" · 没有额外挑战"}${av?" · "+(av.season||av.unlock):""}`;};

/* ---------- 7-night growth strip ---------- */
const grow=[
 ["第 1 晚","种下一颗籽",`<ellipse cx="50" cy="66" rx="30" ry="6" fill="#3a2a22"/><ellipse cx="50" cy="60" rx="3" ry="5" fill="#141012" stroke="#5a4a40"/>`],
 ["第 2 晚","发芽",`<ellipse cx="50" cy="70" rx="30" ry="6" fill="#3a2a22"/><path d="M50 68V52" stroke="#68c49a" stroke-width="3" stroke-linecap="round"/><path d="M50 56c-6-6-12-4-12-4s2 8 12 6M50 54c6-6 12-4 12-4s-2 8-12 6" fill="#68c49a"/>`],
 ["第 3 晚","长出藤",`<ellipse cx="50" cy="72" rx="34" ry="6" fill="#3a2a22"/><path d="M20 66c10-4 18 4 28-2s16-12 30-6" stroke="#68c49a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32 62c-4-8 2-12 6-10-2 4-2 8-6 10zM62 56c0-8 6-10 10-7-3 3-5 6-10 7z" fill="#4fae7f"/>`],
 ["第 4 晚","开花",`<ellipse cx="50" cy="72" rx="34" ry="6" fill="#3a2a22"/><path d="M18 66c10-4 18 4 28-2s16-12 34-6" stroke="#68c49a" stroke-width="3" fill="none"/><g transform="translate(56 50)">${[0,72,144,216,288].map(a=>`<ellipse rx="4" ry="7" fill="#ffd34d" transform="rotate(${a}) translate(0 -6)"/>`).join("")}<circle r="3.5" fill="#f2a516"/></g>`],
 ["第 5 晚","结出小瓜",`<ellipse cx="50" cy="74" rx="34" ry="6" fill="#3a2a22"/><path d="M16 68c10-4 18 4 28-2s16-10 34-6" stroke="#68c49a" stroke-width="3" fill="none"/><ellipse cx="56" cy="62" rx="10" ry="9" fill="#4aa36a"/><path d="M50 55q-2 7 0 14M56 53q-2 9 0 18M62 55q-2 7 0 14" stroke="#22603a" stroke-width="2" fill="none"/>`],
 ["第 6 晚","长大",`<ellipse cx="50" cy="76" rx="36" ry="6" fill="#3a2a22"/><path d="M12 70c8-4 14 2 20-1" stroke="#68c49a" stroke-width="3" fill="none"/><ellipse cx="54" cy="58" rx="22" ry="19" fill="#3f9a5e"/><path d="M40 42q-4 16 0 32M48 39q-4 19 0 38M56 39q-4 19 0 38M64 40q-4 17 0 34" stroke="#1f5c35" stroke-width="3.2" fill="none"/>`],
 ["第 7 晚","收获！",`<g transform="translate(50 52)">${[0,45,90,135,180,225,270,315].map(a=>`<path d="M0 -40v6" stroke="#ffc94d" stroke-width="2.5" stroke-linecap="round" transform="rotate(${a})"/>`).join("")}<ellipse rx="26" ry="24" fill="#3f9a5e"/><path d="M-16 -18q-5 18 0 36M-6 -23q-5 23 0 46M4 -23q-5 23 0 46M14 -19q-5 19 0 38" stroke="#1f5c35" stroke-width="3.6" fill="none"/><ellipse cx="-9" cy="-11" rx="6" ry="3.5" fill="#fff" opacity=".2" transform="rotate(-25 -9 -11)"/></g>`]
];


const sweetArt=(x)=>`<svg viewBox="0 0 120 100" role="img" aria-label="${x.name}">${sweetsArt[x.k]}</svg>`;
const items=[
  ...melons.map(m=>({...m,kind:"melon"})),
  ...dress.map(d=>({...d,kind:"dress"})),
  ...sweets.map(w=>({...w,r:"sweet",kind:"sweet"}))
];
items.forEach(x=>{x.need=PLAN[x.name][0];x.challenge=PLAN[x.name][1];});
const draw=(x)=>x.kind==="melon"?art(x):x.kind==="dress"?dressArt(x):sweetArt(x);
const byName=Object.fromEntries(items.map(x=>[x.name,x]));
const growSvg=(stage)=>`<svg viewBox="0 0 100 90" aria-hidden="true">${grow[Math.max(0,Math.min(6,stage))][2]}</svg>`;
window.Melon={items,byName,draw,R,PLAN,howText,growSvg,stageNames:grow.map(g=>g[1])};
})();
