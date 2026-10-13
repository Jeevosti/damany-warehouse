export interface Client { id: string; owner_id?: string; name: string; phone: string; email: string; location_address: string; gps_coordinates: string; created_at: string }
export type InstallationStatus = 'Active' | 'Pending Maintenance' | 'Commissioning' | 'Inactive';
export interface Installation { id: string; client_id: string; system_type: string; commissioning_date: string; status: InstallationStatus; notes: string; created_at: string; site_name: string; capacity_kw: number }
export interface InventoryItem { id: string; item_type: string; brand: string; model: string; total_stock: number; unit_price: number; low_stock_threshold: number; is_serialized:boolean; default_warranty_months:number }
export interface InventoryUnit { id: string; inventory_item_id: string; serial_number: string|null; received_date: string; state:'Available'|'Deployed'|'Faulty' }
export type ComponentStatus='Installed'|'Returned_Faulty'|'Replaced';
export interface SiteComponent { id: string; installation_id: string; inventory_item_id: string; inventory_unit_id:string; serial_number: string|null; warranty_months: number; installed_date: string; status:ComponentStatus; replaced_by_component_id:string|null; created_at:string }
export interface ComponentEvent { id:string;component_id:string;event_type:'Assigned'|'Returned_Faulty'|'Replaced';replacement_component_id:string|null;reason:string;actor_id?:string;created_at:string }
export interface NotificationRead { notification_key:string;read_at:string }
export interface Snapshot { clients: Client[]; installations: Installation[]; inventory_items: InventoryItem[]; inventory_units: InventoryUnit[]; site_components: SiteComponent[];component_events:ComponentEvent[];notification_reads:NotificationRead[] }
export type ClientInput = Omit<Client, 'id'|'owner_id'|'created_at'>;
export interface ComponentInput {inventory_item_id:string;serial_number:string|null;warranty_months:number;installed_date:string;quantity?:number}
export type InstallationInput = Omit<Installation, 'id'|'created_at'|'client_id'>;
export interface SiteInput { client_id?: string; client?: ClientInput; installation: InstallationInput; components: ComponentInput[] }
export type ItemInput = Omit<InventoryItem, 'id'|'total_stock'>;
export type View = 'overview' | 'clients' | 'installations' | 'inventory' | 'warranties' | 'notifications' | 'settings';
export interface RmaInput {component_id:string;reason:string;replacement?:ComponentInput}
