// S3 supports uploads up to 5 GB in a single request.
// Files above this size must use the multipart upload API.
export const MAX_SINGLE_UPLOAD_SIZE = 5_000_000_000;
