import type { Region,AnalysisResult } from '../analysis/types';
// The PDF writer is the dependency-free, test-covered implementation inherited from AetherEye v2.
import { PDFPage, buildPDF, wrap } from './pdf.js';
export const IMAGE_W=480,IMAGE_H=320;
export type Study = {location:string;beforeDate:string;afterDate:string;gsd:number|null;demo:boolean;originalW:number;originalH:number};
function deliver(blob:Blob,name:string){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}
export function calibratedArea(pixels:number,study:Study){if(!study.gsd)return null;const sx=study.originalW/IMAGE_W,sy=study.originalH/IMAGE_H;return pixels*sx*sy*study.gsd*study.gsd}
export function areaLabel(pixels:number,study:Study){const m=calibratedArea(pixels,study);return m===null?'Not calibrated':m>=10000?`${(m/10000).toFixed(2)} ha`:`${Math.round(m).toLocaleString()} m²`}
export function generateOverlay(result:AnalysisResult,mode:'regions'|'heat'|'both'|'none',selected:number|null){const c=document.createElement('canvas');c.width=IMAGE_W;c.height=IMAGE_H;const ctx=c.getContext('2d')!;const img=ctx.createImageData(IMAGE_W,IMAGE_H);
 const colorById=new Map<number,string>(result.regions.map(r=>[r.id,r.color]));
 for(let p=0;p<result.labels.length;p++){
  const k=p*4,id=result.labels[p],signal=result.heat[p];let r=0,g=0,b=0,a=0;
  if((mode==='heat'||mode==='both')&&signal>46){r=255;g=Math.min(245,Math.max(32,210-signal*.44));b=66;a=Math.min(148,(signal-30)*.9)}
  if((mode==='regions'||mode==='both')&&id){const h=colorById.get(id)||'#ff7474';r=parseInt(h.slice(1,3),16);g=parseInt(h.slice(3,5),16);b=parseInt(h.slice(5,7),16);a=(selected===null||selected===id)?174:46;}
  img.data[k]=r;img.data[k+1]=g;img.data[k+2]=b;img.data[k+3]=a;
 }
 ctx.putImageData(img,0,0);return c.toDataURL('image/png');
}
async function image(url:string){const i=new Image();i.crossOrigin='anonymous';i.src=url;await i.decode();return i}
export async function annotatedCanvas(after:string,result:AnalysisResult,study:Study){const img=await image(after);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d')!;
 ctx.drawImage(img,0,0,1200,800);const overlay=await image(generateOverlay(result,'regions',null));ctx.drawImage(overlay,0,0,1200,800);
 result.regions.forEach(r=>{const x=r.minX/IMAGE_W*1200,y=r.minY/IMAGE_H*800,w=(r.maxX-r.minX)/IMAGE_W*1200,h=(r.maxY-r.minY)/IMAGE_H*800;ctx.strokeStyle=r.color;ctx.lineWidth=2.5;ctx.strokeRect(x,y,w,h);ctx.fillStyle=r.color;ctx.fillRect(x,Math.max(y-26,0),90,26);ctx.fillStyle='#061321';ctx.font='bold 15px monospace';ctx.fillText(`ZONE ${String(r.rank).padStart(2,'0')}`,x+6,Math.max(y-26,0)+18)});
 ctx.fillStyle='rgba(2,13,25,.88)';ctx.fillRect(0,0,1200,42);ctx.fillStyle='#75efff';ctx.font='bold 22px sans-serif';ctx.fillText('AETHEREYE  /  CHANGE INTELLIGENCE',23,29);ctx.fillStyle='#d6edfc';ctx.font='15px monospace';ctx.fillText(study.location,770,28);
 ctx.fillStyle='rgba(2,13,25,.88)';ctx.fillRect(0,756,1200,44);ctx.fillStyle='#e5f4fa';ctx.font='15px monospace';ctx.fillText(`BASELINE ${study.beforeDate}   →   CURRENT ${study.afterDate}  |  ${study.demo?'SYNTHETIC DEMO':'USER-SUPPLIED RGB'}`,18,784);return canvas;
}
export async function exportPNG(after:string,result:AnalysisResult,study:Study){const c=await annotatedCanvas(after,result,study);await new Promise<void>(resolve=>c.toBlob(b=>{if(b)deliver(b,'aethereye-annotated.png');resolve()},'image/png'))}
export function exportJSON(result:AnalysisResult,study:Study){const payload={tool:'AetherEye 3.0',generated:new Date().toISOString(),study,method:'classical RGB heuristics / screening only',regions:result.regions,stats:{...result.stats,hist:[...result.stats.hist]},disclaimer:'Candidate changes only; verification required.'};deliver(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'aethereye-intelligence.json')}
export function exportCSV(result:AnalysisResult,study:Study){const q=(v:string|number)=>`"${String(v).replaceAll('"','""')}"`;const rows=[['Rank','Type','Group','Signal (relative)','Pixels','Area','Transition','Evidence'],...result.regions.map(r=>[r.rank,r.type,r.group,r.strength,r.count,areaLabel(r.count,study),r.transition,r.reason])];deliver(new Blob([rows.map(row=>row.map(x=>q(x)).join(',')).join('\r\n')],{type:'text/csv'}),'aethereye-regions.csv')}
export async function exportPDF(after:string,result:AnalysisResult,study:Study){const c=await annotatedCanvas(after,result,study);const uri=c.toDataURL('image/jpeg',.83);const bytes=new Uint8Array(await (await fetch(uri)).arrayBuffer());const pages:any[]=[];let p:any=new PDFPage();pages.push(p);
 const header=(first:boolean)=>{p.rect(0,716,612,76,'#061427');p.text(36,759,23,'AETHEREYE',{bold:true,color:'#68e5f7'});p.text(36,737,10,first?'Satellite change screening report':'Intelligence report - continued',{color:'#d2f3fa'});p.text(36,707,9,`${study.location}   ${study.beforeDate} -> ${study.afterDate}`)};header(true);
 p.text(36,685,10,study.demo?'SYNTHETIC DEMO | NOT REAL SATELLITE EVIDENCE':'USER-SUPPLIED RGB IMAGERY',{bold:true,color:'#ba5c29'});
 p.text(36,663,10,`Detected zones: ${result.regions.length}   Affected pixels: ${result.stats.affected.toLocaleString()}   Coverage: ${result.stats.changedPct.toFixed(2)}%`);
 p.text(36,646,10,`Estimated area: ${areaLabel(result.stats.affected,study)}   Method: ${String(result.stats.options.method)}   Threshold: ${result.stats.threshold.toFixed(0)}`);
 p.image('Img',36,281,540,360);p.stroke(36,281,540,360,'#9cbcd1');p.text(36,259,10,'Detected surface changes (annotated image)',{bold:true});
 p.text(36,231,10,'IMPORTANT LIMITATIONS',{bold:true,color:'#aa4b36'});
 let y=213;for(const s of wrap('RGB transition labels are hypotheses, not confirmed disaster causes. No calibrated AI probabilities are used. Clouds, shadows, changed lighting, unregistered imagery and seasons can produce false positives. Georeferencing and independent validation are required.',94)){p.text(36,y,9,s);y-=12}
 for(let i=0;i<result.regions.length;i++){const r=result.regions[i];if(i%7===0){p=new PDFPage();pages.push(p);header(false);y=681;p.text(36,y,12,'DETECTED CHANGE REGIONS',{bold:true,color:'#147994'});y-=29;}
  if(y<95){p=new PDFPage();pages.push(p);header(false);y=677;}
  p.rect(36,y-6,7,28,r.color);p.text(53,y+7,10,`${r.rank}. ${r.type}`,{bold:true});p.text(53,y-6,8,`${r.transition} | ${r.count.toLocaleString()} pixels | ${areaLabel(r.count,study)} | signal ${r.strength}/100`);
  let ly=y-20;for(const line of wrap(r.reason,103).slice(0,2)){p.text(53,ly,8,line);ly-=11;}y-=66;
 }
 if(!result.regions.length){p.text(36,680,10,'No regions met the selected detection criteria.')}
 pages.forEach((pg,index)=>pg.text(36,29,8,`AetherEye  |  page ${index+1} of ${pages.length}`,{color:'#788a99'}));deliver(buildPDF(pages,{Img:{jpeg:bytes,w:1200,h:800}},'AetherEye satellite change screening report'),'aethereye-report.pdf');
}
