import fs from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const ROOT = process.cwd();
const FEATURE_DIRECTORY = path.join(ROOT, "public", "icons", "features");
const CANVAS_SIZE = 512;
const ALPHA_THRESHOLD = 8;
const EDGE_PADDING = 4;
const TARGET_VISIBLE_SIZE = 384;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(message) {
  throw new Error(`[normalize-feature-icons] ${message}`);
}

function readPng(filePath) {
  const input = fs.readFileSync(filePath);
  if (!input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(`${filePath} is not a PNG`);
  }

  let offset = PNG_SIGNATURE.length;
  let header;
  const imageData = [];
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > input.length) fail(`${filePath} contains a truncated ${type} chunk`);
    const data = input.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      imageData.push(data);
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  if (!header) fail(`${filePath} has no IHDR chunk`);
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    fail(`${filePath} must be a non-interlaced 8-bit RGBA PNG (got bitDepth=${header.bitDepth}, colorType=${header.colorType}, interlace=${header.interlace})`);
  }
  if (header.compression !== 0 || header.filter !== 0) fail(`${filePath} uses an unsupported PNG compression or filter method`);
  if (!imageData.length) fail(`${filePath} has no IDAT data`);

  const rowBytes = header.width * 4;
  const decoded = inflateSync(Buffer.concat(imageData));
  const expectedLength = header.height * (rowBytes + 1);
  if (decoded.length < expectedLength) fail(`${filePath} has incomplete image data`);

  const pixels = Buffer.alloc(header.width * header.height * 4);
  let decodedOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < header.height; y += 1) {
    const filter = decoded[decodedOffset];
    decodedOffset += 1;
    const row = Buffer.from(decoded.subarray(decodedOffset, decodedOffset + rowBytes));
    decodedOffset += rowBytes;
    unfilterRow(row, previous, filter);
    row.copy(pixels, y * rowBytes);
    previous = row;
  }

  return { width: header.width, height: header.height, pixels };
}

function unfilterRow(row, previous, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= 4 ? row[index - 4] : 0;
    const above = previous[index] ?? 0;
    const upperLeft = index >= 4 ? (previous[index - 4] ?? 0) : 0;
    let predictor = 0;

    if (filter === 1) {
      predictor = left;
    } else if (filter === 2) {
      predictor = above;
    } else if (filter === 3) {
      predictor = Math.floor((left + above) / 2);
    } else if (filter === 4) {
      const estimate = left + above - upperLeft;
      const distanceLeft = Math.abs(estimate - left);
      const distanceAbove = Math.abs(estimate - above);
      const distanceUpperLeft = Math.abs(estimate - upperLeft);
      predictor = distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft
        ? left
        : distanceAbove <= distanceUpperLeft ? above : upperLeft;
    } else if (filter !== 0) {
      fail(`unsupported PNG row filter ${filter}`);
    }

    row[index] = (row[index] + predictor) & 0xff;
  }
}

function getBounds(pixels, width, height, threshold) {
  const bounds = { left: width, top: height, right: -1, bottom: -1 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= threshold) continue;
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
  }
  return bounds.right < 0 ? null : bounds;
}

function getMetrics(pixels, width, height) {
  const geometry = getBounds(pixels, width, height, ALPHA_THRESHOLD);
  const allVisible = getBounds(pixels, width, height, 0);
  let alphaTotal = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (!alpha) continue;
      alphaTotal += alpha;
      weightedX += alpha * x;
      weightedY += alpha * y;
    }
  }

  return {
    geometry,
    allVisible,
    weightedCenter: alphaTotal ? { x: weightedX / alphaTotal, y: weightedY / alphaTotal } : null,
  };
}

function cropPixels(source, bounds) {
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((bounds.top + y) * source.width + bounds.left) * 4;
    const sourceEnd = sourceStart + width * 4;
    source.pixels.copy(pixels, y * width * 4, sourceStart, sourceEnd);
  }
  return { width, height, pixels };
}

function samplePremultiplied(source, width, height, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  let alphaTotal = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  for (let yOffset = 0; yOffset <= 1; yOffset += 1) {
    for (let xOffset = 0; xOffset <= 1; xOffset += 1) {
      const sampleX = Math.max(0, Math.min(width - 1, x0 + xOffset));
      const sampleY = Math.max(0, Math.min(height - 1, y0 + yOffset));
      const weight = (xOffset ? tx : 1 - tx) * (yOffset ? ty : 1 - ty);
      const index = (sampleY * width + sampleX) * 4;
      const alpha = source[index + 3];
      alphaTotal += alpha * weight;
      redTotal += source[index] * alpha * weight;
      greenTotal += source[index + 1] * alpha * weight;
      blueTotal += source[index + 2] * alpha * weight;
    }
  }

  if (alphaTotal <= 0) return [0, 0, 0, 0];
  return [
    Math.round(redTotal / alphaTotal),
    Math.round(greenTotal / alphaTotal),
    Math.round(blueTotal / alphaTotal),
    Math.round(alphaTotal),
  ];
}

function renderCentered(source, scale, center) {
  const output = Buffer.alloc(CANVAS_SIZE * CANVAS_SIZE * 4);
  const sourceCenterX = center.x + 0.5;
  const sourceCenterY = center.y + 0.5;
  const outputCenter = CANVAS_SIZE / 2;
  const originX = outputCenter - sourceCenterX * scale;
  const originY = outputCenter - sourceCenterY * scale;

  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const sourceX = (x + 0.5 - originX) / scale - 0.5;
      const sourceY = (y + 0.5 - originY) / scale - 0.5;
      if (sourceX < -0.5 || sourceX > source.width - 0.5 || sourceY < -0.5 || sourceY > source.height - 0.5) continue;
      const pixel = samplePremultiplied(source.pixels, source.width, source.height, sourceX, sourceY);
      const outputIndex = (y * CANVAS_SIZE + x) * 4;
      output[outputIndex] = pixel[0];
      output[outputIndex + 1] = pixel[1];
      output[outputIndex + 2] = pixel[2];
      output[outputIndex + 3] = pixel[3];
    }
  }
  return output;
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodePng(pixels) {
  const rowBytes = CANVAS_SIZE * 4;
  const scanlines = Buffer.alloc(CANVAS_SIZE * (rowBytes + 1));
  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    const scanlineStart = y * (rowBytes + 1);
    scanlines[scanlineStart] = 0;
    pixels.copy(scanlines, scanlineStart + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(CANVAS_SIZE, 0);
  header.writeUInt32BE(CANVAS_SIZE, 4);
  header[8] = 8;
  header[9] = 6;
  const compressed = deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function formatPoint(point) {
  return point ? `(${point.x.toFixed(2)},${point.y.toFixed(2)})` : "none";
}

function formatBounds(bounds) {
  return bounds ? `(${bounds.left},${bounds.top})-(${bounds.right},${bounds.bottom})` : "none";
}

function processAsset(fileName) {
  const filePath = path.join(FEATURE_DIRECTORY, fileName);
  const source = readPng(filePath);
  const before = getMetrics(source.pixels, source.width, source.height);
  if (!before.geometry || !before.weightedCenter) fail(`${fileName} has no visible alpha content`);

  const geometry = before.geometry;
  const cropBounds = {
    left: Math.max(0, geometry.left - EDGE_PADDING),
    top: Math.max(0, geometry.top - EDGE_PADDING),
    right: Math.min(source.width - 1, geometry.right + EDGE_PADDING),
    bottom: Math.min(source.height - 1, geometry.bottom + EDGE_PADDING),
  };
  const outsidePadding = before.allVisible && (
    before.allVisible.left < cropBounds.left ||
    before.allVisible.top < cropBounds.top ||
    before.allVisible.right > cropBounds.right ||
    before.allVisible.bottom > cropBounds.bottom
  );
  if (outsidePadding) fail(`${fileName} has visible alpha farther than ${EDGE_PADDING}px beyond its alpha>${ALPHA_THRESHOLD} bbox`);

  const cropped = cropPixels(source, cropBounds);
  const cropMetrics = getMetrics(cropped.pixels, cropped.width, cropped.height);
  if (!cropMetrics.weightedCenter || !cropMetrics.geometry) fail(`${fileName} lost visible content while cropping`);
  const geometryWidth = geometry.right - geometry.left + 1;
  const geometryHeight = geometry.bottom - geometry.top + 1;
  const scale = TARGET_VISIBLE_SIZE / Math.max(geometryWidth, geometryHeight);
  const normalizedPixels = renderCentered(cropped, scale, cropMetrics.weightedCenter);
  const after = getMetrics(normalizedPixels, CANVAS_SIZE, CANVAS_SIZE);
  fs.writeFileSync(filePath, encodePng(normalizedPixels));

  console.log([
    fileName,
    `before bbox=${formatBounds(before.geometry)}`,
    `before center=${formatPoint(before.weightedCenter)}`,
    `crop=${cropped.width}x${cropped.height}`,
    `scale=${scale.toFixed(4)}`,
    `after bbox=${formatBounds(after.geometry)}`,
    `after center=${formatPoint(after.weightedCenter)}`,
  ].join("\t"));
}

if (!fs.existsSync(FEATURE_DIRECTORY)) fail(`missing feature icon directory: ${FEATURE_DIRECTORY}`);
const files = fs.readdirSync(FEATURE_DIRECTORY).filter((fileName) => fileName.toLowerCase().endsWith(".png")).sort();
if (!files.length) fail(`no PNG assets found in ${FEATURE_DIRECTORY}`);

console.log(`Normalizing ${files.length} feature PNGs (alpha>${ALPHA_THRESHOLD}, padding=${EDGE_PADDING}px, target=${TARGET_VISIBLE_SIZE}px, canvas=${CANVAS_SIZE}px)`);
for (const fileName of files) processAsset(fileName);
