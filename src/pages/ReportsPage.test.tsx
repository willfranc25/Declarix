import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
const m=vi.hoisted(()=>({rpc:vi.fn(),pack:vi.fn(),download:vi.fn(),rows:[] as any[],update:vi.fn()}));
vi.mock('../context/CompanyContext',()=>({useCompany:()=>({activeCompany:{id:'company-a',name:'Empresa A',rut:'761234560'}})}));
vi.mock('../services/supabaseClient',()=>({supabase:{
 rpc:m.rpc,from:()=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null})};return q;}
}}));
vi.mock('../services/storage/StorageProvider',()=>({getStorageProvider:()=>({initialize:async()=>{},getAll:async()=>m.rows,getSetting:async()=>null,getImage:async()=>null,update:m.update})}));
vi.mock('../services/exportService',()=>({exportRendicionPackage:m.pack,exportToExcel:vi.fn(),exportToCSV:vi.fn(),downloadFile:m.download}));
import ReportsPage from './ReportsPage';
import store from '../store/invoiceStore';
import {previousMonthValue} from '../utils/reportPeriod';
const valid={id:'1',providerName:'Proveedor Uno',providerRut:'76123456-0',documentType:'Factura',documentNumber:'100',date:'2026-06-01',expenseType:'Insumos',netAmount:1000,ivaAmount:190,totalAmount:1190,taxStatus:'reviewed',updatedAt:'2026-06-01T00:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();store.getState().reset();m.rows=[valid];m.rpc.mockResolvedValue({data:'export-id',error:null});m.pack.mockResolvedValue({buffer:new ArrayBuffer(4),templateHash:'hash',count:1});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));});
async function open(){render(<MemoryRouter><ReportsPage/></MemoryRouter>);const input=screen.getByLabelText('Período');const {fireEvent}=await import('@testing-library/react');fireEvent.change(input,{target:{value:'2026-06'}});await screen.findByText('Proveedor Uno · 100');if (!(screen.getByRole('checkbox',{name:'Seleccionar todos'}) as HTMLInputElement).checked) await userEvent.click(screen.getByRole('checkbox',{name:'Seleccionar todos'}));}
it('exports exact IDs with snapshot versions and never declares them',async()=>{
 await open();await userEvent.click(screen.getByRole('button',{name:'Exportar selección'}));
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('record_export',expect.objectContaining({p_company:'company-a',p_ids:['1'],p_versions:{'1':valid.updatedAt}})));
 await screen.findByText(/comprobantes exportados/);expect(m.download).toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it('requires review before exporting a pending invoice',async()=>{
 m.rows=[{...valid,taxStatus:'pending'}];await open();await userEvent.click(screen.getByRole('button',{name:'Exportar selección'}));
 expect(await screen.findByText(/comprobantes pendientes o con campos incompletos/)).toBeInTheDocument();expect(m.pack).not.toHaveBeenCalled();
});
it('does not deliver an export if the database rejects a stale snapshot',async()=>{
 m.rpc.mockResolvedValue({data:null,error:new Error('Selección cambió')});await open();await userEvent.click(screen.getByRole('button',{name:'Exportar selección'}));
 await screen.findByText('Selección cambió');expect(m.download).not.toHaveBeenCalled();
});

it('defaults to a valid prior month and supports annual and range selections',async()=>{
 render(<MemoryRouter><ReportsPage/></MemoryRouter>);
 expect(screen.getByLabelText('Período')).toHaveValue(previousMonthValue());
 await userEvent.selectOptions(screen.getByLabelText('Vista'),'year');
 const {fireEvent}=await import('@testing-library/react');
 fireEvent.change(screen.getByLabelText('Año'),{target:{value:'2026'}});
 await screen.findByText('Proveedor Uno · 100');
 expect(screen.getByRole('button',{name:'Cerrar período'})).toBeDisabled();
 await userEvent.selectOptions(screen.getByLabelText('Vista'),'range');
 fireEvent.change(screen.getByLabelText('Período'),{target:{value:'2026-01'}});
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-12'}});
 await screen.findByText('Proveedor Uno · 100');
});
