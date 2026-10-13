import type {ClientInput,SiteInput,ItemInput,ComponentInput,InstallationInput,Snapshot,RmaInput} from '../lib/types';
import {supabase} from './supabase';
import {demoApi} from './demo';
async function unwrap<T>(query:PromiseLike<{data:T;error:unknown}>):Promise<T>{const {data,error}=await query;if(error)throw error;return data;}
export const liveApi={
 async load():Promise<Snapshot>{return await unwrap(supabase()!.rpc('get_workspace')) as Snapshot;},
 async addClient(input:ClientInput){return unwrap(supabase()!.from('clients').insert(input).select('id').single());},
 async updateClient(id:string,input:ClientInput){return unwrap(supabase()!.from('clients').update(input).eq('id',id).select('id').single());},
 async registerSite(input:SiteInput){return unwrap(supabase()!.rpc('register_site',{p_client_id:input.client_id??null,p_client:input.client??null,p_installation:input.installation,p_components:input.components}));},
 async updateSite(id:string,input:Partial<InstallationInput>){return unwrap(supabase()!.from('installations').update(input).eq('id',id).select('id').single());},
 async receiveStock(itemId:string|undefined,item:ItemInput|undefined,serials:string[],quantity=0){return unwrap(supabase()!.rpc('receive_stock',{p_item_id:itemId??null,p_item:item??null,p_serials:serials,p_quantity:quantity}));},
 async assignComponents(siteId:string,components:ComponentInput[]){return unwrap(supabase()!.rpc('assign_components',{p_installation_id:siteId,p_components:components}));},
 async processRma(input:RmaInput){return unwrap(supabase()!.rpc('process_rma',{p_component_id:input.component_id,p_reason:input.reason,p_replacement:input.replacement??null}));},
 async markNotificationsRead(keys:string[]){return unwrap(supabase()!.rpc('mark_notifications_read',{p_keys:keys}));},
};
export function api(mode:'demo'|'live'){return mode==='demo'?demoApi:liveApi;}
export function errorMessage(error:unknown){const e=error as {message?:string;code?:string};if(e?.code==='23505')return 'This serial number is already registered or assigned. Refresh and choose another unit.';if(e?.code==='23503')return 'The selected record is no longer available. Refresh and try again.';if(e?.code==='42501')return 'Access denied. Check your sign-in and the database migration.';if(e?.code==='PGRST202')return 'The database is not set up yet. Run the included migration in Supabase SQL Editor.';return e?.message||'Something went wrong. Please try again.';}
