import { describe, it, expect } from 'vitest';
import { validateRut, formatRut, cleanRut } from '../utils/rutValidator';

describe('rutValidator', () => {
  describe('cleanRut', () => {
    it('should remove dots and hyphens and uppercase', () => {
      expect(cleanRut('12.345.678-9')).toBe('123456789');
      expect(cleanRut('12345678-9')).toBe('123456789');
      expect(cleanRut('12.345.678')).toBe('12345678');
      expect(cleanRut('81.201.000-k')).toBe('81201000K');
    });
  });

  describe('formatRut', () => {
    it('should format RUT with dots and hyphen when valid', () => {
      expect(formatRut('123456789')).toBe('12.345.678-9');
      expect(formatRut('12345678')).toBe('1.234.567-8');
      expect(formatRut('81201000K')).toBe('81.201.000-K');
    });

    it('should return original if not matching format', () => {
      expect(formatRut('1234567')).toBe('1234567'); // too short
      expect(formatRut('abc')).toBe('abc');
    });

    it('should handle already formatted RUT', () => {
      expect(formatRut('12.345.678-9')).toBe('12.345.678-9');
    });
  });

  describe('validateRut', () => {
    it('should validate correct RUTs', () => {
      // 12.345.678-5  -> body=12345678, dv=5. Calc: 8*2+7*3+6*4+5*5+4*6+3*7+2*2+1*3=16+21+24+25+24+21+4+3=138. 11-(138%11)=11-6=5 ✓
      expect(validateRut('12.345.678-5')).toBe(true);
      // 81.201.000-K  -> body=81201000, dv=K. Calc: 0*2+0*3+0*4+1*5+0*6+2*7+1*2+8*3=0+0+0+5+0+14+2+24=45. 11-(45%11)=11-1=10=K ✓
      expect(validateRut('81.201.000-K')).toBe(true);
      // 76.123.456-7  -> body=76123456, dv=7. Calc: 6*2+5*3+4*4+3*5+2*6+1*7+6*2+7*3=12+15+16+15+12+7+12+21=110. 11-(110%11)=11-0=11=0 ✗
      // Let's find a valid one:
      // 11.111.111-1 -> body=11111111. calc: 1*2+1*3+1*4+1*5+1*6+1*7+1*2+1*3=32. 11-(32%11)=11-10=1 ✓
      expect(validateRut('11.111.111-1')).toBe(true);
    });

    it('should reject invalid RUTs', () => {
      expect(validateRut('12.345.678-8')).toBe(false); // wrong verifier
      expect(validateRut('12.345.678')).toBe(false);  // missing verifier
      expect(validateRut('123456789')).toBe(false);   // unformatted but invalid checksum
      expect(validateRut('abc')).toBe(false);         // invalid chars
      expect(validateRut('')).toBe(false);            // empty
    });

    it('should handle K verifier correctly', () => {
      expect(validateRut('81.201.000-K')).toBe(true);
      expect(validateRut('81.201.000-0')).toBe(false);
    });
  });
});