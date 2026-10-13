import type {Snapshot,View} from './types';
import {metrics} from './selectors';
import {today} from './warranty';
export interface Notice {key:string;title:string;description:string;severity:'red'|'amber';category:'Inventory'|'Warranty'|'Maintenance'|'RMA';view:View;filter:string;siteId?:string;read:boolean}
export function notifications(data:Snapshot,asOf=today()):Notice[]{
 const m=metrics(data,asOf);const read=new Set(data.notification_reads.map(x=>x.notification_key));const list:Omit<Notice,'read'>[]=[];
 m.low.forEach(i=>list.push({key:`stock:${i.id}:${i.total_stock}`,title:i.total_stock===0?`${i.brand} ${i.item_type} is out of stock`:`Low stock: ${i.brand} ${i.item_type}`,description:`${i.model} · ${i.total_stock} available; reorder level ${i.low_stock_threshold}.`,severity:i.total_stock===0?'red':'amber',category:'Inventory',view:'inventory',filter:'low'}));
 m.hardware.filter(a=>a.warranty.days<=60).forEach(a=>{const d=a.warranty.days,band=d<0?'expired':d<30?'urgent':'soon';list.push({key:`warranty:${a.id}:${a.warranty.expiry}:${band}`,title:d<0?'Component warranty expired':d===0?'Warranty expires today':`Warranty expires in ${d} days`,description:`${a.client.name} · ${a.item.brand} ${a.item.item_type} · ${a.serial_number||'Non-serialized unit'}`,severity:d<30?'red':'amber',category:'Warranty',view:'warranties',filter:d<0?'expired':d<30?'30':'60',siteId:a.site.id});});
 data.installations.filter(s=>s.status==='Pending Maintenance').forEach(s=>list.push({key:`maintenance:${s.id}:${s.notes.slice(0,80)}`,title:'Site needs maintenance',description:s.site_name,severity:'amber',category:'Maintenance',view:'installations',filter:'Pending Maintenance',siteId:s.id}));
 data.site_components.filter(c=>c.status==='Returned_Faulty').forEach(c=>{const s=data.installations.find(x=>x.id===c.installation_id);const i=data.inventory_items.find(x=>x.id===c.inventory_item_id);list.push({key:`faulty:${c.id}`,title:'Faulty component awaits replacement',description:`${s?.site_name} · ${i?.brand} ${i?.item_type} · ${c.serial_number||'Non-serialized unit'}`,severity:'red',category:'RMA',view:'installations',filter:'all',siteId:s?.id});});
 return list.map(n=>({...n,read:read.has(n.key)})).sort((a,b)=>Number(a.read)-Number(b.read)||(a.severity==='red'?-1:1)-(b.severity==='red'?-1:1)||a.title.localeCompare(b.title));
}
