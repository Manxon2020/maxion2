const canvas = document.querySelector("#paintCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const tools = document.querySelectorAll("[data-tool]");
const colorPicker = document.querySelector("#colorPicker");
const brushSize = document.querySelector("#brushSize");
const sizeReadout = document.querySelector("#sizeReadout");
const opacity = document.querySelector("#opacity");
const opacityReadout = document.querySelector("#opacityReadout");
const fillShape = document.querySelector("#fillShape");
const swatches = document.querySelector("#swatches");
const undoBtn = document.querySelector("#undoBtn");
const redoBtn = document.querySelector("#redoBtn");
const clearBtn = document.querySelector("#clearBtn");
const resizeBtn = document.querySelector("#resizeBtn");
const imageLoader = document.querySelector("#imageLoader");
const saveBtn = document.querySelector("#saveBtn");
const toolStatus = document.querySelector("#toolStatus");
const cursorStatus = document.querySelector("#cursorStatus");

const palette = [
  "#111827", "#ffffff", "#ef4444", "#f97316",
  "#facc15", "#22c55e", "#06b6d4", "#2563eb",
  "#7c3aed", "#ec4899", "#6b7280", "#a16207",
  "#0f766e", "#1e40af", "#86198f", "#020617"
];

let currentTool = "pencil";
let color = colorPicker.value;
let size = Number(brushSize.value);
let alpha = Number(opacity.value) / 100;
let isDrawing = false;
let start = { x: 0, y: 0 };
let last = { x: 0, y: 0 };
let previewImage = null;
let undoStack = [];
let redoStack = [];

function initCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveState();
  updateCanvasSizeStatus();
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((event.clientX - rect.left) * (canvas.width / rect.width)),
    y: Math.round((event.clientY - rect.top) * (canvas.height / rect.height))
  };
}

function saveState() {
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restore(imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
  updateCanvasSizeStatus();
}

function updateHistoryButtons() {
  undoBtn.disabled = undoStack.length <= 1;
  redoBtn.disabled = redoStack.length === 0;
}

function updateCanvasSizeStatus() {
  cursorStatus.textContent = `${canvas.width} x ${canvas.height} px`;
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
}

function setTool(toolName) {
  currentTool = toolName;
  tools.forEach((button) => button.classList.toggle("active", button.dataset.tool === toolName));
  const label = toolName === "picker" ? "Color picker" : toolName.charAt(0).toUpperCase() + toolName.slice(1);
  toolStatus.textContent = label;
  canvas.style.cursor = toolName === "text" ? "text" : toolName === "picker" ? "copy" : "crosshair";
}

function withAlpha(callback) {
  ctx.save();
  ctx.globalAlpha = alpha;
  callback();
  ctx.restore();
}

function drawLine(from, to, lineColor = color, lineWidth = size, lineAlpha = alpha) {
  ctx.save();
  ctx.globalAlpha = lineAlpha;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawSpray(point) {
  withAlpha(() => {
    ctx.fillStyle = color;
    const radius = Math.max(size, 4);
    const dots = Math.max(10, Math.round(size * 1.8));

    for (let i = 0; i < dots; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  });
}

function drawShape(from, to) {
  restore(previewImage);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const width = to.x - from.x;
  const height = to.y - from.y;
  ctx.beginPath();

  if (currentTool === "line") {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (currentTool === "rect") {
    ctx.rect(from.x, from.y, width, height);
  }

  if (currentTool === "circle") {
    ctx.ellipse(
      from.x + width / 2,
      from.y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2
    );
  }

  if (fillShape.checked) {
    ctx.fill();
  }

  ctx.stroke();
  ctx.restore();
}

function floodFill(x, y, fillColor) {
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const target = getPixel(data, x, y);
  const replacement = hexToRgba(fillColor, alpha);

  if (sameColor(target, replacement)) return false;

  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const offset = (py * canvas.width + px) * 4;
    const current = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    if (!sameColor(current, target)) continue;

    data[offset] = replacement[0];
    data[offset + 1] = replacement[1];
    data[offset + 2] = replacement[2];
    data[offset + 3] = replacement[3];

    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }

  ctx.putImageData(image, 0, 0);
  return true;
}

function getPixel(data, x, y) {
  const offset = (y * canvas.width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function hexToRgba(hex, colorAlpha = 1) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    Math.round(colorAlpha * 255)
  ];
}

function rgbaToHex(pixel) {
  return `#${pixel.slice(0, 3).map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function sameColor(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function placeText(point) {
  const text = window.prompt("Text to add:");
  if (!text) return false;

  withAlpha(() => {
    ctx.fillStyle = color;
    ctx.font = `${Math.max(size * 5, 18)}px "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(text, point.x, point.y);
  });
  return true;
}

function pickColor(point) {
  const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
  color = rgbaToHex(Array.from(pixel));
  colorPicker.value = color;
  toolStatus.textContent = `Picked ${color}`;
}

function resizeCanvas() {
  const width = Number(window.prompt("Canvas width in pixels:", canvas.width));
  if (!Number.isFinite(width) || width < 50 || width > 4000) return;

  const height = Number(window.prompt("Canvas height in pixels:", canvas.height));
  if (!Number.isFinite(height) || height < 50 || height > 4000) return;

  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snapshot, 0, 0);
  saveState();
  updateCanvasSizeStatus();
}

function importImage(file) {
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    ctx.drawImage(image, x, y, width, height);
    saveState();
    URL.revokeObjectURL(image.src);
    imageLoader.value = "";
  };
  image.src = URL.createObjectURL(file);
}

function startDrawing(event) {
  event.preventDefault();
  const point = getPoint(event);
  start = point;
  last = point;

  if (currentTool === "fill") {
    if (floodFill(point.x, point.y, color)) saveState();
    return;
  }

  if (currentTool === "picker") {
    pickColor(point);
    return;
  }

  if (currentTool === "text") {
    if (placeText(point)) saveState();
    return;
  }

  isDrawing = true;
  previewImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (currentTool === "spray") {
    drawSpray(point);
  }
}

function keepDrawing(event) {
  const point = getPoint(event);
  cursorStatus.textContent = `${point.x}, ${point.y} px`;
  if (!isDrawing) return;

  if (currentTool === "pencil") {
    drawLine(last, point);
    last = point;
  } else if (currentTool === "eraser") {
    drawLine(last, point, "#ffffff", size * 2, 1);
    last = point;
  } else if (currentTool === "spray") {
    drawSpray(point);
    last = point;
  } else {
    drawShape(start, point);
  }
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  previewImage = null;
  saveState();
}

function buildSwatches() {
  palette.forEach((swatchColor) => {
    const button = document.createElement("button");
    button.className = "swatch";
    button.type = "button";
    button.title = swatchColor;
    button.style.backgroundColor = swatchColor;
    button.addEventListener("click", () => {
      color = swatchColor;
      colorPicker.value = swatchColor;
    });
    swatches.appendChild(button);
  });
}

tools.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

colorPicker.addEventListener("input", (event) => {
  color = event.target.value;
});

brushSize.addEventListener("input", (event) => {
  size = Number(event.target.value);
  sizeReadout.textContent = `${size} px`;
});

opacity.addEventListener("input", (event) => {
  alpha = Number(event.target.value) / 100;
  opacityReadout.textContent = `${event.target.value}%`;
});

undoBtn.addEventListener("click", () => {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  restore(undoStack[undoStack.length - 1]);
  updateHistoryButtons();
});

redoBtn.addEventListener("click", () => {
  if (!redoStack.length) return;
  const image = redoStack.pop();
  undoStack.push(image);
  restore(image);
  updateHistoryButtons();
});

clearBtn.addEventListener("click", () => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveState();
});

resizeBtn.addEventListener("click", resizeCanvas);

imageLoader.addEventListener("change", (event) => {
  importImage(event.target.files[0]);
});

saveBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.download = `paint-drawing-${stamp}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoBtn.click();
  }

  if (event.ctrlKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoBtn.click();
  }
});

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", keepDrawing);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);

buildSwatches();
initCanvas();
