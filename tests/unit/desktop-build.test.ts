import { describe, expect, it } from 'vitest';
// @ts-expect-error Build scripts are native JavaScript, outside the application TS project.
import { desktopBuildOptions } from '../../scripts/desktop-build-options.mjs';

describe('desktop signing configuration', () => {
  it('builds macOS previews with ad-hoc signing when CI secrets are empty', () => {
    const env = { CSC_LINK: '', CSC_KEY_PASSWORD: '', APPLE_ID: '', PATH: '/usr/bin' };
    const result = desktopBuildOptions('darwin', env, ['--publish', 'never']);
    expect(result.env).toEqual({ PATH: '/usr/bin' });
    expect(result.args).toEqual([
      '--publish',
      'never',
      '--config.mac.identity=-',
      '--config.mac.hardenedRuntime=false',
    ]);
    expect(env.CSC_LINK).toBe('');
  });

  it('preserves configured signing credentials and hardened runtime defaults', () => {
    const env = { CSC_LINK: 'certificate.p12', CSC_KEY_PASSWORD: 'test-password' };
    const result = desktopBuildOptions('darwin', env, ['--publish', 'never']);
    expect(result.env).toEqual(env);
    expect(result.preview).toBe(false);
    expect(result.args).toEqual(['--publish', 'never']);
    expect(desktopBuildOptions('darwin', { CSC_NAME: 'Developer ID' }, []).preview).toBe(false);
  });

  it('keeps Linux and Windows packaging free of macOS overrides', () => {
    for (const platform of ['linux', 'win32']) {
      const result = desktopBuildOptions(platform, { CSC_LINK: '' }, ['--dir']);
      expect(result.env).toEqual({});
      expect(result.args).toEqual(['--dir']);
      expect(result.preview).toBe(false);
    }
  });
});
