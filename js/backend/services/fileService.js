// ─── FILE SERVICE ───
// Photo uploads: Cloudinary when configured, otherwise compressed images stored inline.
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../core/config.js';

function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

async function compressImage(file, maxDim = 1024, quality = 0.7) {
  const src = await readAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export const FileService = {
  cloudinaryReady() {
    return CLOUDINARY_CLOUD_NAME && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME'
      && CLOUDINARY_UPLOAD_PRESET && CLOUDINARY_UPLOAD_PRESET !== 'YOUR_UPLOAD_PRESET';
  },

  // opts.inline = true  → keep the file INSIDE Firestore (base64), never on
  // Cloudinary. Used for confidential reports, because Cloudinary URLs are
  // public; a file in Firestore is protected by the security rules instead.
  async uploadFile(file, pathFolder = 'chat_attachments', opts = {}) {
    if (!file) throw new Error("No file selected");
    const isVideo = (file.type || '').startsWith('video/');

    if (opts.inline) {
      if (isVideo) throw new Error("Videos can't be attached to a confidential report (they'd have to be stored publicly). Please attach a photo.");
      if (!file.type.startsWith('image/')) throw new Error("Only photos can be attached to a confidential report.");
      const dataUrl = await compressImage(file, 1024, 0.7);
      if (dataUrl.length > 700000) throw new Error("Photo is too large — please choose a smaller one.");
      return dataUrl;
    }

    // Cloudinary (free, no backend) handles both photos and videos.
    if (this.cloudinaryReady()) {
      const maxMB = isVideo ? 100 : 15;
      if (file.size > maxMB * 1024 * 1024) throw new Error(`That ${isVideo ? 'video' : 'file'} is too large (max ${maxMB} MB).`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('folder', 'campuscare/' + pathFolder);
      // 'auto' lets Cloudinary accept image OR video on the same endpoint.
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Upload failed. Check your Cloudinary upload preset is set to 'Unsigned'.");
      return (await response.json()).secure_url;
    }

    // No Cloudinary: photos are compressed and stored inline (free). Video needs Cloudinary.
    if (isVideo) throw new Error("To attach videos, set up a free Cloudinary account — see docs/MEDIA_SETUP.md.");
    if (file.type.startsWith('image/')) {
      const dataUrl = await compressImage(file, pathFolder === 'profile_photos' ? 400 : 1024, 0.7);
      if (dataUrl.length > 700000) throw new Error("Image is too large. Please choose a smaller photo.");
      return dataUrl;
    }
    throw new Error("Only images can be attached until Cloudinary is set up (see docs/MEDIA_SETUP.md).");
  },
};
