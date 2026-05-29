import core from 'ultracite/eslint/core';
import nestjs from 'ultracite/eslint/nestjs';
import jest from 'ultracite/eslint/jest';

export default [
  ...core,
  ...nestjs,
  ...jest,
  {
    rules: {
      'sonarjs/file-header': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'sonarjs/arrow-function-convention': [
        'error',
        {
          // allows single parameter parenthesis
          requireParameterParentheses: true,
        },
      ],
      'new-cap': [
        'error',
        {
          capIsNewExceptions: [
            'Module',
            'Controller',
            'Injectable',
            'Inject',
            'Global',
            'Get',
            'Post',
            'Put',
            'Patch',
            'Delete',
            'Body',
            'Param',
            'Query',
            'Headers',
            'Req',
            'Res',
            'UsePipes',
            'UseGuards',
            'UseInterceptors',
            'Catch',
            'ExceptionFilter',
            'NestModule',
            'MiddlewareConsumer',
            'All',
            'AllowAnonymous',
            'SkipThrottle',
          ],
        },
      ],
      // allows constructor injection
      '@typescript-eslint/parameter-properties': 'off',
      'sonarjs/declarations-in-global-scope': 'off',
      'class-methods-use-this': 'off',
      '@typescript-eslint/class-methods-use-this': 'off',
      'promise/prefer-await-to-callbacks': 'off',
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowWithDecorator: true },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase', 'snake_case'],
        },
        {
          selector: 'objectLiteralProperty',
          format: [],
        },
        {
          selector: 'classProperty',
          modifiers: ['readonly', 'static'],
          format: ['UPPER_CASE', 'camelCase', 'snake_case'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'snake_case', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },
];
