const { withXcodeProject, withPodfile } = require('@expo/config-plugins');

/**
 * React Native/Expo/CocoaPods build scripts need to write generated artifacts
 * into Xcode build locations. On newer Xcode versions, User Script Sandboxing
 * can block those writes (for example dev-client ip.txt or [CP] Embed Pods
 * Frameworks).
 *
 * Keep this setting managed by prebuild so clean iOS regenerations do not
 * reintroduce the build failure.
 */
module.exports = function withDisableUserScriptSandboxing(config) {
  config = withXcodeProject(config, (config) => {
    const section = config.modResults.pbxXCBuildConfigurationSection();

    for (const value of Object.values(section)) {
      if (value && typeof value === 'object' && value.buildSettings) {
        value.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }

    return config;
  });

  config = withPodfile(config, (config) => {
    const marker = '# Peppe: disable User Script Sandboxing for CocoaPods targets';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents = config.modResults.contents.replace(
        'post_install do |installer|',
        `post_install do |installer|\n  ${marker}\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |build_config|\n      build_config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'\n    end\n  end`,
      );
    }
    return config;
  });

  return config;
};
