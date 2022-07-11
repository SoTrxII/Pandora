/**
 * Interface to store and retrieve object from a remote location
 */
export interface IObjectStore {
  /**
   * Store the given files into the remote object storage
   * Files are uploaded with their basename as a key
   * If a file with the same key already exists, it will be overwritten
   * /!\ All files have to be buffered into memory before being uploaded /!\
   * @param filePaths files to upload
   * @throws Error if any of the files doesn't exist
   * @throws ObjectStoreError if any of the files wasn't uploaded
   * @returns number of file uploaded
   */
  create(...filePaths: string[]): Promise<number>;

  /**
   * Retrieve the given files from the remote object storage
   * /!\ All files data will have to be buffered into memory as a base 64 string /!\
   * @see https://github.com/dapr/components-contrib/issues/1487
   * @throws ObjectStoreError if any of the files doesn't exist on the storage backend
   * @param filenames
   */
  retrieve(...filenames: string[]): Promise<Map<string, Buffer>>;

  /**
   * Remove the given files from the remote object storage
   * Attempting to delete a non-existing file will just ignore the deletion
   * @throws ObjectStoreError if any deletion failed
   * @param filenames
   */
  delete(...filenames: string[]): Promise<void>;

  /**
   * List all files in the remote object storage
   * @param opt
   */
  list(opt?: Partial<IBucketListingOptions>): Promise<IBucketListing>;
}

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
