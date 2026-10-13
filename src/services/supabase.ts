import {createClient} from '@supabase/supabase-js';
import {defaultConnection} from './defaultConnection';
import type {SupabaseClient} from '@supabase/supabase-js';
export interface Connection {url:string;key:string}
const KEY='solara-connection';
export function storedConnection():Connection|null {try{const raw=localStorage.getItem(KEY);if(raw)return JSON.parse(raw);const env=(import.meta as unknown as {env:Record<string,string>}).env;return env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_PUBLISHABLE_KEY?{url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_PUBLISHABLE_KEY}:defaultConnection;}catch{return null;}}
export function validateConnection(config:Connection){
 if(!config||typeof config.url!=='string'||typeof config.key!=='string')throw new Error('The saved connection is incomplete. Open Connection settings and enter your project URL and public key.');
 let url:URL;try{url=new URL(config.url);}catch{throw new Error('Enter a valid Supabase project URL.');}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use an HTTPS project URL.');
 if(config.key.startsWith('sb_secret_'))throw new Error('Use a public publishable key, never a secret key.');
 if(config.key.startsWith('eyJ')){try{const payload=JSON.parse(atob(config.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw new Error();}catch{throw new Error('Use an anon or publishable key, never a service-role key.');}}
 else if(!config.key.startsWith('sb_publishable_'))throw new Error('Use a Supabase publishable or legacy anon key.');
}
let cached:SupabaseClient|null=null;let fingerprint='';
export function supabase(){const config=storedConnection();if(!config)return null;const next=JSON.stringify(config);if(!cached||fingerprint!==next){validateConnection(config);cached=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});fingerprint=next;}return cached;}
export function saveConnection(config:Connection){validateConnection(config);localStorage.setItem(KEY,JSON.stringify(config));cached=null;fingerprint='';}
export function removeConnection(){localStorage.removeItem(KEY);cached=null;fingerprint='';}
export async function checkConnection(config:Connection){validateConnection(config);const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {error}=await client.auth.getSession();if(error)throw error;}
