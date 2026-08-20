const { withXcodeProject } = require('@expo/config-plugins');

/**
 * React Native/Expo build scripts need to write generated artifacts into the
 * Xcode build products directory. On newer Xcode versions, User Script
 * Sandboxing can block those writes (for example the dev-client ip.txt file).
 *
 * Keep this setting managed by prebuild so a clean iOS regeneration does not
 * reintroduce the build failure.
 */
module.exports = function withDisableUserScriptSandboxing(config) {
  return withXcodeProject(config, (config) => {
    const section = config.modResults.pbxXCBuildConfigurationSection();

    for (const value of Object.values(section)) {
      if (value && typeof value === 'object' && value.buildSettings) {
        value.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }

    return config;
  });
};
