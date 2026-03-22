// Icon Generator — Run with Node.js to create placeholder icons
// Usage: node generate_icons.js
// Creates icon16.png, icon48.png, icon128.png in the icons/ directory

const fs = require('fs');
const path = require('path');

// Minimal PNG encoder for simple solid-color icons with a letter
function createPNG(size, bgColor, letter) {
  // Create raw pixel data (RGBA)
  const pixels = [];
  const [r, g, b] = bgColor;
  
  // Simple "J" letter definition (relative coordinates)
  const letterPixels = getLetterJ(size);
  
  for (let y = 0; y < size; y++) {
    pixels.push(0); // filter byte for each row
    for (let x = 0; x < size; x++) {
      if (letterPixels.has(`${x},${y}`)) {
        pixels.push(255, 255, 255, 255); // white letter
      } else {
        pixels.push(r, g, b, 255); // background
      }
    }
  }

  const rawData = Buffer.from(pixels);
  
  // Deflate the data
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  
  // Build PNG file
  const chunks = [];
  
  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8);       // bit depth
  ihdr.writeUInt8(6, 9);       // color type (RGBA)
  ihdr.writeUInt8(0, 10);      // compression
  ihdr.writeUInt8(0, 11);      // filter
  ihdr.writeUInt8(0, 12);      // interlace
  chunks.push(makeChunk('IHDR', ihdr));
  
  // IDAT
  chunks.push(makeChunk('IDAT', compressed));
  
  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));
  
  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([len, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getLetterJ(size) {
  const pixels = new Set();
  const margin = Math.floor(size * 0.2);
  const thick = Math.max(Math.floor(size * 0.18), 1);
  
  const left = margin;
  const right = size - margin;
  const top = margin;
  const bottom = size - margin;
  const mid = Math.floor((left + right) / 2);
  const jRight = mid + Math.floor(thick / 2);
  const jLeft = mid - Math.floor(thick / 2);
  
  // Top horizontal bar of J
  for (let x = left; x < right; x++) {
    for (let t = 0; t < thick; t++) {
      pixels.add(`${x},${top + t}`);
    }
  }
  
  // Vertical bar of J (right side of center)
  const stemX = mid;
  for (let y = top; y < bottom - thick; y++) {
    for (let t = -Math.floor(thick/2); t <= Math.floor(thick/2); t++) {
      pixels.add(`${stemX + t},${y}`);
    }
  }
  
  // Bottom curve of J (simple hook to the left)
  const hookBottom = bottom;
  const hookLeft = left + thick;
  
  // Bottom horizontal part
  for (let x = hookLeft; x <= stemX + Math.floor(thick/2); x++) {
    for (let t = 0; t < thick; t++) {
      pixels.add(`${x},${hookBottom - thick + t}`);
    }
  }
  
  // Left vertical part of hook
  for (let y = bottom - thick * 2; y < hookBottom; y++) {
    for (let t = 0; t < thick; t++) {
      pixels.add(`${hookLeft + t},${y}`);
    }
  }
  
  return pixels;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const bgColor = [79, 70, 229]; // #4F46E5

[16, 48, 128].forEach(size => {
  const png = createPNG(size, bgColor, 'J');
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png`);
});

console.log('All icons generated!');
