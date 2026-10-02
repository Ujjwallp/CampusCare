// ─── APP CONFIGURATION ───
// Accounts allowed into the Administrator Console.
export const ADMIN_EMAILS = ['admin@iiitg.ac.in'];

// Campus e-mail domain: every campus user (student, faculty, staff) signs in with it.
export const CAMPUS_DOMAIN = '@iiitg.ac.in';

// Free Cloudinary account for photo AND video uploads — no backend, no card.
// Firebase Storage needs a billing account, so we use Cloudinary instead.
// Setup (2 minutes): see docs/MEDIA_SETUP.md. Until you fill these in, photos
// are compressed and stored inside Firestore (free) and videos are disabled.
export const CLOUDINARY_CLOUD_NAME = 'z4k6u0yg';
export const CLOUDINARY_UPLOAD_PRESET = 'CampusCare';  // unsigned preset

// Defaults for admin-editable settings (stored in Firestore: settings/app)
export const DEFAULT_SETTINGS = {
  meTooThreshold: 5,     // "Me too" count that makes a shared issue urgent
  lateHours: 48,         // open longer than this = late
  autoAssign: true,      // automatically give new tickets to a technician
};
