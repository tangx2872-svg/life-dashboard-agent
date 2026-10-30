// Minimal, dependency-free Markdown renderer for untrusted AI text.
// Pipeline: Markdown -> escaped text -> allow-listed tags -> sanitize -> innerHTML.
// Raw HTML from the model is always escaped, and the sanitizer only keeps tags we emit.
const MD_HTML={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const mdEscape=s=>String(s??'').replace(/[&<>"']/g,c=>MD_HTML[c]);
const MD_ALLOWED_TAGS=new Set(['H1','H2','H3','H4','H5','H6','P','BR','HR','STRONG','EM','DEL','CODE','PRE','UL','OL','LI','BLOCKQUOTE','TABLE','THEAD','TBODY','TR','TH','TD','A','DIV','SECTION']);
const MD_ALLOWED_ATTRS={A:['href','title','rel','target'],TH:['style','data-label'],TD:['style','data-label'],OL:['start','class'],UL:['class'],LI:['class'],P:['class'],DIV:['class'],SECTION:['class'],CODE:['class']};
const MD_SAFE_CLASS=/^(?:markdown-body|md-table-wrap|week-plan[a-z-]*)$/;
const mdUrl=raw=>{
  const value=String(raw??'').replace(/[\u0000-\u0020\u007f]/g,'');
  if(!value)return '';
  if(/^(?:javascript|data|vbscript|file):/i.test(value))return '';
  if(/^(?:https?:\/\/|mailto:|tel:)/i.test(value))return value;
  if(/^(?:#|\/(?!\/)|\.{1,2}\/)/.test(value))return value;
  return '';
};
function mdSanitize(html){
  if(typeof document==='undefined'||!document.createElement)return String(html??'');
  const template=document.createElement('template');template.innerHTML=String(html??'');
  for(const el of [...template.content.querySelectorAll('*')]){
    if(!el.parentNode)continue;
    if(!MD_ALLOWED_TAGS.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
    const allowed=MD_ALLOWED_ATTRS[el.tagName]||[];
    for(const attr of [...el.attributes]){
      if(!allowed.includes(attr.name)){el.removeAttribute(attr.name);continue}
      if(attr.name==='style'&&!/^text-align:\s*(?:left|right|center)\s*;?$/.test(attr.value))el.removeAttribute('style');
      if(attr.name==='class'&&!String(attr.value).split(/\s+/).every(token=>!token||MD_SAFE_CLASS.test(token)))el.removeAttribute('class');
    }
    if(el.tagName==='A'){
      const href=mdUrl(el.getAttribute('href'));
      if(href)el.setAttribute('href',href);else el.removeAttribute('href');
      el.setAttribute('rel','noopener noreferrer');el.setAttribute('target','_blank');
    }
  }
  return template.innerHTML;
}
function mdInline(text){
  const codes=[];
  let s=mdEscape(text).replace(/`([^`\n]+)`/g,(m,code)=>{codes.push(code);return '\u0001'+(codes.length-1)+'\u0001'});
  s=s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g,'$1');
  s=s.replace(/\[([^\]\n]+)\]\(([^)\n]*)\)/g,(m,label,url)=>{const href=mdUrl(url);return href?`<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`:label});
  s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
  s=s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,(m,lead,body)=>lead+'<em>'+body+'</em>');
  s=s.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
  return s.replace(/\u0001(\d+)\u0001/g,(m,index)=>'<code>'+codes[Number(index)]+'</code>');
}
const mdSplitRow=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());
const mdIsSeparator=line=>{const cells=mdSplitRow(line);return cells.length>0&&cells.every(cell=>/^:?-{2,}:?$/.test(cell))};
const mdAligns=line=>mdSplitRow(line).map(cell=>/^:-+:$/.test(cell)?'center':/-+:$/.test(cell)?'right':/^:-+/.test(cell)?'left':'');
const mdPlain=s=>String(s??'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_~`]/g,'').trim();
const mdStyle=align=>align?` style="text-align:${align}"`:'';
function mdTables(src){
  const lines=String(src??'').replace(/\r\n?/g,'\n').split('\n'),tables=[];
  for(let i=0;i<lines.length-1;i++){
    if(!lines[i].includes('|')||!mdIsSeparator(lines[i+1]))continue;
    const head=mdSplitRow(lines[i]),aligns=mdAligns(lines[i+1]),rows=[];let next=i+2;
    while(next<lines.length&&lines[next].trim()&&lines[next].includes('|'))rows.push(mdSplitRow(lines[next++]));
    tables.push({head,aligns,rows,start:i});i=next-1;
  }
  return tables;
}
function mdTable(t){
  const head=t.head.map((cell,k)=>`<th${mdStyle(t.aligns[k])}>${mdInline(cell)}</th>`).join('');
  const body=t.rows.map(row=>`<tr>${t.head.map((cell,k)=>`<td data-label="${mdEscape(mdPlain(cell))}"${mdStyle(t.aligns[k])}>${mdInline(row[k]??'')}</td>`).join('')}</tr>`).join('');
  return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const MD_BLOCK_START=/^\s*(?:#{1,6}\s|>|```|~~~|[-*+]\s|\d+[.)]\s)/;
function mdBlocks(src){
  const lines=String(src??'').replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue}
    if(/^\s*(```|~~~)/.test(line)){
      const fence=/^\s*(```|~~~)/.exec(line)[1],body=[];i++;
      while(i<lines.length&&!new RegExp('^\\s*'+fence).test(lines[i]))body.push(lines[i++]);
      i++;out.push(`<pre><code>${mdEscape(body.join('\n'))}</code></pre>`);continue;
    }
    const heading=/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if(heading){const level=heading[1].length;out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`);i++;continue}
    if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){out.push('<hr>');i++;continue}
    if(/^\s*>/.test(line)){
      const body=[];
      while(i<lines.length&&/^\s*>/.test(lines[i]))body.push(lines[i++].replace(/^\s*>\s?/,''));
      out.push(`<blockquote>${mdBlocks(body.join('\n'))}</blockquote>`);continue;
    }
    if(line.includes('|')&&i+1<lines.length&&mdIsSeparator(lines[i+1])){
      const table=mdTables(lines.slice(i,i+400).join('\n'))[0];
      if(table){out.push(mdTable(table));i+=2+table.rows.length;continue}
    }
    const unordered=/^\s*[-*+]\s+/.test(line),marker=unordered?/^\s*[-*+]\s+(.*)$/:/^\s*\d+[.)]\s+(.*)$/;
    if(marker.test(line)){
      const items=[];
      while(i<lines.length){const item=marker.exec(lines[i]);if(!item)break;items.push(item[1]);i++}
      out.push(unordered?`<ul>${items.map(item=>`<li>${mdInline(item)}</li>`).join('')}</ul>`:`<ol>${items.map(item=>`<li>${mdInline(item)}</li>`).join('')}</ol>`);
      continue;
    }
    const paragraph=[];
    while(i<lines.length&&lines[i].trim()&&!MD_BLOCK_START.test(lines[i])&&!(lines[i].includes('|')&&i+1<lines.length&&mdIsSeparator(lines[i+1])))paragraph.push(lines[i++]);
    if(paragraph.length)out.push(`<p>${paragraph.map(mdInline).join('<br>')}</p>`);else i++;
  }
  return out.join('\n');
}
function renderMarkdown(src){
  const text=String(src??'').trim();
  if(!text)return '';
  return mdSanitize(mdBlocks(text));
}
// Meta lines such as "以下按当前时间 **2026年10月30日（周五）14:21，Asia/Shanghai**" are not user facing.
const mdMeta=/(?:Asia\/|时区|time\s?zone|按当前时间|当前时间|UTC|GMT)/i;
function mdStripMeta(src){
  const lines=String(src??'').replace(/\r\n?/g,'\n').split('\n');
  let start=0;
  while(start<lines.length){
    const line=lines[start].trim();
    if(!line)break;
    if(/^(?:#{1,6}\s|>|\||[-*+]\s|\d+[.)]\s|```|~~~)/.test(line))break;
    if(!mdMeta.test(line))break;
    start++;
    while(start<lines.length&&!lines[start].trim())start++;
  }
  return lines.slice(start).join('\n').trim();
}
function mdDateParts(cell){
  const text=mdPlain(cell);
  const match=/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日?|\d{1,2}\/\d{1,2})(?:\s*(周[一二三四五六日天]|星期[一二三四五六日天]))?/.exec(text);
  if(!match)return null;
  const raw=match[1].replace(/\s+/g,'');
  let date=raw;
  const month=/^(\d{1,2})月(\d{1,2})日?$/.exec(raw),iso=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw),slash=/^(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if(month)date=`${month[1]} 月 ${month[2]} 日`;
  else if(iso)date=`${Number(iso[2])} 月 ${Number(iso[3])} 日`;
  else if(slash)date=`${slash[1]} 月 ${slash[2]} 日`;
  return {date,weekday:match[2]||'',rest:text.slice(match[0].length).trim()};
}
function mdSplitItems(text){
  return String(text??'').split(/[；;]+/).map(item=>item.trim().replace(/[。．.]+$/,'').trim()).filter(Boolean);
}
// Weekly review: a date column plus a plan column becomes day cards instead of a wide table.
function renderWeeklyPlan(src){
  const text=mdStripMeta(src);
  const table=mdTables(text).find(t=>t.head.length>1&&t.rows.length&&t.rows.every(row=>mdDateParts(row[0])));
  if(!table)return {structured:false,html:''};
  const days=table.rows.map(row=>{
    const parts=mdDateParts(row[0]),rest=row.slice(1).filter(cell=>String(cell??'').trim());
    return {date:parts.date,weekday:parts.weekday,items:rest.length?mdSplitItems(rest.join('；')):[]};
  });
  if(!days.length)return {structured:false,html:''};
  const range=days.length>1?`${days[0].date} — ${days[days.length-1].date}`:days[0].date;
  const rows=days.map(day=>`<li class="week-plan-day"><div class="week-plan-date"><strong>${mdEscape(day.date)}</strong>${day.weekday?`<span>${mdEscape(day.weekday)}</span>`:''}</div>${day.items.length?`<ul class="week-plan-items">${day.items.map(item=>`<li>${mdInline(item)}</li>`).join('')}</ul>`:'<p class="week-plan-empty">留白，按当天状态决定。</p>'}</li>`).join('');
  const summary=`根据你目前的任务，为你整理了接下来 ${days.length} 天的安排。`;
  const lines=text.split('\n');lines.splice(table.start,2+table.rows.length);
  const rest=lines.join('\n').replace(/^[ \t]*#{1,6}[ \t]*未来[^\n]*$/gm,'').trim();
  const extra=rest?`<div class="week-plan-extra markdown-body">${renderMarkdown(rest)}</div>`:'';
  return {structured:true,html:mdSanitize(`<section class="week-plan"><p class="week-plan-summary">${summary}</p><p class="week-plan-range">${mdEscape(range)}</p><ol class="week-plan-days">${rows}</ol></section>${extra}`)};
}
