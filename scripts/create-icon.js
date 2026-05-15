const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const zlib = require('zlib');

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function fillEllipse(cx, cy, rx, ry, setPx) {
  let x = 0, y = ry;
  let rx2 = rx * rx, ry2 = ry * ry;
  let p = ry2 - rx2 * ry + rx2 * 0.25;
  while (2 * x * ry2 < 2 * y * rx2) {
    for (let i = -x; i <= x; i++) setPx(cx + i, cy + y);
    for (let i = -x; i <= x; i++) setPx(cx + i, cy - y);
    if (p < 0) { x++; p += 2 * ry2 * x + ry2; }
    else { x++; y--; p += 2 * ry2 * x - 2 * rx2 * y + ry2; }
  }
  p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    for (let i = -x; i <= x; i++) setPx(cx + i, cy + y);
    for (let i = -x; i <= x; i++) setPx(cx + i, cy - y);
    if (p > 0) { y--; p -= 2 * rx2 * y + rx2; }
    else { x++; y--; p += 2 * ry2 * x - 2 * rx2 * y + rx2; }
  }
}

function fillCircle(cx, cy, r, setPx) {
  fillEllipse(cx, cy, r, r, setPx);
}

function fillRect(x1, y1, x2, y2, setPx) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      setPx(x, y);
}

function drawTriangle(x1, y1, x2, y2, x3, y3, setPx) {
  const minX = Math.max(0, Math.min(x1, x2, x3));
  const maxX = Math.min(255, Math.max(x1, x2, x3));
  const minY = Math.max(0, Math.min(y1, y2, y3));
  const maxY = Math.min(255, Math.max(y1, y2, y3));

  function edge(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d1 = edge(x1, y1, x2, y2, x, y);
      const d2 = edge(x2, y2, x3, y3, x, y);
      const d3 = edge(x3, y3, x1, y1, x, y);
      if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) {
        setPx(x, y);
      }
    }
  }
}

function createPNG(size) {
  const w = size, h = size;
  const stride = w * 4;
  const buf = Buffer.alloc(h * stride, 0);
  const bg = Buffer.alloc(h * stride, 0);

  function setPixel(arr, x, y, r, g, b, a) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * stride + x * 4;
    arr[i] = r; arr[i + 1] = g; arr[i + 2] = b; arr[i + 3] = a;
  }

  const setBG = (x, y) => {
    const dist = Math.sqrt((x - w/2) ** 2 + (y - h/2) ** 2);
    const maxR = w / 2;
    if (dist > maxR) return;
    const t = dist / maxR;
    const r = Math.round(239 - t * 40);
    const g = Math.round(68 - t * 30);
    const b = Math.round(68 - t * 30);
    setPixel(bg, x, y, Math.max(0, r), Math.max(0, g), Math.max(0, b), 255);
  };

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      setBG(x, y);

  const setW = (x, y) => setPixel(buf, x, y, 255, 255, 255, 255);

  const s = w / 256;

  const cx = Math.round(128 * s);
  const cy = Math.round(128 * s);
  const radius = Math.round(88 * s);

  fillCircle(cx, cy, radius, setW);

  const triSize = Math.round(40 * s);
  const triX1 = cx - Math.round(20 * s);
  const triY1 = cy - triSize;
  const triX2 = cx - Math.round(20 * s);
  const triY2 = cy + triSize;
  const triX3 = cx + Math.round(32 * s);
  const triY3 = cy;
  drawTriangle(triX1, triY1, triX2, triY2, triX3, triY3, setW);

  const extraR = Math.round(radius + 1);
  const dotR = Math.round(4 * s);
  const dotPositions = [
    [cx + Math.round(60 * s), cy - Math.round(55 * s)],
    [cx - Math.round(50 * s), cy + Math.round(55 * s)],
    [cx + Math.round(50 * s), cy + Math.round(55 * s)],
  ];
  for (const [dx, dy] of dotPositions) {
    fillCircle(dx, dy, dotR, setW);
  }

  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * stride + x * 4;
      const bA = bg[i + 3], bR = bg[i], bG = bg[i + 1], bB = bg[i + 2];
      const fR = buf[i], fG = buf[i + 1], fB = buf[i + 2], fA = buf[i + 3];
      const a = fA / 255;
      out[i] = Math.round(bR * (1 - a) + fR * a);
      out[i + 1] = Math.round(bG * (1 - a) + fG * a);
      out[i + 2] = Math.round(bB * (1 - a) + fB * a);
      out[i + 3] = bA;
    }
  }

  const deflated = zlib.deflateSync(out, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', deflated), makeChunk('IEND', Buffer.alloc(0))]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

const sizes = [256, 64, 48, 32, 16];
const dir = join(__dirname, '..', 'data');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const png256 = createPNG(256);
writeFileSync(join(dir, 'icon.png'), png256);

const pngs = sizes.map(s => createPNG(s));
let icoData = Buffer.alloc(6 + 16 * sizes.length);
icoData.writeUInt16LE(0, 0);
icoData.writeUInt16LE(1, 2);
icoData.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
for (let i = 0; i < sizes.length; i++) {
  const s = sizes[i], png = pngs[i];
  const entryOff = 6 + i * 16;
  icoData[entryOff] = s >= 256 ? 0 : s;
  icoData[entryOff + 1] = s >= 256 ? 0 : s;
  icoData[entryOff + 2] = 0; icoData[entryOff + 3] = 0;
  icoData.writeUInt16LE(1, entryOff + 4);
  icoData.writeUInt16LE(1, entryOff + 6);
  icoData.writeUInt32LE(png.length, entryOff + 8);
  icoData.writeUInt32LE(offset, entryOff + 12);
  offset += png.length;
}
icoData = Buffer.concat([icoData, ...pngs]);

writeFileSync(join(dir, 'icon.ico'), icoData);
console.log('YouTube Downloader icons generated in data/');
