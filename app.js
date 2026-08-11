"use strict";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const uploadIcon = document.getElementById("uploadIcon");
const dropTitle = document.getElementById("dropTitle");
const dropDescription = document.getElementById("dropDescription");
const selectedFileElement = document.getElementById("selectedFile");

const maxSizeInput = document.getElementById("maxSize");
const maxWidthInput = document.getElementById("maxWidth");
const maxHeightInput = document.getElementById("maxHeight");
const formatInput = document.getElementById("format");

const presetButtons = document.querySelectorAll(".preset-btn");
const compressBtn = document.getElementById("compressBtn");

const status = document.getElementById("status");
const errorBox = document.getElementById("error");

const preview = document.getElementById("preview");
const originalPreview = document.getElementById("originalPreview");
const resultPreview = document.getElementById("resultPreview");

const originalInfo = document.getElementById("originalInfo");
const resultInfo = document.getElementById("resultInfo");

const resultSize = document.getElementById("resultSize");
const saving = document.getElementById("saving");
const downloadBtn = document.getElementById("downloadBtn");

const privacyButton = document.getElementById("privacyButton");
const privacyModal = document.getElementById("privacyModal");
const privacyClose = document.getElementById("privacyClose");

let selectedFile = null;
let originalObjectUrl = null;
let resultObjectUrl = null;
let selectedImageSource = null;

const MAX_INPUT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_TIFF_PIXELS = 20_000_000;
const MAX_TIFF_IFDS = 20;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff"
]);

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|webp|tif|tiff)$/i;

const ALLOWED_OUTPUT_FORMATS = new Set([
  "image/jpeg",
  "image/webp",
  "image/png",
  "image/tiff"
]);

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function clearError() {
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

function setStatus(message) {
  status.textContent = message;
}

function clearResultUrl() {
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = null;
  }

  resultPreview.removeAttribute("src");
  downloadBtn.removeAttribute("href");
}

function clearOriginalUrl() {
  if (originalObjectUrl) {
    URL.revokeObjectURL(originalObjectUrl);
    originalObjectUrl = null;
  }

  originalPreview.removeAttribute("src");
}

function resetSelectedFileUI() {
  dropZone.classList.remove("selected");
  uploadIcon.textContent = "🖼️";
  dropTitle.textContent = "Drop your image here";
  dropDescription.textContent = "JPG, JPEG, PNG, WebP or TIFF";
  selectedFileElement.textContent = "";
  selectedFileElement.hidden = true;
}

function resetResult() {
  preview.style.display = "none";

  clearResultUrl();

  resultInfo.textContent = "";
  resultSize.textContent = "";
  saving.textContent = "";
}

function updateSelectedFileUI(file) {
  dropZone.classList.add("selected");

  uploadIcon.textContent = "✅";
  dropTitle.textContent = "Image selected";

  dropDescription.textContent =
    "Click here to choose a different image";

  selectedFileElement.textContent =
    `${file.name} · ${formatBytes(file.size)}`;

  selectedFileElement.hidden = false;
}

function updatePresetState(value) {
  presetButtons.forEach(button => {
    const buttonSize = Number(button.dataset.size);

    button.classList.toggle(
      "active",
      buttonSize === Number(value)
    );
  });
}

function isTiff(file) {
  const name = file.name.toLowerCase();

  return (
    file.type === "image/tiff" ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff")
  );
}

function isAllowedFile(file) {
  if (!(file instanceof File)) {
    return false;
  }

  if (file.size <= 0) {
    return false;
  }

  if (file.size > MAX_INPUT_FILE_BYTES) {
    throw new Error(
      `Please choose an image smaller than ${formatBytes(MAX_INPUT_FILE_BYTES)}.`
    );
  }

  const extensionMatches = ALLOWED_EXTENSIONS.test(file.name);

  if (
    !ALLOWED_MIME_TYPES.has(file.type) &&
    !extensionMatches
  ) {
    return false;
  }

  return true;
}

function validateDimensions(width, height, tiff = false) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error("Could not determine valid image dimensions.");
  }

  const pixels = width * height;
  const limit = tiff ? MAX_TIFF_PIXELS : MAX_IMAGE_PIXELS;

  if (pixels > limit) {
    throw new Error(
      `This image is too large to process safely. Maximum supported dimensions are ${formatBytes(limit)} pixels.`
    );
  }

  return true;
}

function validateCompressionSettings() {
  const maxSize = Number(maxSizeInput.value);
  const maxWidth = Number(maxWidthInput.value);
  const maxHeight = Number(maxHeightInput.value);
  const format = formatInput.value;

  if (
    !Number.isFinite(maxSize) ||
    maxSize < 1 ||
    maxSize > 10240
  ) {
    throw new Error(
      "Target file size must be between 1KB and 10240KB."
    );
  }

  if (
    !Number.isFinite(maxWidth) ||
    maxWidth < 1 ||
    maxWidth > 10000
  ) {
    throw new Error(
      "Maximum width must be between 1 and 10000 pixels."
    );
  }

  if (
    !Number.isFinite(maxHeight) ||
    maxHeight < 1 ||
    maxHeight > 10000
  ) {
    throw new Error(
      "Maximum height must be between 1 and 10000 pixels."
    );
  }

  if (!ALLOWED_OUTPUT_FORMATS.has(format)) {
    throw new Error("Invalid output format.");
  }

  return {
    maxSize,
    maxWidth: Math.floor(maxWidth),
    maxHeight: Math.floor(maxHeight),
    format
  };
}

presetButtons.forEach(button => {
  button.addEventListener("click", () => {
    const size = Number(button.dataset.size);

    if (!Number.isFinite(size)) {
      return;
    }

    maxSizeInput.value = String(size);

    updatePresetState(size);
    clearError();

    setStatus(`Target size set to ${size}KB.`);
  });
});

maxSizeInput.addEventListener("input", () => {
  updatePresetState(maxSizeInput.value);
});

async function loadStandardImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      try {
        validateDimensions(
          image.naturalWidth,
          image.naturalHeight
        );

        resolve(image);
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      reject(
        new Error("Could not read this image.")
      );
    };

    image.src = url;
  });
}

async function loadTiffImage(file) {
  const buffer = await file.arrayBuffer();

  if (buffer.byteLength > MAX_INPUT_FILE_BYTES) {
    throw new Error(
      "This TIFF file is too large to process safely."
    );
  }

  let ifds;

  try {
    ifds = UTIF.decode(buffer);
  } catch {
    throw new Error(
      "Could not safely decode this TIFF image."
    );
  }

  if (!ifds || ifds.length === 0) {
    throw new Error("Could not read this TIFF image.");
  }

  if (ifds.length > MAX_TIFF_IFDS) {
    throw new Error(
      "This TIFF contains too many image pages to process safely."
    );
  }

  const ifd = ifds[0];

  if (!ifd) {
    throw new Error("Could not read the TIFF image.");
  }

  const width = Number(ifd.width);
  const height = Number(ifd.height);

  validateDimensions(width, height, true);

  try {
    UTIF.decodeImage(buffer, ifd);
  } catch {
    throw new Error(
      "Could not decode this TIFF image."
    );
  }

  const rgba = UTIF.toRGBA8(ifd);

  if (!rgba || rgba.length === 0) {
    throw new Error(
      "Could not convert this TIFF image."
    );
  }

  const expectedBytes = width * height * 4;

  if (rgba.length < expectedBytes) {
    throw new Error(
      "The TIFF image data appears to be incomplete."
    );
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    alpha: true
  });

  if (!context) {
    throw new Error(
      "Your browser could not create a canvas."
    );
  }

  const imageData =
    context.createImageData(width, height);

  imageData.data.set(
    rgba.subarray(0, expectedBytes)
  );

  context.putImageData(imageData, 0, 0);

  return canvas;
}

async function loadImage(file) {
  if (isTiff(file)) {
    return loadTiffImage(file);
  }

  return loadStandardImage(file);
}

async function createPreviewUrlFromTiff(image) {
  const blob = await new Promise((resolve, reject) => {
    image.toBlob(
      result => {
        if (!result) {
          reject(
            new Error(
              "Could not create TIFF preview."
            )
          );

          return;
        }

        resolve(result);
      },
      "image/png"
    );
  });

  return URL.createObjectURL(blob);
}

function createCanvas(image, width, height) {
  validateDimensions(
    width,
    height
  );

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext(
    "2d",
    {
      alpha: true
    }
  );

  if (!context) {
    throw new Error(
      "Your browser could not create a canvas."
    );
  }

  context.drawImage(
    image,
    0,
    0,
    width,
    height
  );

  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(
            new Error(
              "Browser could not create the image."
            )
          );

          return;
        }

        resolve(blob);
      },
      type,
      quality
    );
  });
}

function canvasToTiff(canvas) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "Could not access the image canvas."
    );
  }

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const tiffBuffer = UTIF.encodeImage(
    imageData.data,
    canvas.width,
    canvas.height
  );

  if (!tiffBuffer) {
    throw new Error(
      "Could not create TIFF output."
    );
  }

  return new Blob(
    [tiffBuffer],
    {
      type: "image/tiff"
    }
  );
}

function calculateDimensions(
  originalWidth,
  originalHeight,
  maxWidth,
  maxHeight
) {
  validateDimensions(
    originalWidth,
    originalHeight
  );

  const widthRatio =
    maxWidth / originalWidth;

  const heightRatio =
    maxHeight / originalHeight;

  const ratio = Math.min(
    1,
    widthRatio,
    heightRatio
  );

  return {
    width: Math.max(
      1,
      Math.round(originalWidth * ratio)
    ),

    height: Math.max(
      1,
      Math.round(originalHeight * ratio)
    )
  };
}

async function encode(
  image,
  width,
  height,
  format,
  quality
) {
  const canvas = createCanvas(
    image,
    width,
    height
  );

  if (format === "image/tiff") {
    const blob = canvasToTiff(canvas);

    return {
      blob,
      width,
      height
    };
  }

  const blob = await canvasToBlob(
    canvas,
    format,
    quality
  );

  return {
    blob,
    width,
    height
  };
}

async function compressWithQuality(
  image,
  width,
  height,
  format,
  targetBytes
) {
  let low = 0.05;
  let high = 0.95;
  let best = null;

  const highResult = await encode(
    image,
    width,
    height,
    format,
    high
  );

  if (highResult.blob.size <= targetBytes) {
    return highResult;
  }

  const lowResult = await encode(
    image,
    width,
    height,
    format,
    low
  );

  if (lowResult.blob.size > targetBytes) {
    return null;
  }

  best = lowResult;

  for (let i = 0; i < 9; i++) {
    const middle = (low + high) / 2;

    const result = await encode(
      image,
      width,
      height,
      format,
      middle
    );

    if (result.blob.size <= targetBytes) {
      best = result;
      low = middle;
    } else {
      high = middle;
    }
  }

  return best;
}

async function compressPng(
  image,
  width,
  height,
  targetBytes
) {
  let currentWidth = width;
  let currentHeight = height;

  for (let i = 0; i < 10; i++) {
    const result = await encode(
      image,
      currentWidth,
      currentHeight,
      "image/png"
    );

    if (result.blob.size <= targetBytes) {
      return result;
    }

    currentWidth = Math.max(
      1,
      Math.floor(currentWidth * 0.85)
    );

    currentHeight = Math.max(
      1,
      Math.floor(currentHeight * 0.85)
    );
  }

  return null;
}

async function compressTiff(
  image,
  width,
  height,
  targetBytes
) {
  let currentWidth = width;
  let currentHeight = height;

  for (let i = 0; i < 20; i++) {
    const result = await encode(
      image,
      currentWidth,
      currentHeight,
      "image/tiff"
    );

    if (result.blob.size <= targetBytes) {
      return result;
    }

    currentWidth = Math.max(
      1,
      Math.floor(currentWidth * 0.85)
    );

    currentHeight = Math.max(
      1,
      Math.floor(currentHeight * 0.85)
    );

    if (
      currentWidth <= 1 ||
      currentHeight <= 1
    ) {
      break;
    }
  }

  return null;
}

async function compressImage(
  image,
  targetBytes,
  maxWidth,
  maxHeight,
  format
) {
  const dimensions = calculateDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxWidth,
    maxHeight
  );

  let result;

  if (format === "image/png") {
    result = await compressPng(
      image,
      dimensions.width,
      dimensions.height,
      targetBytes
    );
  } else if (format === "image/tiff") {
    result = await compressTiff(
      image,
      dimensions.width,
      dimensions.height,
      targetBytes
    );
  } else {
    result = await compressWithQuality(
      image,
      dimensions.width,
      dimensions.height,
      format,
      targetBytes
    );
  }

  if (result) {
    return result;
  }

  let width =
    Math.max(
      1,
      Math.floor(dimensions.width * 0.85)
    );

  let height =
    Math.max(
      1,
      Math.floor(dimensions.height * 0.85)
    );

  for (let i = 0; i < 8; i++) {
    if (width < 1 || height < 1) {
      break;
    }

    if (format === "image/png") {
      result = await compressPng(
        image,
        width,
        height,
        targetBytes
      );
    } else if (format === "image/tiff") {
      result = await compressTiff(
        image,
        width,
        height,
        targetBytes
      );
    } else {
      result = await compressWithQuality(
        image,
        width,
        height,
        format,
        targetBytes
      );
    }

    if (result) {
      return result;
    }

    width = Math.max(
      1,
      Math.floor(width * 0.85)
    );

    height = Math.max(
      1,
      Math.floor(height * 0.85)
    );
  }

  return null;
}

async function handleFile(file) {
  clearError();

  clearResultUrl();
  clearOriginalUrl();

  selectedFile = null;
  selectedImageSource = null;

  resetResult();
  resetSelectedFileUI();

  compressBtn.disabled = true;
  setStatus("");

  if (!file) {
    return;
  }

  try {
    if (!isAllowedFile(file)) {
      throw new Error(
        "Please choose a JPG, JPEG, PNG, WebP or TIFF image."
      );
    }

    setStatus(
      isTiff(file)
        ? "Reading TIFF image..."
        : "Reading image..."
    );

    const image = await loadImage(file);

    const imageWidth =
      image.naturalWidth || image.width;

    const imageHeight =
      image.naturalHeight || image.height;

    validateDimensions(
      imageWidth,
      imageHeight,
      isTiff(file)
    );

    selectedFile = file;
    selectedImageSource = image;

    if (isTiff(file)) {
      originalObjectUrl =
        await createPreviewUrlFromTiff(image);
    } else {
      originalObjectUrl =
        URL.createObjectURL(file);
    }

    originalPreview.src =
      originalObjectUrl;

    originalInfo.textContent =
      `${formatBytes(file.size)} · ` +
      `${imageWidth} × ${imageHeight}px`;

    updateSelectedFileUI(file);

    compressBtn.disabled = false;

    setStatus(
      "Image ready to compress."
    );

  } catch (error) {
    selectedFile = null;
    selectedImageSource = null;

    compressBtn.disabled = true;

    showError(
      error instanceof Error
        ? error.message
        : "Could not read this image. Please try another file."
    );

    setStatus("");
  }
}

fileInput.addEventListener(
  "change",
  event => {
    const file =
      event.target.files &&
      event.target.files[0];

    void handleFile(file);
  }
);

dropZone.addEventListener(
  "dragover",
  event => {
    event.preventDefault();

    dropZone.classList.add(
      "drag-over"
    );
  }
);

dropZone.addEventListener(
  "dragleave",
  () => {
    dropZone.classList.remove(
      "drag-over"
    );
  }
);

dropZone.addEventListener(
  "drop",
  event => {
    event.preventDefault();

    dropZone.classList.remove(
      "drag-over"
    );

    const file =
      event.dataTransfer.files &&
      event.dataTransfer.files[0];

    void handleFile(file);
  }
);

compressBtn.addEventListener(
  "click",
  async () => {
    if (
      !selectedFile ||
      !selectedImageSource
    ) {
      return;
    }

    clearError();
    clearResultUrl();

    let settings;

    try {
      settings =
        validateCompressionSettings();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Invalid compression settings."
      );

      return;
    }

    const {
      maxSize,
      maxWidth,
      maxHeight,
      format
    } = settings;

    const targetBytes =
      maxSize * 1024;

    compressBtn.disabled = true;

    preview.style.display = "none";

    setStatus(
      format === "image/tiff"
        ? "Creating TIFF image..."
        : "Compressing image..."
    );

    try {
      const startTime =
        performance.now();

      const result =
        await compressImage(
          selectedImageSource,
          targetBytes,
          maxWidth,
          maxHeight,
          format
        );

      const duration =
        Math.round(
          performance.now() -
          startTime
        );

      if (!result) {
        throw new Error(
          "Could not reduce this image to the requested size."
        );
      }

      if (
        result.blob.size >
        targetBytes
      ) {
        throw new Error(
          "The image could not be compressed below the requested size."
        );
      }

      resultObjectUrl =
        URL.createObjectURL(
          result.blob
        );

      resultPreview.src =
        resultObjectUrl;

      resultInfo.textContent =
        `${formatBytes(result.blob.size)} · ` +
        `${result.width} × ${result.height}px`;

      resultSize.textContent =
        `${formatBytes(result.blob.size)} — Target ${maxSize} KB ✓`;

      const percentage =
        Math.max(
          0,
          Math.round(
            (
              1 -
              result.blob.size /
              selectedFile.size
            ) * 100
          )
        );

      if (
        result.blob.size <
        selectedFile.size
      ) {
        saving.textContent =
          `${percentage}% smaller · ` +
          `Processed in ${duration}ms`;
      } else {
        saving.textContent =
          `Processed in ${duration}ms`;
      }

      let extension = "jpg";

      if (
        format === "image/webp"
      ) {
        extension = "webp";
      }

      if (
        format === "image/png"
      ) {
        extension = "png";
      }

      if (
        format === "image/tiff"
      ) {
        extension = "tiff";
      }

      downloadBtn.href =
        resultObjectUrl;

      downloadBtn.download =
        `compressed-image.${extension}`;

      preview.style.display =
        "block";

      setStatus(
        "Compression complete."
      );

      if (
        window.innerWidth <= 600
      ) {
        preview.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }

    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Something went wrong while compressing the image."
      );

      setStatus("");

    } finally {
      compressBtn.disabled = false;
    }
  }
);

function openPrivacyModal() {
  privacyModal.hidden = false;
  privacyModal.classList.add("open");

  document.body.style.overflow = "hidden";

  privacyClose.focus();
}

function closePrivacyModal() {
  privacyModal.classList.remove("open");
  privacyModal.hidden = true;

  document.body.style.overflow = "";

  privacyButton.focus();
}

privacyButton.addEventListener(
  "click",
  openPrivacyModal
);

privacyClose.addEventListener(
  "click",
  closePrivacyModal
);

privacyModal.addEventListener(
  "click",
  event => {
    if (
      event.target === privacyModal
    ) {
      closePrivacyModal();
    }
  }
);

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      !privacyModal.hidden
    ) {
      closePrivacyModal();
    }
  }
);

window.addEventListener(
  "pagehide",
  () => {
    clearResultUrl();
    clearOriginalUrl();
  }
);

window.addEventListener(
  "beforeunload",
  () => {
    clearResultUrl();
    clearOriginalUrl();
  }
);
