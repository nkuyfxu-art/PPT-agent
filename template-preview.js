// Render the selected slide's actual template elements, never the deck thumbnail.
// Unsupported Office objects are reported so an approximate preview is not silent.
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const children=(node,name)=>[...(node?.children||[])].filter(n=>n.localName===name);
const child=(node,name)=>children(node,name)[0];
const descendant=(node,name)=>[...(node?.getElementsByTagNameNS('*',name)||[])][0];
const attr=(node,key,fallback)=>node?.hasAttribute(key)?node.getAttribute(key):fallback;
const num=(node,key,fallback=0)=>Number(attr(node,key,fallback));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const pathFrom=(part,target)=>{
  const parts=(target.startsWith('/')?target.slice(1):part.slice(0,part.lastIndexOf('/')+1)+target).split('/'),out=[];
  for(const p of parts){if(p==='..'){if(!out.length)throw Error('模板关系路径无效');out.pop();}else if(p&&p!=='.')out.push(p);}
  return out.join('/');
};

export async function templateSlidePreview(zip,slidePath,width,height){
  const warnings=new Set(),docs=new Map();
  const warn=text=>warnings.add(text);
  async function documentAt(path){if(!docs.has(path)){const file=zip.file(path);if(!file)return null;const doc=new DOMParser().parseFromString(await file.async('string'),'application/xml');if(doc.querySelector('parsererror'))throw Error('底稿 XML 无法解析');docs.set(path,doc);}return docs.get(path);}
  async function part(path){if(!path)return null;const doc=await documentAt(path);if(!doc)return null;const rels=await documentAt(path.replace(/([^/]+)$/,'_rels/$1.rels'));
    return {path,doc,rels:[...(rels?.documentElement.children||[])],root:doc.documentElement};}
  const related=async(p,type)=>{const rel=p?.rels.find(r=>attr(r,'Type','').endsWith('/'+type));return rel&&attr(rel,'TargetMode')!=='External'?part(pathFrom(p.path,attr(rel,'Target',''))):null;};
  const slide=await part(slidePath);if(!slide)throw Error('未找到所选模板页');
  const layout=await related(slide,'slideLayout'),master=await related(layout,'slideMaster'),theme=await related(master,'theme');
  const scheme=descendant(theme?.doc,'clrScheme'),colorMap={bg1:'lt1',bg2:'lt2',tx1:'dk1',tx2:'dk2'};
  for(const p of [master,layout,slide]){const map=child(p?.root,'clrMap')||descendant(p?.root,'overrideClrMapping');for(const a of [...(map?.attributes||[])])colorMap[a.name]=a.value;}
  function color(node,fallback='#000000',seen=new Set()){
    if(!node)return fallback;
    let hex;
    if(node.localName==='srgbClr')hex=attr(node,'val');
    else if(node.localName==='sysClr')hex=attr(node,'lastClr');
    else if(node.localName==='schemeClr'){
      const name=attr(node,'val'),key=colorMap[name]||name;
      if(key==='phClr')return fallback;
      if(seen.has(key))return fallback;seen.add(key);
      const slot=child(scheme,key);const resolved=color(slot?.firstElementChild,fallback,seen);
      hex=/^#[0-9a-f]{6}$/i.test(resolved)?resolved.slice(1):null;
    }
    if(!/^[0-9a-f]{6}$/i.test(hex||'')){warn('部分主题颜色未能还原');return fallback;}
    let rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
    for(const modifier of [...node.children]){const value=num(modifier,'val',100000)/100000;
      if(modifier.localName==='tint')rgb=rgb.map(c=>c+(255-c)*value);
      else if(modifier.localName==='shade'||modifier.localName==='lumMod')rgb=rgb.map(c=>c*value);
      else if(modifier.localName==='lumOff')rgb=rgb.map(c=>c+255*value);
      else if(modifier.localName!=='alpha')warn('部分颜色变换为近似显示');
    }
    const alpha=child(node,'alpha');
    return alpha?`rgba(${rgb.map(c=>Math.round(Math.max(0,Math.min(255,c)))).join(',')},${num(alpha,'val',100000)/100000})`:'#'+rgb.map(c=>Math.round(Math.max(0,Math.min(255,c))).toString(16).padStart(2,'0')).join('');
  }
  async function imageData(p,blip){
    const id=blip?.getAttributeNS(R,'embed'),rel=p?.rels.find(r=>attr(r,'Id')===id);
    if(!rel||attr(rel,'TargetMode')==='External'){warn('外部链接图片未载入');return null;}
    const name=pathFrom(p.path,attr(rel,'Target','')),file=zip.file(name),ext=name.split('.').pop().toLowerCase();
    const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp'}[ext];
    if(!file||!mime){warn('部分图片格式无法在网页显示');return null;}
    return `data:${mime};base64,${await file.async('base64')}`;
  }
  const definitions=[];
  async function fill(owner,p,fallback='none'){
    if(child(owner,'noFill'))return 'none';
    const solid=child(owner,'solidFill');if(solid)return color(solid.firstElementChild);
    const grad=child(owner,'gradFill');
    if(grad){const linear=child(grad,'lin');if(!linear){warn('部分渐变填充为近似显示');return color(descendant(grad,'gs')?.firstElementChild,fallback);}
      const angle=num(linear,'ang')/60000*Math.PI/180,dx=Math.cos(angle)/2,dy=Math.sin(angle)/2,id='gradient'+definitions.length;
      definitions.push(`<linearGradient id="${id}" x1="${.5-dx}" y1="${.5-dy}" x2="${.5+dx}" y2="${.5+dy}">${children(child(grad,'gsLst'),'gs').map(s=>`<stop offset="${num(s,'pos')/100000}" stop-color="${esc(color(s.firstElementChild))}"/>`).join('')}</linearGradient>`);return `url(#${id})`;
    }
    if(child(owner,'pattFill'))warn('图案填充暂未还原');
    return fallback;
  }
  function transform(xfrm){
    const off=child(xfrm,'off'),ext=child(xfrm,'ext'),x=num(off,'x'),y=num(off,'y'),w=num(ext,'cx'),h=num(ext,'cy'),rotate=num(xfrm,'rot')/60000;
    return {x,y,w,h,svg:`translate(${x+w/2} ${y+h/2}) rotate(${rotate}) scale(${attr(xfrm,'flipH')==='1'?-1:1} ${attr(xfrm,'flipV')==='1'?-1:1}) translate(${-w/2} ${-h/2})`};
  }
  function placeholderShape(shape,p){const ph=descendant(shape,'ph');if(!ph)return null;return [...(descendant(p?.root,'spTree')?.children||[])].find(s=>{const candidate=descendant(s,'ph');return candidate&&attr(candidate,'idx','0')===attr(ph,'idx','0')&&attr(candidate,'type','obj')===attr(ph,'type','obj');});}
  function text(shape,w,h,inherited){
    const body=child(shape,'txBody');if(!body)return '';
    if(descendant(shape,'oMath'))warn('底稿内的 Office 公式需在办公软件核对');
    const props=child(body,'bodyPr'),left=num(props,'lIns',91440),right=num(props,'rIns',91440),top=num(props,'tIns',45720),bottom=num(props,'bIns',45720);
    if(attr(props,'vert','horz')!=='horz')warn('竖排文字暂按横排显示');
    const paragraphs=children(body,'p').map(par=>{
      const pp=child(par,'pPr'),def=child(pp,'defRPr')||descendant(child(inherited,'txBody'),'defRPr')||child(par,'endParaRPr');
      const runs=[...par.children].filter(n=>['r','fld','br'].includes(n.localName));
      const items=runs.map(run=>{const rp=child(run,'rPr')||def,size=num(rp,'sz',num(def,'sz',1800))*127;
        const face=attr(child(rp,'latin'),'typeface',attr(child(def,'latin'),'typeface','Arial'));
        return {value:run.localName==='br'?'\n':child(run,'t')?.textContent||'',size,fill:color(child(rp,'solidFill')?.firstElementChild,color(child(def,'solidFill')?.firstElementChild)),font:face.startsWith('+')?'Arial':face,bold:attr(rp,'b')==='1',italic:attr(rp,'i')==='1'};});
      const size=Math.max(1,...items.map(r=>r.size)),height=size*1.2;
      if(items.some(r=>r.value.includes('\n'))||descendant(pp,'buChar'))warn('复杂段落的换行与项目符号需核对');
      return {items,height,size,align:attr(pp,'algn','l')};
    });
    const height=paragraphs.reduce((sum,p)=>sum+p.height,0),anchor=attr(props,'anchor','t');let y=top+(anchor==='ctr'?(h-top-bottom-height)/2:anchor==='b'?h-top-bottom-height:0);
    return paragraphs.map(par=>{const x=par.align==='ctr'?left+(w-left-right)/2:par.align==='r'?w-right:left;const result=`<text x="${x}" y="${y+par.size}" text-anchor="${par.align==='ctr'?'middle':par.align==='r'?'end':'start'}" xml:space="preserve">${par.items.map(r=>`<tspan font-family="${esc(r.font)}" font-size="${r.size}" font-weight="${r.bold?'bold':'normal'}" font-style="${r.italic?'italic':'normal'}" fill="${esc(r.fill)}">${esc(r.value)}</tspan>`).join('')}</text>`;y+=par.height;return result;}).join('');
  }
  async function shapes(p,inherited=false){let out='';const tree=descendant(p?.root,'spTree');if(!tree)return out;
    for(const shape of [...tree.children]){
      if(['nvGrpSpPr','grpSpPr','extLst'].includes(shape.localName))continue;
      if(inherited&&descendant(shape,'ph'))continue;
      if(!['sp','cxnSp','pic'].includes(shape.localName)){warn('组合、图表或其他复杂底稿对象暂未还原');continue;}
      const ancestor=placeholderShape(shape,layout)||placeholderShape(shape,master),props=child(shape,'spPr'),xfrm=child(props,'xfrm')||child(child(ancestor,'spPr'),'xfrm');
      if(!xfrm){warn('部分继承位置未能还原');continue;}
      const box=transform(xfrm);let inside='';
      if(shape.localName==='pic'){
        const image=child(shape,'blipFill'),data=await imageData(p,child(image,'blip'));
        if(data){const crop=child(image,'srcRect'),l=num(crop,'l')/100000,r=num(crop,'r')/100000,t=num(crop,'t')/100000,b=num(crop,'b')/100000;
          if(l+r>=1||t+b>=1){warn('图片裁剪范围无效');continue;}
          const iw=box.w/(1-l-r),ih=box.h/(1-t-b),id='clip'+definitions.length;
          definitions.push(`<clipPath id="${id}"><rect width="${box.w}" height="${box.h}"/></clipPath>`);
          inside=`<image href="${esc(data)}" x="${-l*iw}" y="${-t*ih}" width="${iw}" height="${ih}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
        }
      }else{
        const geometry=child(props,'prstGeom'),kind=attr(geometry,'prst','rect'),line=child(props,'ln'),stroke=child(line,'noFill')?'none':color(child(line,'solidFill')?.firstElementChild,'none'),strokeWidth=num(line,'w',12700),background=await fill(props,p),style=`fill="${esc(background)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}"`;
        if(child(shape,'style'))warn('部分主题形状样式需在办公软件核对');
        if(descendant(props,'effectLst')?.children.length)warn('阴影等效果暂未还原');
        if(child(props,'custGeom'))warn('自定义形状暂未还原');
        else if(kind==='line')inside=`<line x1="0" y1="0" x2="${box.w}" y2="${box.h}" ${style}/>`;
        else if(kind==='rect'||kind==='roundRect')inside=`<rect width="${box.w}" height="${box.h}" rx="${kind==='roundRect'?Math.min(box.w,box.h)*.1:0}" ${style}/>`;
        else if(kind==='ellipse')inside=`<ellipse cx="${box.w/2}" cy="${box.h/2}" rx="${box.w/2}" ry="${box.h/2}" ${style}/>`;
        else warn('部分形状暂未还原');
        inside+=text(shape,box.w,box.h,ancestor);
      }
      out+=`<g transform="${box.svg}">${inside}</g>`;
    }
    return out;
  }
  let background='#ffffff',backgroundImage='';
  for(const p of [slide,layout,master]){
    const bg=child(child(p?.root,'cSld'),'bg');if(!bg)continue;
    let props=child(bg,'bgPr');const ref=child(bg,'bgRef');
    if(!props&&ref){const index=num(ref,'idx');
      // Theme background references can use more than solid fills.
      const fills=descendant(theme?.doc,'bgFillStyleLst')?.children;const selected=fills?.[index-1001];
      if(selected?.localName==='solidFill'){background=color(selected.firstElementChild,color(ref.firstElementChild,'#ffffff'));break;}
      background=color(ref.firstElementChild,'#ffffff');warn('部分主题背景为近似显示');break;
    }
    background=await fill(props,p,'#ffffff');const image=child(props,'blipFill');
    if(image){const data=await imageData(p,child(image,'blip'));if(data)backgroundImage=`<image href="${esc(data)}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;}
    break;
  }
  let content='';if(attr(slide.root,'showMasterSp','1')!=='0'){
    if(attr(layout?.root,'showMasterSp','1')!=='0')content+=await shapes(master,true);
    content+=await shapes(layout,true);
  }
  content+=await shapes(slide);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${960*height/width}" viewBox="0 0 ${width} ${height}"><defs>${definitions.join('')}</defs><rect width="${width}" height="${height}" fill="${esc(background)}"/>${backgroundImage}${content}</svg>`,warnings:[...warnings],slidePath,background};
}

export async function drawTemplatePreview(ctx,template,index,width,height){
  template.previewCache??=new Map();
  if(!template.previewCache.has(index))template.previewCache.set(index,(async()=>templateSlidePreview(template.zip||await JSZip.loadAsync(template.buffer),template.slides[index],template.width,template.height))());
  let preview;try{preview=await template.previewCache.get(index);}catch(error){template.previewCache.delete(index);throw error;}
  const url=URL.createObjectURL(new Blob([preview.svg],{type:'image/svg+xml'})),image=new Image();
  try{image.src=url;await image.decode();ctx.drawImage(image,0,0,width,height);}finally{URL.revokeObjectURL(url);}
  return preview;
}
