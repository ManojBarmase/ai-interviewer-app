const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '..', 'public', 'vad');

try {
  fs.mkdirSync(targetDir, { recursive: true });

  const vadDist = path.join(
    __dirname,
    '..',
    'node_modules',
    '@ricky0123',
    'vad-web',
    'dist',
  );

  if (fs.existsSync(vadDist)) {
    const files = fs.readdirSync(vadDist);
    for (const f of files) {
      if (f.endsWith('.onnx') || f === 'vad.worklet.bundle.min.js') {
        fs.copyFileSync(path.join(vadDist, f), path.join(targetDir, f));
      }
    }
  }

  const ortDist = path.join(
    __dirname,
    '..',
    'node_modules',
    'onnxruntime-web',
    'dist',
  );

  if (fs.existsSync(ortDist)) {
    const files = fs.readdirSync(ortDist);
    for (const f of files) {
      if (f.startsWith('ort-wasm')) {
        fs.copyFileSync(path.join(ortDist, f), path.join(targetDir, f));
      }
    }
  }

  console.log('[Enterprise Asset Pipeline] VAD & ONNX WASM assets successfully synchronized to public/vad/');
} catch (err) {
  console.warn('[Enterprise Asset Pipeline] Warning: Could not copy VAD assets:', err.message);
}

