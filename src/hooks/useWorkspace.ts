import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '../services/api';
export function useWorkspace(mode:'demo'|'live',userId?:string){return useQuery({queryKey:['workspace',mode,userId],queryFn:()=>api(mode).load(),enabled:mode==='demo'||!!userId,refetchInterval:60000,refetchOnWindowFocus:true,retry:1});}
export function useAction<T>(action:(arg:T)=>Promise<unknown>){const client=useQueryClient();return useMutation({mutationFn:action,onSuccess:()=>client.invalidateQueries({queryKey:['workspace']})});}
