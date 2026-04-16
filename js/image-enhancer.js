// Image Enhancer Page Script
// Provides: drag-drop/upload, mode selection (enhance/colorize), calls Netlify function
// Fallback to local enhancement if API fails.

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resizeImageFileToDataUrl(file, maxDim = 2048) {
  const src = await fileToDataUrl(file);
  const img = await new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
  if (!img) return src;
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  if (scale >= 1) return src;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function localEnhanceDataUrl(dataUrl, mode = 'enhance') {
  const img = await new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = dataUrl;
  });
  if (!img) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  const baseFilter = 'contrast(1.08) saturate(1.10) brightness(1.02)';
  const colorizeBoost = mode === 'colorize' ? ' saturate(1.18) hue-rotate(2deg)' : '';
  ctx.filter = baseFilter + colorizeBoost;
  ctx.drawImage(img, 0, 0);
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const out = applyConvolution(imgData, [
      0, -1,  0,
     -1,  5, -1,
      0, -1,  0
    ]);
    ctx.putImageData(out, 0, 0);
  } catch (_) {}
  return canvas.toDataURL('image/jpeg', 0.9);
}

function applyConvolution(imageData, kernel) {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const out = output.data;
  const k = kernel;
  const get = (x, y, c) => {
    if (x < 0) x = 0; if (y < 0) y = 0;
    if (x >= width) x = width - 1; if (y >= height) y = height - 1;
    return data[(y * width + x) * 4 + c];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const v =
          get(x-1,y-1,c)*k[0] + get(x,y-1,c)*k[1] + get(x+1,y-1,c)*k[2] +
          get(x-1,y  ,c)*k[3] + get(x,y  ,c)*k[4] + get(x+1,y  ,c)*k[5] +
          get(x-1,y+1,c)*k[6] + get(x,y+1,c)*k[7] + get(x+1,y+1,c)*k[8];
        out[(y*width + x)*4 + c] = Math.max(0, Math.min(255, v));
      }
      out[(y*width + x)*4 + 3] = data[(y*width + x)*4 + 3];
    }
  }
  return output;
}

function $(id){ return document.getElementById(id); }

let currentFile = null;
let beforeDataUrl = '';
let afterDataUrl = '';

function setStatus(text){ $('status').textContent = text || ''; }

function setUIProcessing(isOn){
  $('processBtn').disabled = isOn || !currentFile;
}

function updateImages() {
  $('beforeImg').src = beforeDataUrl || '';
  $('afterImg').src = afterDataUrl || '';
  $('downloadBtn').disabled = !afterDataUrl;
}

async function handleProcess() {
  if (!currentFile) return;
  setUIProcessing(true);
  setStatus('Préparation de l\'image…');
  try {
    const mode = $('modeSelect').value;
    beforeDataUrl = await resizeImageFileToDataUrl(currentFile, 2048);
    updateImages();
    setStatus('Appel de l\'IA…');
    const resp = await fetch('/.netlify/functions/enhance-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, imageBase64: beforeDataUrl })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.imageBase64) {
      console.warn('Enhance API error (public page):', json);
      setStatus('IA indisponible, amélioration locale en cours…');
      afterDataUrl = await localEnhanceDataUrl(beforeDataUrl, mode);
      updateImages();
      setStatus('Amélioration locale terminée');
      return;
    }
    afterDataUrl = 'data:image/png;base64,' + json.imageBase64;
    updateImages();
    setStatus('Terminé ✅');
  } catch (e) {
    console.error(e);
    setStatus('Erreur inattendue. Réessayez.');
  } finally {
    setUIProcessing(false);
  }
}

function bindEnhancerPage() {
  const dz = $('dropzone');
  const input = $('fileInput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    currentFile = f;
    fileToDataUrl(f).then((d) => { beforeDataUrl = d; updateImages(); });
  });
  ;['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); }));
  ;['dragleave','drop'].forEach(evt => dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); }));
  dz.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    currentFile = f;
    fileToDataUrl(f).then((d) => { beforeDataUrl = d; updateImages(); setStatus(''); });
  });
  $('processBtn').addEventListener('click', handleProcess);
  $('downloadBtn').addEventListener('click', async () => {
    if (!afterDataUrl) return;
    const a = document.createElement('a');
    a.href = afterDataUrl;
    a.download = 'photo-amelioree.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

document.addEventListener('DOMContentLoaded', bindEnhancerPage);
