// One parser feeds both the browser preview and editable Office Math.
const symbols = {cdot:'·',times:'×',div:'÷',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',to:'→',perp:'⊥',parallel:'∥',angle:'∠',triangle:'△',circ:'°',pm:'±',infty:'∞',alpha:'α',beta:'β',gamma:'γ',delta:'δ',theta:'θ',lambda:'λ',mu:'μ',pi:'π',rho:'ρ',sigma:'σ',phi:'φ',omega:'ω',Delta:'Δ',Pi:'Π',Sigma:'Σ',Omega:'Ω',sin:'sin',cos:'cos',tan:'tan',cot:'cot',log:'log',ln:'ln'};
const spacing = new Set([' ', ',', ';', ':', '!', 'quad', 'qquad', 'enspace', 'thinspace']);
export function parseMath(source) {
  const s=String(source);let i=0;
  const fail=message=>{throw Error('公式需要校正：'+message);};
  const group=()=>{while(s[i]===' ')i++;if(s[i]!=='{')fail('缺少花括号');i++;const value=sequence(true);if(s[i]!=='}')fail('花括号未闭合');i++;return value;};
  const atom=()=>{
    const ch=s[i++];
    if(ch==='{'){i--;return group();}
    if(ch==='}'||ch==='_'||ch==='^')return fail('上下标或花括号位置不正确');
    if(ch!=='\\')return {type:'text',value:ch};
    const name=/^[A-Za-z]+/.exec(s.slice(i))?.[0]||s[i++];
    if(!name)fail('末尾有未完成的反斜杠');
    if(/^[A-Za-z]+$/.test(name)){i+=name.length;while(s[i]===' ')i++;}
    if(spacing.has(name))return {type:'text',value:name==='!'?'':' '};
    if(name==='left'||name==='right')return s[i]==='.'?(i++,{type:'text',value:''}):atom();
    if(name==='frac'||name==='dfrac'||name==='tfrac')return {type:'frac',num:group(),den:group()};
    if(name==='sqrt'){if(s[i]==='[')fail('暂不支持带次数的根式，请保留原图或改用受支持写法');return {type:'sqrt',body:group()};}
    if(name==='vec'||name==='overline'||name==='bar')return {type:'accent',mark:name==='vec'?'→':'¯',body:group()};
    if(['mathrm','mathbf','mathit','text'].includes(name))return group();
    if(symbols[name])return {type:'text',value:symbols[name]};
    if(['{','}','%','$','#','_'].includes(name))return {type:'text',value:name};
    return fail('暂不支持命令 \\' + name);
  };
  const sequence=inside=>{
    const items=[];
    while(i<s.length&&!(inside&&s[i]==='}')){
      let node=atom();
      while(s[i]==='_'||s[i]==='^'){
        const key=s[i++]==='_'?'sub':'sup';if(i>=s.length)fail('上下标缺少内容');
        const value=s[i]==='{'?group():atom();
        if(node.type!=='script')node={type:'script',base:node};
        if(node[key])fail('上下标重复');node[key]=value;
      }
      items.push(node);
    }
    return {type:'row',items};
  };
  return sequence(false);
}
export function mathText(n) {
  if(n.type==='text')return n.value;
  if(n.type==='row')return n.items.map(mathText).join('');
  if(n.type==='frac')return '('+mathText(n.num)+')/('+mathText(n.den)+')';
  if(n.type==='sqrt')return '√('+mathText(n.body)+')';
  if(n.type==='accent')return mathText(n.body)+(n.mark==='→'?'⃗':'̅');
  const sup={0:'⁰',1:'¹',2:'²',3:'³',4:'⁴',5:'⁵',6:'⁶',7:'⁷',8:'⁸',9:'⁹','+':'⁺','-':'⁻'};
  const value=n.sup?mathText(n.sup):'';
  return mathText(n.base)+(n.sub?'₍'+mathText(n.sub)+'₎':'')+(value?([...value].every(c=>sup[c])?[...value].map(c=>sup[c]).join(''):'^('+value+')'):'');
}
export function mathOMML(n,size,run) {
  const write=(node,sz=size)=>mathOMML(node,sz,run);
  if(n.type==='text')return run(n.value==='-'?'−':n.value,size);
  if(n.type==='row')return n.items.map(node=>write(node)).join('');
  if(n.type==='frac')return '<m:f><m:fPr/><m:num>'+write(n.num)+'</m:num><m:den>'+write(n.den)+'</m:den></m:f>';
  if(n.type==='sqrt')return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>'+write(n.body)+'</m:e></m:rad>';
  if(n.type==='accent')return '<m:acc><m:accPr><m:chr m:val="'+n.mark+'"/></m:accPr><m:e>'+write(n.body)+'</m:e></m:acc>';
  const tag=n.sub&&n.sup?'sSubSup':n.sub?'sSub':'sSup';
  return '<m:'+tag+'><m:'+tag+'Pr/><m:e>'+write(n.base)+'</m:e>'+(n.sub?'<m:sub>'+write(n.sub,Math.max(8,size*.7))+'</m:sub>':'')+(n.sup?'<m:sup>'+write(n.sup,Math.max(8,size*.7))+'</m:sup>':'')+'</m:'+tag+'>';
}
// Layout uses a baseline, with explicit space above and below for nested maths.
export function measureMath(ctx,node,size) {
  const child=(n,scale=1)=>measureMath(ctx,n,size*scale);
  if(node.type==='text'){ctx.font='bold italic '+size+'px "Cambria Math",serif';return {w:ctx.measureText(node.value).width,up:size*.85,down:size*.25};}
  if(node.type==='row'){const children=node.items.map(n=>child(n));return {w:children.reduce((s,c)=>s+c.w,0),up:Math.max(size*.85,...children.map(c=>c.up)),down:Math.max(size*.25,...children.map(c=>c.down)),children};}
  if(node.type==='frac'){const a=child(node.num,.82),b=child(node.den,.82);return {w:Math.max(a.w,b.w)+size*.3,up:a.up+a.down+size*.25,down:b.up+b.down+size*.15,a,b};}
  if(node.type==='sqrt'||node.type==='accent'){const a=child(node.body);return {w:a.w+(node.type==='sqrt'?size*.65:size*.1),up:a.up+size*.2,down:a.down,a};}
  const a=child(node.base),sub=node.sub?child(node.sub,.65):null,sup=node.sup?child(node.sup,.65):null;
  return {w:a.w+Math.max(sub?.w||0,sup?.w||0),up:Math.max(a.up,sup?sup.up+size*.55:0),down:Math.max(a.down,sub?sub.down+size*.35:0),a,sub,sup};
}
export function drawMath(ctx,node,x,baseline,size) {
  const m=measureMath(ctx,node,size),draw=(n,l,b,scale=1)=>drawMath(ctx,n,l,b,size*scale);
  ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='bold italic '+size+'px "Cambria Math",serif';
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(1,size*.045);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  if(node.type==='text')ctx.fillText(node.value==='-'?'−':node.value,x,baseline);
  else if(node.type==='row'){let left=x;node.items.forEach((n,i)=>{draw(n,left,baseline);left+=m.children[i].w;});}
  else if(node.type==='frac'){draw(node.num,x+(m.w-m.a.w)/2,baseline-size*.25-m.a.down,.82);draw(node.den,x+(m.w-m.b.w)/2,baseline+size*.15+m.b.up,.82);line(x,baseline-size*.12,x+m.w,baseline-size*.12);}
  else if(node.type==='sqrt'){ctx.fillText('√',x,baseline);draw(node.body,x+size*.6,baseline);line(x+size*.55,baseline-m.a.up-size*.08,x+m.w,baseline-m.a.up-size*.08);}
  else if(node.type==='accent'){draw(node.body,x,baseline);const y=baseline-m.a.up-size*.07;line(x,y,x+m.w,y);if(node.mark==='→'){line(x+m.w,y,x+m.w-size*.15,y-size*.1);line(x+m.w,y,x+m.w-size*.15,y+size*.1);}}
  else {draw(node.base,x,baseline);if(node.sub)draw(node.sub,x+m.a.w,baseline+size*.35,.65);if(node.sup)draw(node.sup,x+m.a.w,baseline-size*.55,.65);}
  ctx.restore();return m;
}
export function layoutRichText(ctx,text,maxWidth,size) {
  const rows=[];let row;
  const fresh=()=>({items:[],w:0,up:size*.85,down:size*.25});
  const add=item=>{
    if(row.items.length&&row.w+item.m.w>maxWidth){rows.push(row);row=fresh();}
    row.items.push(item);row.w+=item.m.w;row.up=Math.max(row.up,item.m.up);row.down=Math.max(row.down,item.m.down);
  };
  for(const paragraph of String(text).split('\n')){
    row=fresh();let last=0;
    const plain=value=>{for(const ch of value){ctx.font='bold '+size+'px "Source Han Sans SC","思源黑体",sans-serif';add({text:ch,m:{w:ctx.measureText(ch).width,up:size*.85,down:size*.25}});}};
    for(const match of paragraph.matchAll(/\$\$(.*?)\$\$|\$([^$]+)\$/g)){
      plain(paragraph.slice(last,match.index));const node=parseMath(match[1]??match[2]);add({node,m:measureMath(ctx,node,size)});last=match.index+match[0].length;
    }
    plain(paragraph.slice(last));rows.push(row);
  }
  return {rows,height:rows.reduce((sum,r)=>sum+Math.max(size*1.22,r.up+r.down+size*.12),0),width:Math.max(0,...rows.map(r=>r.w))};
}
