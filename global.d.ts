declare module '*.vue' {
  const component: any;
  export default component;
}

/** 应用版本号，由 Vite define 自动从 package.json 注入 */
declare const __APP_VERSION__: string;
