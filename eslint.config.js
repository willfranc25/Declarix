import js from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default [
  { ignores:['dist/**','work/**','node_modules/**'] },
  { files:['**/*.{js,jsx,mjs}'],plugins:{'react-hooks':hooks},languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{
    ...js.configs.recommended.rules,
    // JSX identifiers are resolved by the compiler; unused imports are reviewed separately.
    'no-unused-vars':'off','react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','no-undef':'error','no-empty':['error',{allowEmptyCatch:true}],
  }},
];
