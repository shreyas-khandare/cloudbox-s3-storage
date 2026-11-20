// AWS S3 single-request uploads are limited to 5 GB (decimal bytes).
// Larger objects must use the multipart upload API.
export const MAX_SINGLE_UPLOAD_SIZE = 5_000_000_000;

export const formatUploadLimitLabel = (bytes: number): string => {
  if (bytes === 100 * 1024 * 1024) return "100 MB";
  if (bytes === 3 * 1024 * 1024 * 1024) return "3 GB";
  if (bytes === MAX_SINGLE_UPLOAD_SIZE) return "5 GB";

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${bytes} bytes`;
};
