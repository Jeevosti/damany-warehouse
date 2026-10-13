import type { Snapshot } from './types';
import { warranty, today } from './warranty';
export function assets(data: Snapshot, asOf=today()) {
  return data.site_components.flatMap(component=> {
    const site = data.installations.find(x=>x.id===component.installation_id);
    const item = data.inventory_items.find(x=>x.id===component.inventory_item_id);
    const client = site && data.clients.find(x=>x.id===site.client_id);
    return site && item && client ? [{...component, site, item, client, warranty:warranty(site.commissioning_date,component.warranty_months,asOf)}] : [];
  });
}
export type Asset = ReturnType<typeof assets>[number];
export function metrics(data: Snapshot, asOf=today()) {
  const hardware=assets(data,asOf).filter(x=>x.status==='Installed');
  return { active:data.installations.filter(x=>x.status==='Active').length, clients:data.clients.length,
    low:data.inventory_items.filter(x=>x.total_stock<=x.low_stock_threshold),
    in30:hardware.filter(x=>x.warranty.days>=0&&x.warranty.days<=30),
    in60:hardware.filter(x=>x.warranty.days>=0&&x.warranty.days<=60),
    expired:hardware.filter(x=>x.warranty.days<0), hardware,
    stock:data.inventory_items.reduce((n,x)=>n+x.total_stock,0),
    value:data.inventory_items.reduce((n,x)=>n+x.total_stock*x.unit_price,0),
    capacity:data.installations.filter(x=>x.status==='Active').reduce((n,x)=>n+Number(x.capacity_kw),0)
  };
}
export const matches=(query:string,...values:unknown[])=>!query.trim()||values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
export function toCSV(rows: Record<string,unknown>[]) {
  if(!rows.length)return '';
  const keys=Object.keys(rows[0]);
  const safe=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return [keys.map(safe).join(','),...rows.map(row=>keys.map(k=>safe(row[k])).join(','))].join('\r\n');
}
export function download(filename:string,content:string,type='text/csv;charset=utf-8') { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

export function siteHealth(data:Snapshot,siteId:string,asOf=today()) {
 const current=assets(data,asOf).filter(a=>a.installation_id===siteId&&a.status==='Installed').sort((a,b)=>a.warranty.days-b.warranty.days);
 const faulty=data.site_components.filter(c=>c.installation_id===siteId&&c.status==='Returned_Faulty').length;
 const shortest=current[0];
 return {shortest,faulty,tone:faulty?'red':shortest?.warranty.tone||'neutral',label:faulty?`${faulty} awaiting replacement`:shortest?shortest.warranty.label:'No installed hardware'};
}
