// Wrangler uploads this import as a precompiled Wasm module, not raw bytes.
declare module 'tiktoken/lite/tiktoken_bg.wasm' {
  const compiledModule: WebAssembly.Module;
  export default compiledModule;
}
