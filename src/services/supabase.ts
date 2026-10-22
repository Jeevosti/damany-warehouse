/// <reference types="vite/client" />
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
export interface Connection {url:string;key:string}
// Deployment configuration is supplied through Netlify/Vite, never a browser form.
export function storedConnection():Connection|null {
 const url=import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/,''),key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
 return url&&key?{url,key}:null;
}
export function validateConnection(config:Connection){
 if(!config||typeof config.url!=='string'||typeof config.key!=='string')throw new Error('The company connection has not been configured. Contact your administrator.');
 let url:URL;try{url=new URL(config.url);}catch{throw new Error('Enter a valid Supabase project URL.');}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use an HTTPS project URL.');
 if(config.key.startsWith('sb_secret_'))throw new Error('Use a public publishable key, never a secret key.');
 if(config.key.startsWith('eyJ')){try{const payload=JSON.parse(atob(config.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw new Error();}catch{throw new Error('Use an anon or publishable key, never a service-role key.');}}
 else if(!config.key.startsWith('sb_publishable_'))throw new Error('Use a Supabase publishable or legacy anon key.');
}
let cached:SupabaseClient|null=null;let fingerprint='';
export function clearStoredAuth(){
 const config=storedConnection();if(!config)return;
 const key=`sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`;
 for(const suffix of ['', '-code-verifier', '-user']){try{localStorage.removeItem(key+suffix);}catch{/* The auth gate is already locked. */}}
}
export function supabase(){const config=storedConnection();if(!config)return null;const next=JSON.stringify(config);if(!cached||fingerprint!==next){validateConnection(config);cached=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});fingerprint=next;}return cached;}
