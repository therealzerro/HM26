const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude the HITMASTER5-main subfolder — it has its own package.json and
// node_modules which confuses Metro's module resolver and causes bundle failures.
config.resolver.blockList = [
  new RegExp(`^${path.resolve(__dirname, 'HITMASTER5-main').replace(/\\/g, '\\\\')}[\\/\\\\].*`),
];

module.exports = config;
