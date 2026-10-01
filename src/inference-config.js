export const INFERENCE_RUNTIME='onnxruntime-web/1.30.0';
export const INFERENCE_SCHEMA=2;
// Dynamic Q8 scales depend on the other rows in a batch. Per-input inference
// makes cached rows independent of append order and improves backend agreement.
export const INFERENCE_BATCH_SIZE=1;
