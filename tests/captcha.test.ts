import { describe, it, expect } from 'vitest';
import { isCaptchaUrl } from '../src/core/captcha.js';

describe('isCaptchaUrl', () => {
  describe('X patterns', () => {
    it('detects /account_access_step', () => {
      expect(isCaptchaUrl('https://x.com/account_access_step?flow_id=abc', 'x')).toBe(true);
    });

    it('detects /i/flow/login', () => {
      expect(isCaptchaUrl('https://x.com/i/flow/login', 'x')).toBe(true);
    });

    it('detects arkose in URL', () => {
      expect(isCaptchaUrl('https://client-api.arkoselabs.com/fc/api/', 'x')).toBe(true);
    });

    it('does not flag normal home URL', () => {
      expect(isCaptchaUrl('https://x.com/home', 'x')).toBe(false);
    });

    it('does not flag compose URL', () => {
      expect(isCaptchaUrl('https://x.com/compose/tweet', 'x')).toBe(false);
    });
  });

  describe('Instagram patterns', () => {
    it('detects two_factor URL', () => {
      expect(isCaptchaUrl('https://www.instagram.com/accounts/login/two_factor/', 'instagram')).toBe(true);
    });

    it('detects /challenge/ URL', () => {
      expect(isCaptchaUrl('https://www.instagram.com/challenge/12345/', 'instagram')).toBe(true);
    });

    it('detects suspended', () => {
      expect(isCaptchaUrl('https://www.instagram.com/accounts/suspended/', 'instagram')).toBe(true);
    });

    it('does not flag home URL', () => {
      expect(isCaptchaUrl('https://www.instagram.com/', 'instagram')).toBe(false);
    });

    it('does not flag profile URL', () => {
      expect(isCaptchaUrl('https://www.instagram.com/someuser/', 'instagram')).toBe(false);
    });
  });

  describe('cross-platform', () => {
    it('X pattern does not flag IG URLs', () => {
      expect(isCaptchaUrl('https://www.instagram.com/home', 'x')).toBe(false);
    });

    it('IG pattern does not flag X URLs', () => {
      expect(isCaptchaUrl('https://x.com/challenge-accepted', 'instagram')).toBe(false);
    });
  });
});
