/**
 * ESLint plugin to prevent usage of legacy APIs in iMock2
 * Specifically prevents access to window.allMappings and window.originalMappings
 */

module.exports = {
  rules: {
    'no-legacy-mappings': {
      meta: {
        type: 'problem',
        docs: {
          description: 'disallow usage of legacy window.allMappings and window.originalMappings',
          category: 'Best Practices',
          recommended: true
        },
        schema: [], // no options
        messages: {
          noLegacyMappings: 'Use MappingsStore.getAll() instead of window.allMappings or window.originalMappings'
        }
      },
      create: function(context) {
        return {
          MemberExpression(node) {
            // Check for window.allMappings or window.originalMappings
            if (
              node.object.type === 'Identifier' &&
              node.object.name === 'window' &&
              node.property.type === 'Identifier' &&
              (node.property.name === 'allMappings' || node.property.name === 'originalMappings')
            ) {
              context.report({
                node: node,
                messageId: 'noLegacyMappings'
              });
            }
          },
          AssignmentExpression(node) {
            // Check for assignments to window.allMappings or window.originalMappings
            if (
              node.left.type === 'MemberExpression' &&
              node.left.object.type === 'Identifier' &&
              node.left.object.name === 'window' &&
              node.left.property.type === 'Identifier' &&
              (node.left.property.name === 'allMappings' || node.left.property.name === 'originalMappings')
            ) {
              context.report({
                node: node,
                messageId: 'noLegacyMappings'
              });
            }
          }
        };
      }
    }
  }
};