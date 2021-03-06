const { join } = require('path');

module.exports = {
  sourceModule: 'react',
  sourceFile: join('umd', 'react.development.js'),
  sourceSelectSteps: [
    o => o.body,
    function(o) {
      if (o.type === 'ExpressionStatement') {
        if (o.expression && o.expression.type && o.expression.type === 'CallExpression') {
          return o;
        }
      }
      return false;
    },
    o => o.expression,
    o => o.arguments,
    function(o) {
      if (o.type === 'FunctionExpression') {
        return o;
      }
      return false;
    }
  ],
  targetSelectSteps: [
    o => o.body,
    o => (o.type === 'VariableDeclaration' ? o : false),
    o => o.declarations,
    o => (o.type === 'VariableDeclarator' ? o : false),
    o => o.init,
    o => (o.type === 'CallExpression' ? o : false)
  ]
};
