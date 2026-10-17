// Profile photos. User.profileImage holds one of:
//   "upload:<storageKey>"  a photo the user uploaded (POST /api/auth/photo)
//   "https://..."          the Google account photo (Google sign-in)
//   anything else          no photo (the old default "images/default-profile.png")

export const UPLOAD_PREFIX = "upload:";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

export function uploadedPhotoKey(profileImage: string) {
  return profileImage.startsWith(UPLOAD_PREFIX)
    ? profileImage.slice(UPLOAD_PREFIX.length)
    : null;
}

// Address for <img src>, or null when the user has no photo.
// Uploaded photos are served by GET /api/users/{id}/photo (?v= changes on update).
export function photoUrlOf(user: { id: string; profileImage: string; updatedAt: Date }) {
  if (uploadedPhotoKey(user.profileImage)) {
    return `/api/users/${user.id}/photo?v=${user.updatedAt.getTime()}`;
  }
  if (user.profileImage.startsWith("https://")) {
    return user.profileImage;
  }
  return null;
}
