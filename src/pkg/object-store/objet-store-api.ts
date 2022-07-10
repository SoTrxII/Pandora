/**
 * Error throw when a problem was detected with the stoarge backend
 */
export class ObjectStoreError extends Error {}
/**
 * Represents any object store sdk that could be used
 */
export interface IObjectStoreProxy {
  /**
   * Create a file on the proxy'ed object store
   * @param filePath path to the file to upload
   * @param key ID used to upload the file
   */
  create(filePath: string, key: string): Promise<Record<string, unknown>>;

  /**
   * Retrieve a file on the proxy'ed object store
   * @param key
   */
  retrieve(key: string): Promise<Buffer>;

  /**
   * Deletes a file on the proxy'ed object store
   * @param key
   */
  delete(key: string): Promise<void>;

  /**
   * List all files on the backend storage
   * @param opt
   */
  list(opt?: Record<string, unknown>): Promise<Record<string, any>>;
}

/**
 * Available options when listing items in a bucket
 */
export interface IBucketListingOptions {
  /** Max number of items to return */
  maxResults: number;
  /** When specified, only return items matching this prefix */
  prefix: string;
  /** Begin listing after this specific object key */
  marker: string;
  /** When querying multiple keys at the same time,
   * the delimiter used to split them */
  delimiter: string;
}

/**
 * A Bucket Item is an file uploaded on the external
 * object store
 */
export interface IBucketItem {
  /** Blob Etag */
  ETag: string;
  /** Key needed to retrieve the blob */
  Key: string;
  /** last modified UTC Date */
  LastModified: Date;
  /** Uploader info */
  Owner: {
    DisplayName: string;
    ID: string;
  };
  /** File size (bytes) */
  Size: bigint;
  /** Backend storage speed info */
  StorageClass: string;
}

/**
 * Info on a whole object store
 */
export interface IBucketListing {
  /** All of the keys (up to 1,000) rolled up into a common prefix
   * count as a single return when calculating the number of returns. */
  CommonPrefixes: null;
  /** File on the object store */
  Contents: IBucketItem[];
  /** Delimiter used to split the prefix when
   * searching for items in this bucket
   */
  Delimiter: string;
  /** Encoding of object key names in the response */
  EncodingType: string | null;
  /** True if only a part of the results were returned*/
  IsTruncated: boolean;
  /** marker from which to begin listing object */
  Marker: string;
  /** Maximum items returned */
  MaxKeys: number;
  /** Bucket Name */
  Name: string;
  /** Next marker to use for the "next page" of results */
  NextMarker: string;
  /** Prefix used to match the returned files */
  Prefix: string;
}
