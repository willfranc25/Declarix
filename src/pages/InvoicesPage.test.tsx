import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { getPage, localRows } = vi.hoisted(() => ({ getPage: vi.fn(), localRows: [] as any[] }));
vi.mock('../services/storage/StorageProvider', () => ({
  getStorageProvider: () => ({ initialize: async () => {}, getPage }),
}));
vi.mock('../services/organizationService', () => ({ getWorkspaceGeneration: () => 1 }));
vi.mock('../services/storage/db',()=>({default:{invoices:{orderBy:()=>({reverse:()=>({toArray:async()=>localRows})})}}}));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
import InvoicesPage from './InvoicesPage';
import invoiceStore from '../store/invoiceStore';
import localProvider from '../services/storage/indexedDBProvider';

beforeEach(()=>{invoiceStore.getState().reset();getPage.mockReset();localRows.length=0;});

describe('Comprobantes', () => {
  it('opens actions outside the clipped table, closes with Escape and keeps the selected receipt',async()=>{
    getPage.mockResolvedValue({total:1,rows:[{id:'receipt',providerName:'Proveedor menú',date:'2026-10-07',totalAmount:2600,taxStatus:'reviewed'}]});
    render(<MemoryRouter><InvoicesPage /></MemoryRouter>);
    const trigger=await screen.findByRole('button',{name:'Más acciones de Proveedor menú'});
    vi.spyOn(trigger,'getBoundingClientRect').mockReturnValue(new DOMRect(800,400,32,30));
    await userEvent.click(trigger);
    const menu=screen.getByRole('menu',{name:'Acciones del comprobante'});
    expect(menu.parentElement).toBe(document.body);
    expect(menu.closest('.table-container')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded','true');
    expect(screen.getByRole('menuitem',{name:'Ver detalle'})).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem',{name:'Marcar declarada'})).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem',{name:'Eliminar'}));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirmar eliminación');
  });
  it('separates every state in the actual filter flow and clears the selection',async()=>{
    const states=['pending','reviewed','exported','declared',null];
    const names=['Pendiente real','NEW MARKET SPA','Exportada real','Declarada real','Pendiente antiguo'];
    localRows.push(...states.map((taxStatus,index)=>({id:String(index),providerName:names[index],date:'2026-10-07',
      createdAt:'2026-10-08T12:16:00Z',documentType:'Boleta',expenseType:'Otros',totalAmount:2600,taxStatus})));
    getPage.mockImplementation(options=>localProvider.getPage(options));
    render(<MemoryRouter><InvoicesPage /></MemoryRouter>);
    await screen.findByText('NEW MARKET SPA');
    await userEvent.click(screen.getByRole('button',{name:/Más filtros/}));
    const statusFilter=screen.getByRole('combobox',{name:'Estado'});
    await userEvent.selectOptions(statusFilter,'pending');
    await waitFor(()=>expect(screen.queryByText('NEW MARKET SPA')).not.toBeInTheDocument());
    expect(screen.getByText('Pendiente real')).toBeInTheDocument();
    expect(screen.getByText('Pendiente antiguo')).toBeInTheDocument();
    expect(screen.queryByText('Exportada real')).not.toBeInTheDocument();
    expect(screen.queryByText('Declarada real')).not.toBeInTheDocument();
    for(const [status,name] of [['reviewed','NEW MARKET SPA'],['exported','Exportada real'],['declared','Declarada real']]){
      await userEvent.selectOptions(statusFilter,status);await screen.findByText(name);
      expect(screen.queryByText('Pendiente real')).not.toBeInTheDocument();
      expect(screen.queryByText('Pendiente antiguo')).not.toBeInTheDocument();
      expect(getPage).toHaveBeenLastCalledWith({page:1,pageSize:25,filters:{taxStatus:status}});
    }
    await userEvent.click(screen.getByRole('button',{name:'Limpiar'}));
    await screen.findByText('NEW MARKET SPA');
    expect(screen.getByText('Pendiente real')).toBeInTheDocument();
    expect(screen.getByText('Exportada real')).toBeInTheDocument();
  });
  it('loads one page and shows issue and upload dates separately', async () => {
    getPage.mockImplementation(({ page }) => Promise.resolve({
      total: 26,
      rows: [{ id: String(page), providerName: `Proveedor ${page}`, date: '2026-09-21',
        uploadedAt: '2026-09-30T15:40:00Z', documentType: 'Boleta', expenseType: 'Otros',
        totalAmount: 1000, taxStatus: 'reviewed' }],
    }));
    render(<MemoryRouter><InvoicesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Proveedor 1')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Emisión' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Carga al sistema' })).toBeInTheDocument();
    expect(screen.getByText('21/09/2026')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith({ page: 1, pageSize: 25, filters: {} });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByText('Proveedor 2')).toBeInTheDocument());
    expect(getPage).toHaveBeenCalledWith({ page: 2, pageSize: 25, filters: {} });
  });
});
