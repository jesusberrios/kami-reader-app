const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agregar soporte para archivos .cjs si no está ya incluido
if (!config.resolver.sourceExts.includes('cjs')) {
    config.resolver.sourceExts.push('cjs');
}

// Deshabilitar package exports inestables (opcional)
config.resolver.unstable_enablePackageExports = false;

// ✅ NO uses babelTransformerPath aquí con Expo, causará errores
// Deja que Expo y l.config.js se encarguen de aplicar Reanimated

module.exports = config;
