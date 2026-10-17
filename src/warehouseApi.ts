import {supabase} from '../services/supabase';
import type {MovementInput, WarehouseAccess, WarehouseLocation, WarehouseMember, WarehouseMovement, WarehouseOperation, WarehouseSnapshot} from './warehouse';
import {validateReportPeriod} from './warehouse';
function client() {const db = supabase(); if (!db) throw new Error('Sign in to your company account first.'); return db;}
async function rpc<T>(name: string, input?: Record<string, unknown>): Promise<T> {const {data, error} = await client().rpc(name, input); if (error) throw error; return data as T;}
export const warehouseApi = {
  access: () => rpc<WarehouseAccess>('get_warehouse_access'),
  workspace: () => rpc<WarehouseSnapshot>('get_workspace'),
  team: () => rpc<WarehouseMember[]>('get_warehouse_team'),
  member: (email: string, role: 'admin' | 'viewer' | null) => rpc<void>('set_warehouse_member', {p_email: email, p_role: role}),
  createProduct: (input: Record<string, unknown>) => rpc<string>('create_warehouse_product', {p_input: input}),
  addLocation: (name: string) => rpc<string>('add_warehouse_location', {p_name: name}),
  post: (input: MovementInput) => rpc<string>('post_warehouse_operation', {p_input: input}),
  async locations(): Promise<WarehouseLocation[]> {const {data, error} = await client().from('warehouse_locations').select('id,name,is_main,created_at').order('is_main', {ascending: false}).order('name'); if (error) throw error; return data as WarehouseLocation[];},
  async setSku(id: string, sku: string) {const {error} = await client().from('inventory_items').update({sku: sku.trim().toUpperCase() || null}).eq('id', id).select('id').single(); if (error) throw error;},
  async report(from: string, to: string): Promise<{movements: WarehouseMovement[]; operations: WarehouseOperation[]}> {
    validateReportPeriod(from, to);
    const movements: WarehouseMovement[] = [], operations: WarehouseOperation[] = [];
    for (let cursor: number | null = null; ;) {
      let request = client().from('warehouse_movements').select('*').gte('business_date', from).lte('business_date', to).order('id', {ascending: false}).limit(100);
      if (cursor !== null) request = request.lt('id', cursor);
      const {data, error} = await request; if (error) throw error;
      movements.push(...data as WarehouseMovement[]); if (data.length < 100) break; cursor = data[data.length - 1].id;
    }
    for (let offset = 0; ; offset += 100) {
      const {data, error} = await client().from('warehouse_operations').select('*').gte('business_date', from).lte('business_date', to).order('created_at', {ascending: false}).order('id').range(offset, offset + 99);
      if (error) throw error; operations.push(...data as WarehouseOperation[]); if (data.length < 100) break;
    }
    return {movements, operations};
  },
};
