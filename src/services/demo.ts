import type {Snapshot,ClientInput,SiteInput,ItemInput,ComponentInput,InstallationInput,RmaInput} from '../lib/types';
import {seedData} from './seed';
import {today,parseDay} from '../lib/warranty';
const KEY='solara-demo-v1';
export const emptyData:Snapshot={clients:[],installations:[],inventory_items:[],inventory_units:[],site_components:[],component_events:[],notification_reads:[]};
const id=()=>crypto.randomUUID();
export function upgradeDemo(input:Snapshot):Snapshot {
 const data=structuredClone(input);data.notification_reads??=[];data.component_events??=[];
 data.inventory_items.forEach(i=>{i.is_serialized??=true;i.default_warranty_months??=i.item_type==='Solar Panel'?300:60;});
 data.inventory_units.forEach(u=>{u.state??=data.site_components.some(c=>c.serial_number===u.serial_number)?'Deployed':'Available';});
 data.site_components.forEach(c=>{c.status??='Installed';c.replaced_by_component_id??=null;c.inventory_unit_id??=data.inventory_units.find(u=>u.serial_number===c.serial_number&&u.inventory_item_id===c.inventory_item_id)?.id||'';c.created_at??=c.installed_date+'T00:00:00Z';if(!data.component_events.some(e=>e.component_id===c.id))data.component_events.push({id:id(),component_id:c.id,event_type:'Assigned',replacement_component_id:null,reason:'Existing assignment retained during upgrade',created_at:c.created_at});});
 return data;
}
export function readDemo():Snapshot {const raw=localStorage.getItem(KEY);if(raw){let data;try{data=JSON.parse(raw);}catch{throw new Error('The demo data could not be read. Open Settings to reset the demo.');}if(['clients','installations','inventory_items','inventory_units','site_components'].every(k=>Array.isArray(data[k]))){const upgraded=upgradeDemo(data);if(JSON.stringify(upgraded)!==raw)localStorage.setItem(KEY,JSON.stringify(upgraded));return upgraded;}throw new Error('The demo data could not be read.');}const data=seedData();localStorage.setItem(KEY,JSON.stringify(data));return data;}
function write(action:(data:Snapshot)=>unknown) {const data=structuredClone(readDemo());const result=action(data);data.inventory_items.forEach(item=>{item.total_stock=data.inventory_units.filter(u=>u.inventory_item_id===item.id&&u.state==='Available').length;});localStorage.setItem(KEY,JSON.stringify(data));return result;}
function validClient(input:ClientInput){if(!input.name.trim())throw new Error('Client name is required.');}
function addComponents(data:Snapshot,siteId:string,components:ComponentInput[]) {
 if(!data.installations.some(s=>s.id===siteId))throw new Error('Installation not found.');const added:string[]=[];
 for(const input of components){
  const item=data.inventory_items.find(i=>i.id===input.inventory_item_id);if(!item)throw new Error('Product not found.');
  const serial=input.serial_number?.trim().toUpperCase()||null;const quantity=input.quantity??1;
  if(item.is_serialized&&!serial)throw new Error('A unique serial number is required for this product.');
  if(!Number.isInteger(quantity)||quantity<1||quantity>1000||serial&&quantity!==1)throw new Error('Enter a valid quantity. A serial number identifies exactly one unit.');
  if(!Number.isInteger(input.warranty_months)||input.warranty_months<0||input.warranty_months>1200)throw new Error('Warranty must be between 0 and 1200 months.');
  parseDay(input.installed_date);
  for(let n=0;n<quantity;n++){
   const unit=data.inventory_units.find(u=>u.inventory_item_id===item.id&&u.state==='Available'&&(!serial||u.serial_number===serial));
   if(!unit)throw new Error('No available stock matches this product and serial.');
   unit.state='Deployed';const key=id(),created_at=new Date().toISOString();added.push(key);
   data.site_components.push({id:key,installation_id:siteId,inventory_item_id:item.id,inventory_unit_id:unit.id,serial_number:unit.serial_number,warranty_months:input.warranty_months,installed_date:input.installed_date,status:'Installed',replaced_by_component_id:null,created_at});
   data.component_events.unshift({id:id(),component_id:key,event_type:'Assigned',replacement_component_id:null,reason:'Assigned from warehouse stock',created_at});
  }
 }return added;
}
export const demoApi={
 async load(){return readDemo();},
 async addClient(input:ClientInput){return write(data=>{validClient(input);const key=id();data.clients.unshift({...input,id:key,created_at:new Date().toISOString()});return key;});},
 async updateClient(key:string,input:ClientInput){write(data=>{validClient(input);const client=data.clients.find(x=>x.id===key);if(!client)throw new Error('Client not found.');Object.assign(client,input);});},
 async registerSite(input:SiteInput){return write(data=>{
  let clientId=input.client_id;if(!clientId&&input.client){validClient(input.client);clientId=id();data.clients.unshift({...input.client,id:clientId,created_at:new Date().toISOString()});}
  if(!data.clients.some(x=>x.id===clientId))throw new Error('Choose a client.');if(!input.installation.site_name.trim())throw new Error('Site name is required.');parseDay(input.installation.commissioning_date);
  const key=id();data.installations.unshift({...input.installation,id:key,client_id:clientId!,created_at:new Date().toISOString()});addComponents(data,key,input.components);return key;
 });},
 async updateSite(key:string,input:Partial<InstallationInput>){write(data=>{const site=data.installations.find(x=>x.id===key);if(!site)throw new Error('Site not found.');Object.assign(site,input);});},
 async receiveStock(itemId:string|undefined,input:ItemInput|undefined,serials:string[],quantity=0){return write(data=>{
  let item=data.inventory_items.find(x=>x.id===itemId);
  if(!itemId&&input){if(!input.brand.trim()||input.default_warranty_months<0||input.default_warranty_months>1200)throw new Error('Enter valid product details.');item={...input,id:id(),total_stock:0};data.inventory_items.push(item);}
  if(!item)throw new Error('Choose a product.');const count=serials.length||quantity;
  if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Receive between 1 and 10,000 units.');
  if(item.is_serialized&&serials.length!==count)throw new Error('Every serialized unit needs a unique serial number.');
  for(let i=0;i<count;i++){const serial=serials[i]?.trim().toUpperCase()||null;if(item.is_serialized&&!serial)throw new Error('Serial number is required.');if(serial&&data.inventory_units.some(u=>u.serial_number===serial))throw new Error(`${serial} is already registered.`);data.inventory_units.push({id:id(),inventory_item_id:item.id,serial_number:serial,received_date:today(),state:'Available'});}return item.id;
 });},
 async assignComponents(siteId:string,components:ComponentInput[]){write(data=>addComponents(data,siteId,components));},
 async processRma(input:RmaInput){return write(data=>{
  const old=data.site_components.find(c=>c.id===input.component_id);if(!old)throw new Error('Component not found.');if(!input.reason.trim()||input.reason.length>2000)throw new Error('Add a fault or replacement note (1–2000 characters).');if(old.status==='Replaced')throw new Error('This component already has a replacement.');if(old.status==='Returned_Faulty'&&!input.replacement)throw new Error('This component is already marked faulty.');
  if(old.status==='Installed'){old.status='Returned_Faulty';data.inventory_units.find(u=>u.id===old.inventory_unit_id)!.state='Faulty';data.component_events.unshift({id:id(),component_id:old.id,event_type:'Returned_Faulty',replacement_component_id:null,reason:input.reason.trim(),created_at:new Date().toISOString()});}
  if(input.replacement){const item=data.inventory_items.find(i=>i.id===input.replacement!.inventory_item_id);const original=data.inventory_items.find(i=>i.id===old.inventory_item_id);if(!item||item.item_type!==original?.item_type)throw new Error('Choose a replacement of the same hardware type.');if((input.replacement.quantity??1)!==1)throw new Error('Choose exactly one replacement unit.');const [key]=addComponents(data,old.installation_id,[input.replacement]);old.status='Replaced';old.replaced_by_component_id=key;data.component_events.unshift({id:id(),component_id:old.id,event_type:'Replaced',replacement_component_id:key,reason:input.reason.trim(),created_at:new Date().toISOString()});}return old.id;
 });},
 async markNotificationsRead(keys:string[]){write(data=>{for(const key of keys){const r=data.notification_reads.find(n=>n.notification_key===key);if(r)r.read_at=new Date().toISOString();else data.notification_reads.push({notification_key:key,read_at:new Date().toISOString()});}});},
 reset(){localStorage.setItem(KEY,JSON.stringify(seedData()));}
};
