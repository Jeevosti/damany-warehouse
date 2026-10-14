import {useEffect,useRef} from 'react';
import type {ReactNode,ButtonHTMLAttributes,InputHTMLAttributes,SelectHTMLAttributes,TextareaHTMLAttributes} from 'react';
import {ArrowUpRight,Box,CalendarDays,CheckCircle2,ChevronRight,LoaderCircle,Sun,X,Zap,ShieldCheck,Battery,Flame,Search} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {InstallationStatus} from '../lib/types';
import type {Asset} from '../lib/selectors';
export function Button({children,variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'}){return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;}
export function IconButton({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string}){return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;}
export function Brand({small=false}:{small?:boolean}){return <div className={`brand ${small?'small':''}`}><span className="brand-mark">
  <img
    src="/damany-logo.png"
    alt="Damany logo"
    width={36}
    height={36}
    style={{ objectFit: 'contain' }}
  />
</span><span>DAMANY<span className="brand-dot">.</span><small>WAREHOUSE OPERATIONS</small></span></div>;}
export function Badge({tone='neutral',children,dot=false}:{tone?:string;children:ReactNode;dot?:boolean}){return <span className={`badge badge-${tone}`}>{dot&&<i/>}{children}</span>;}
export function StatusBadge({status}:{status:InstallationStatus}){return <Badge dot tone={status==='Active'?'green':status==='Pending Maintenance'?'amber':status==='Commissioning'?'blue':'neutral'}>{status==='Pending Maintenance'?'Maintenance':status}</Badge>;}
export function WarrantyBadge({asset}:{asset:Asset}){return <Badge tone={asset.warranty.tone}><ShieldCheck size={12}/>{asset.warranty.label}</Badge>;}
export function ItemIcon({type,size=20}:{type:string;size?:number}){const Icon=type==='Battery'?Battery:type==='Solar Panel'?Sun:type==='Water Heater'?Flame:Zap;return <span className={`item-icon item-${type.replace(' ','-').toLowerCase()}`}><Icon size={size} strokeWidth={1.7}/></span>;}
export function Avatar({name}:{name:string}){return <span className="avatar">{name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span>;}
export function Empty({title='Nothing here yet',description='Add a record to get started.',action}:{title?:string;description?:string;action?:ReactNode}){return <div className="empty"><span><Box size={28} strokeWidth={1.4}/></span><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function Loading(){return <div className="empty"><LoaderCircle className="spin"/><p>Loading your workspace…</p></div>;}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Input(props:InputHTMLAttributes<HTMLInputElement>){return <input {...props} className={`input ${props.className||''}`}/>;}
export function Select(props:SelectHTMLAttributes<HTMLSelectElement>){return <select {...props} className={`input ${props.className||''}`}/>;}
export function Textarea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea {...props} className={`input ${props.className||''}`}/>;}
export function FormError({message}:{message?:string}){return message?<div className="form-error" role="alert">{message}</div>:null;}
export function Modal({title,subtitle,onClose,children,wide=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
 return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}} aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={20}/></IconButton></div>{children}</dialog>;
}
export function SectionHead({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}){return <div className="section-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>;}
export function PageHead({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></div>;}
export function SearchBox({value,onChange,placeholder='Search…'}:{value:string;onChange:(v:string)=>void;placeholder?:string}){return <div className="search-box"><Search size={17}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>{value&&<IconButton label="Clear search" onClick={()=>onChange('')}><X size={14}/></IconButton>}</div>;}
export function StatCard({label,value,caption,Icon,tone='green',onClick}:{label:string;value:string|number;caption:string;Icon:LucideIcon;tone?:string;onClick?:()=>void}){return <button className={`stat-card ${tone}`} onClick={onClick}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18}/></span></div><div className="stat-value">{value}<ArrowUpRight size={20}/></div><div className="stat-caption">{caption}</div></button>;}
