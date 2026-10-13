import type { Snapshot, InstallationStatus } from '../lib/types';
import { today, parseDay } from '../lib/warranty';
export function seedData(): Snapshot {
 const now=today();
 const ago=(months:number,days=0)=>{const d=parseDay(now); d.setUTCDate(12); d.setUTCMonth(d.getUTCMonth()-months);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
 const names=['Wanjiru Mwangi','Acacia Ridge Lodge','David Ochieng','Greenfield Academy','Grace Wambui','Tamarind Farm','Peter Kamau','Coastal Haven Hotel','Muthoni Njeri','Rift Valley Clinic','James Otieno','Olive Grove Estate'];
 const locations=['Karen, Nairobi','Nanyuki, Laikipia','Kisumu Central','Ruiru, Kiambu','Lavington, Nairobi','Naivasha, Nakuru','Thika, Kiambu','Diani, Kwale','Nyeri Town','Nakuru Town','Westlands, Nairobi','Kitengela, Kajiado'];
 const data:Snapshot={clients:[],installations:[],inventory_items:[],inventory_units:[],site_components:[],component_events:[],notification_reads:[]};
 names.forEach((name,i)=>data.clients.push({id:`client-${i}`,name,phone:`+254 700 ${String(i+1).padStart(3,'0')} 000`,email:`contact${i+1}@example.com`,location_address:locations[i],gps_coordinates:'',created_at:ago(i%6)+'T09:00:00Z'}));
 const products=[['Inverter','Deye','SUN-8K-SG04LP3',185000,7],['Battery','Deye','SE-G5.1 Pro · 5.12 kWh',135000,12],['Solar Panel','Jinko','Tiger Neo · 550 W',13500,28],['Inverter','SRNE','HFP4850S80 · 5 kW',85000,3],['Battery','MUST','LP16-48100 · 4.8 kWh',95000,4],['Water Heater','Helly Solar','200L evacuated tube',78000,2],['Solar Panel','Longi','Hi-MO 6 · 580 W',14500,18],['Inverter','MUST','PV1800 · 3 kW',45000,6]] as const;
 products.forEach((p,i)=>data.inventory_items.push({id:`item-${i}`,item_type:p[0],brand:p[1],model:p[2],unit_price:p[3],total_stock:0,low_stock_threshold:5,is_serialized:true,default_warranty_months:p[0]==='Solar Panel'?300:60}));
 const system=['Hybrid','Off-Grid','Grid-Tied','Solar Water Heating'];
 const monthsAgo=[0,1,2,3,4,5,11,23,59,60,61,8];
 const statuses:InstallationStatus[]=['Active','Active','Active','Commissioning','Active','Active','Active','Pending Maintenance','Active','Pending Maintenance','Inactive','Active'];
 names.forEach((_,i)=>{
   const date=ago(monthsAgo[i], i===7?14:i===8?22:0);
   data.installations.push({id:`site-${i}`,client_id:`client-${i}`,site_name:['Karen residence','Acacia guest cottages','Ochieng family home','Greenfield science block','Lavington residence','Tamarind irrigation','Thika residence','Coastal Haven north wing','Nyeri residence','Rift Valley outpatient','Westlands apartment','Olive Grove clubhouse'][i],system_type:system[i%4],commissioning_date:date,status:statuses[i],notes:'Commissioned and tested. Inspection documentation held with the site team.',capacity_kw:[8,20,5,0,10,15,5,0,8,12,3,10][i],created_at:date+'T08:30:00Z'});
   const items=i%4===3?[5]:[i%2===0?0:3,1,2];
   items.forEach((item,j)=>{
     const serial=`${products[item][1].toUpperCase().replace(/\s/g,'')}-${String(10000+i*10+j)}`;
     data.inventory_units.push({id:`unit-dep-${i}-${j}`,inventory_item_id:`item-${item}`,serial_number:serial,received_date:date,state:'Deployed'});
     data.site_components.push({id:`component-${i}-${j}`,installation_id:`site-${i}`,inventory_item_id:`item-${item}`,serial_number:serial,inventory_unit_id:`unit-dep-${i}-${j}`,status:'Installed',replaced_by_component_id:null,created_at:date+'T08:30:00Z',warranty_months:i===6?12:i===7?24:item===2?120:60,installed_date:date});
   });
 });
 products.forEach((p,i)=>{for(let n=0;n<p[4];n++)data.inventory_units.push({id:`unit-stock-${i}-${n}`,inventory_item_id:`item-${i}`,serial_number:`${p[1].toUpperCase().replace(/\s/g,'')}-WH-${i}${String(n+1).padStart(4,'0')}`,received_date:ago(0),state:'Available'});data.inventory_items[i].total_stock=p[4];});
 data.inventory_items.push({id:'item-8',item_type:'Mounting Kit',brand:'Universal',model:'Roof mounting kit',unit_price:5500,total_stock:16,low_stock_threshold:5,is_serialized:false,default_warranty_months:24});
 for(let n=0;n<16;n++)data.inventory_units.push({id:`bulk-unit-${n}`,inventory_item_id:'item-8',serial_number:null,received_date:ago(0),state:'Available'});
 data.site_components.forEach(c=>data.component_events.push({id:`event-${c.id}`,component_id:c.id,event_type:'Assigned',replacement_component_id:null,reason:'Commissioned with the site',created_at:c.created_at}));
 return data;
}
