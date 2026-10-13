/// <reference types="vite/client" />

declare module "*.jsx" {
  const component: import("react").ComponentType;
  export default component;
}
