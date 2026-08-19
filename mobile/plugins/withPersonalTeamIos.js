const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Development-only compatibility for an Apple Personal Team.
 *
 * Keeps basic HealthKit enabled by the HealthKit config plugin, but removes
 * entitlements that require capabilities we are not using in the first iPhone
 * pilot (remote push, clinical records, HealthKit background delivery).
 *
 * Remove this plugin when Peppe moves to a paid Apple Developer team and those
 * capabilities are intentionally enabled.
 */
module.exports = function withPersonalTeamIos(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    delete config.modResults['com.apple.developer.healthkit.access'];
    delete config.modResults['com.apple.developer.healthkit.background-delivery'];
    return config;
  });
};
