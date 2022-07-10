import "reflect-metadata";
import { ExternalObjectStore } from "./external-objet-store";
import { basename, join } from "path";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { DaprObjectStorageAdapter } from "./dapr-object-storage-adapter";
import { DaprClient } from "@dapr/dapr";
import { ObjectStoreError } from "./objet-store-api";

describe("Object store :: Integration", () => {
  const objStore = new ExternalObjectStore(
    new DaprObjectStorageAdapter(new DaprClient().binding, "object-store")
  );
  const sampleFile = join(__dirname, "../../assets/welcome.opus");
  // Key used to retrieve the file
  const fileKey = basename(sampleFile);

  describe("Save a file", () => {
    it("Must create a file by its path", async () => {
      await expect(objStore.create(sampleFile)).resolves.not.toThrow();
    });
  });

  describe("Retrieve a file", () => {
    beforeAll(async () => {
      await objStore.create(sampleFile);
    });

    it("Must retrieve an existing file by its key", async () => {
      const fileMap = await objStore.retrieve(fileKey);
      expect(fileMap?.get(fileKey)).not.toBeUndefined();
    });

    it("Non existing key", async () => {
      await expect(objStore.retrieve("not-exist")).rejects.toThrowError(
        ObjectStoreError
      );
    });
  });

  describe("Delete a file", () => {
    beforeAll(async () => {
      await objStore.create(sampleFile);
    });
    it("Existing file", async () => {
      await expect(objStore.delete(fileKey)).resolves.not.toThrow();
    });

    it("Non-existant file", async () => {
      await objStore.delete(fileKey);
      await expect(objStore.delete(fileKey)).resolves.not.toThrow();
    });
  });

  describe("List", () => {
    it("Without options", async () => {
      const list = await objStore.list();
      console.log(list);
    });
    it("Prefix", async () => {
      const list = await objStore.list({ prefix: fileKey });
      console.log(list);
    });
  });

  describe("Integrity", () => {
    // This is a sanity check, data has to be encoded into base64 back and forth
    // and it wouldn't be too surprising to see it in the wrong format
    it("Saving and retrieving a file should not lead to any changes in the file content", async () => {
      const origHash = getMd5(await readFile(sampleFile));
      await expect(objStore.create(sampleFile)).resolves.not.toThrow();
      const fileMap = await objStore.retrieve(fileKey);
      const retrievedHash = getMd5(fileMap.get(fileKey));
      expect(retrievedHash).toEqual(origHash);
    });
  });
});

/**
 * Return md5 hash of provided data
 * @param data
 */
function getMd5(data: Buffer) {
  const hash = createHash("md5");
  hash.update(data);
  return hash.digest("hex");
}
