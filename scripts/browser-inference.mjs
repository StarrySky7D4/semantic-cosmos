import {resolve} from 'node:path';
// The Transformers.js prebuilt web bundle embeds an older ORT development
// snapshot. Bundle its source against our pinned JS/WASM runtime instead.
export const inferenceBuild={
 alias:{
  '@huggingface/transformers':resolve('node_modules/@huggingface/transformers/src/transformers.js'),
  'onnxruntime-web':resolve('node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs'),
  'onnxruntime-common':resolve('node_modules/onnxruntime-common'),
 },
 plugins:[{name:'browser-only-inference',setup(builder){
  builder.onResolve({filter:/^(node:|sharp$|onnxruntime-node$)/},args=>({path:args.path,namespace:'browser-empty'}));
  builder.onLoad({filter:/.*/,namespace:'browser-empty'},()=>({contents:'export default {};'}));
 }}],
};
