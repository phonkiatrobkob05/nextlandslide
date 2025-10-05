import * as ort from "onnxruntime-web";

let session = null;
let featureOrder = [];

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
ort.env.wasm.simd = false;
ort.env.wasm.numThreads = 1;
await ort.env.ready;

export async function initModel() {
  const meta = await fetch("/models/land_subsidence-main/feature_mapping.json", { cache: "no-store" }).then(r=>r.json());
  featureOrder = meta.order; // ตรงกับที่ให้มา

  session = await ort.InferenceSession.create(
    "/models/land_subsidence-main/model.onnx",
    { executionProviders: ["wasm"] }
  );
  return { session, featureOrder };
}

export function buildInput(row, order) {
  return Float32Array.from(order.map(k => Number(row[k] ?? 0)));
}

export async function predict(vec, dim) {
  if (!session) throw new Error("session not ready");
  const input = new ort.Tensor("float32", vec, [1, dim]);
  const out = await session.run({ [session.inputNames[0]]: input });
  const key = session.outputNames[1] || session.outputNames[0];
  const prob = Array.from(out[key].data);
  const pred = prob.reduce((b,_,i,a)=> a[i] > a[b] ? i : b, 0);
  return { pred, prob };
}
