import { inject, injectable } from "inversify";
import { access } from "fs/promises";
import { constants } from "fs";
import { basename } from "path";
import {
  IBucketListing,
  IBucketListingOptions,
  IObjectStoreProxy,
  ObjectStoreError,
} from "./objet-store-api";
import { TYPES } from "../../types";

@injectable()
export class ExternalObjectStore {
  constructor(
    @inject(TYPES.ObjectStoreProxy)
    private readonly objStoreProxy: IObjectStoreProxy
  ) {}

  async create(...filePaths: string[]): Promise<number> {
    await this.assertFileExists(...filePaths);

    const uploads = await Promise.allSettled(
      filePaths.map((p) => this.objStoreProxy.create(p, basename(p)))
    );
    const failedUploads = uploads.filter((up) => up.status === "rejected");

    if (failedUploads.length > 0)
      throw new ObjectStoreError(
        failedUploads
          .map((fail: PromiseRejectedResult) => fail.reason)
          .join("\n")
      );
    return uploads.length;
  }

  async retrieve(...filenames: string[]): Promise<Map<string, Buffer>> {
    // Attempt to download all files concurrently
    const downloads = await Promise.allSettled(
      filenames.map((name) => this.objStoreProxy.retrieve(name))
    );

    // If any downloads failed, abort all
    const failedDownloads = downloads.filter((up) => up.status === "rejected");
    if (failedDownloads.length > 0)
      throw new ObjectStoreError(
        failedDownloads
          .map((fail: PromiseRejectedResult) => fail.reason)
          .join("\n")
      );

    // Return a map name -> data
    const fileMap = new Map<string, Buffer>();
    downloads.forEach((dl: PromiseFulfilledResult<any>, index) =>
      fileMap.set(filenames.at(index), Buffer.from(dl.value, "base64"))
    );
    return fileMap;
  }

  async delete(...filenames: string[]): Promise<void> {
    // Attempt to delete all files concurrently
    const deletions = await Promise.allSettled(
      filenames.map((name) => this.objStoreProxy.delete(name))
    );

    // If any deletions failed (wrong ACL ?)
    const failedDeletions = deletions.filter((up) => up.status === "rejected");
    if (failedDeletions.length > 0)
      throw new ObjectStoreError(
        failedDeletions
          .map((fail: PromiseRejectedResult) => fail.reason)
          .join("\n")
      );
  }

  async list(opt?: Partial<IBucketListingOptions>): Promise<IBucketListing> {
    try {
      return (await this.objStoreProxy.list(opt)) as IBucketListing;
    } catch (e) {
      throw new ObjectStoreError(e);
    }
  }

  /**
   * Throws if any of the file does not exist and can't be read
   * @param files
   */
  async assertFileExists(...files: string[]): Promise<void> {
    const fileExists = await Promise.allSettled(
      files.map(async (p) => access(p, constants.F_OK | constants.R_OK))
    );
    const nonExistingFiles = fileExists.filter((p) => p.status === "rejected");
    if (nonExistingFiles.length > 0) {
      const error = nonExistingFiles
        .map((p: PromiseRejectedResult) => p.reason)
        .join("\n");
      throw new Error(error);
    }
  }
}
