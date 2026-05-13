const { src, dest } = require('gulp');

function buildIcons() {
  return src(['nodes/**/*.svg', 'credentials/**/*.svg'], { base: '.' }).pipe(dest('dist'));
}

exports['build:icons'] = buildIcons;
