function fileToImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านรูปไม่สำเร็จ'));
    };
    image.src = url;
  });
}

export async function resizeImageFileToDataUrl(file: File, options?: { maxSide?: number }) {
  const image = await fileToImage(file);
  const maxSide = options?.maxSide ?? 1200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ย่อรูปไม่สำเร็จ');
  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of [0.78, 0.68, 0.58, 0.48]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= 2_700_000) return dataUrl;
  }

  throw new Error('รูปมีขนาดใหญ่เกินไป กรุณาถ่ายใหม่หรือเลือกรูปที่เล็กลง');
}
