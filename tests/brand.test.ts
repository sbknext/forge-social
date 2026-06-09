import { describe, it, expect } from 'vitest';
import { loadBrand, renderBrand, missingBrandKeys, type Brand } from '../src/core/brand.js';

describe('loadBrand', () => {
  it('returns documented defaults when env is empty', () => {
    const brand = loadBrand({});
    expect(brand.forge_url).toBe('https://forge.sbknext.com');
    expect(brand.mcp_url).toBe('https://mcp.sbknext.com');
  });

  it('returns empty string for undocumented keys when env is empty', () => {
    const brand = loadBrand({});
    expect(brand.echo_url).toBe('');
    expect(brand.handle).toBe('');
    expect(brand.x_handle).toBe('');
    expect(brand.ig_handle).toBe('');
  });

  it('reads all keys from env overrides', () => {
    const brand = loadBrand({
      FORGE_SOCIAL_ECHO_URL: 'https://echo.test',
      FORGE_SOCIAL_FORGE_URL: 'https://forge.test',
      FORGE_SOCIAL_MCP_URL: 'https://mcp.test',
      FORGE_SOCIAL_HANDLE: '@testhandle',
      FORGE_SOCIAL_X_HANDLE: '@testx',
      FORGE_SOCIAL_IG_HANDLE: '@testig',
    });
    expect(brand.echo_url).toBe('https://echo.test');
    expect(brand.forge_url).toBe('https://forge.test');
    expect(brand.mcp_url).toBe('https://mcp.test');
    expect(brand.handle).toBe('@testhandle');
    expect(brand.x_handle).toBe('@testx');
    expect(brand.ig_handle).toBe('@testig');
  });

  it('env value overrides the documented default for forge_url', () => {
    const brand = loadBrand({ FORGE_SOCIAL_FORGE_URL: 'https://custom.forge' });
    expect(brand.forge_url).toBe('https://custom.forge');
  });
});

describe('renderBrand', () => {
  const fullBrand: Brand = {
    echo_url: 'https://echo.ai',
    forge_url: 'https://forge.sbknext.com',
    mcp_url: 'https://mcp.sbknext.com',
    handle: '@forge',
    x_handle: '@forgex',
    ig_handle: '@forgeig',
  };

  it('substitutes all known placeholders', () => {
    const out = renderBrand(
      'echo={echo_url} forge={forge_url} mcp={mcp_url} h={handle} x={x_handle} ig={ig_handle}',
      fullBrand
    );
    expect(out).toBe(
      'echo=https://echo.ai forge=https://forge.sbknext.com mcp=https://mcp.sbknext.com h=@forge x=@forgex ig=@forgeig'
    );
  });

  it('leaves unknown placeholders intact', () => {
    const out = renderBrand('see {unknown_key} and {echo_url}', fullBrand);
    expect(out).toContain('{unknown_key}');
    expect(out).toContain('https://echo.ai');
  });

  it('collapses double-spaces from empty brand values', () => {
    const brand: Brand = { ...fullBrand, handle: '' };
    const out = renderBrand('hello {handle} world', brand);
    expect(out).toBe('hello world');
    expect(out).not.toContain('  ');
  });

  it('trims leading/trailing whitespace', () => {
    const brand: Brand = { ...fullBrand, echo_url: '' };
    const out = renderBrand('{echo_url} trail', brand);
    expect(out).toBe('trail');
  });

  it('handles case-insensitive placeholder keys', () => {
    const out = renderBrand('{ECHO_URL} and {Forge_Url}', fullBrand);
    expect(out).toBe('https://echo.ai and https://forge.sbknext.com');
  });

  it('returns plain text unchanged when no placeholders', () => {
    const out = renderBrand('no placeholders here', fullBrand);
    expect(out).toBe('no placeholders here');
  });
});

describe('missingBrandKeys', () => {
  const emptyBrand: Brand = {
    echo_url: '',
    forge_url: '',
    mcp_url: '',
    handle: '',
    x_handle: '',
    ig_handle: '',
  };

  it('reports all missing brand keys used in template', () => {
    const missing = missingBrandKeys('go to {echo_url} — follow {x_handle}', emptyBrand);
    expect(missing).toContain('echo_url');
    expect(missing).toContain('x_handle');
    expect(missing).not.toContain('forge_url');
  });

  it('returns empty array when all used keys are set', () => {
    const brand: Brand = { ...emptyBrand, echo_url: 'https://echo.ai' };
    const missing = missingBrandKeys('see {echo_url}', brand);
    expect(missing).toHaveLength(0);
  });

  it('does not report unknown placeholder keys as missing', () => {
    const missing = missingBrandKeys('{unknown_key} and {echo_url}', emptyBrand);
    expect(missing).not.toContain('unknown_key');
    expect(missing).toContain('echo_url');
  });

  it('de-duplicates repeated same placeholder', () => {
    const missing = missingBrandKeys('{echo_url} again {echo_url}', emptyBrand);
    expect(missing.filter((k) => k === 'echo_url')).toHaveLength(1);
  });

  it('returns empty array for template with no placeholders', () => {
    const missing = missingBrandKeys('plain text', emptyBrand);
    expect(missing).toHaveLength(0);
  });
});
