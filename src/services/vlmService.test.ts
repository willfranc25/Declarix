import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del storage provider (settings) y del cliente Supabase
const mockGetSetting = vi.fn();
vi.mock('./storage/StorageProvider', () => ({
  getStorageProvider: () => ({ getSetting: mockGetSetting }),
}));

const mockGetSession = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

import { extractInvoiceData, validateExtractedData } from '../services/vlmService';

// RUT chileno con dígito verificador válido
const VALID_RUT = '12.345.678-5';

const validFactura = {
  providerName: 'Sodimac',
  providerRut: VALID_RUT,
  documentType: 'Factura',
  documentNumber: '12345',
  date: '2026-01-15',
  detail: 'Materiales',
  expenseType: 'Materiales de Construccion',
  netAmount: 1000,
  totalBoletaServicios: 0,
  totalBoletaHonorarios: 0,
  specificTax: 0,
  ivaAmount: 190,
  totalAmount: 1190,
};

function geminiResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  };
}

function backendResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({ text: JSON.stringify(payload), requestId: 'req-1' }),
  };
}

function makeImageFile() {
  return new File([new Uint8Array([1, 2, 3])], 'boleta.jpg', { type: 'image/jpeg' });
}

describe('validateExtractedData', () => {
  it('acepta una factura consistente', () => {
    const result = validateExtractedData(validFactura);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rechaza RUT inválido', () => {
    const result = validateExtractedData({ ...validFactura, providerRut: '12.345.678-0' });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('RUT');
  });

  it('rechaza neto + IVA distinto del total en facturas', () => {
    const result = validateExtractedData({ ...validFactura, totalAmount: 2000 });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('inconsistente');
  });

  it('rechaza fechas futuras', () => {
    const result = validateExtractedData({ ...validFactura, date: '2099-01-01' });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('futura');
  });

  it('rechaza tipos de gasto fuera del catálogo', () => {
    const result = validateExtractedData({ ...validFactura, expenseType: 'Gasto Inventado' });
    expect(result.isValid).toBe(false);
  });

  it('exige total > 0 en boletas', () => {
    const result = validateExtractedData({
      ...validFactura,
      documentType: 'Boleta',
      netAmount: 0,
      ivaAmount: 0,
      totalBoletaServicios: 0,
    });
    expect(result.isValid).toBe(false);
  });
});

describe('extractInvoiceData — camino avanzado (API key propia)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSetting.mockReset();
    mockGetSession.mockReset();
  });

  it('llama directo a Gemini con la key del usuario y devuelve datos validados', async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === 'vlm_provider') return 'gemini';
      if (key === 'vlm_api_key') return 'user-own-key';
      return null;
    });
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(validFactura));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    expect(result.providerRut).toBe(VALID_RUT);
    expect(result.totalAmount).toBe(1190);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('user-own-key');
  });

  it('reintenta con feedback cuando la validación falla y termina con datos válidos', async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === 'vlm_provider') return 'gemini';
      if (key === 'vlm_api_key') return 'user-own-key';
      return null;
    });
    const invalid = { ...validFactura, providerRut: '11.111.111-0' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(geminiResponse(invalid))
      .mockResolvedValueOnce(geminiResponse(validFactura));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerRut).toBe(VALID_RUT);
    // El segundo intento incluye el feedback del error anterior en el prompt
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(JSON.stringify(secondBody)).toContain('intento anterior');
  });
});

describe('extractInvoiceData — camino normal (backend propio)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSetting.mockReset();
    mockGetSession.mockReset();
    // Sin API key propia → usa el backend
    mockGetSetting.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-token' } } });
  });

  it('llama a /api/extract con el token de sesión', async () => {
    const fetchMock = vi.fn().mockResolvedValue(backendResponse(validFactura));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    expect(result.totalAmount).toBe(1190);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
    const body = JSON.parse(init.body as string);
    expect(body.mimeType).toBe('image/jpeg');
    expect(typeof body.imageBase64).toBe('string');
  });

  it('propaga el mensaje de error entendible del backend tras agotar reintentos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Alcanzaste el límite mensual de extracciones con IA de tu plan.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractInvoiceData(makeImageFile())).rejects.toThrow(/límite mensual/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
