export function desktopBuildOptions(platform, sourceEnv, args) {
  const env = { ...sourceEnv };
  for (const name of [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'CSC_NAME',
    'CSC_INSTALLER_LINK',
    'CSC_INSTALLER_KEY_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]) {
    if (env[name] === '') delete env[name];
  }
  const preview = platform === 'darwin' && !env.CSC_LINK && !env.CSC_NAME;
  return {
    env,
    preview,
    args: preview
      ? [...args, '--config.mac.identity=-', '--config.mac.hardenedRuntime=false']
      : [...args],
  };
}
