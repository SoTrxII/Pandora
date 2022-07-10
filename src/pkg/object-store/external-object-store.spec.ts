import "reflect-metadata";
import { ExternalObjectStore } from "./external-objet-store";
import { basename, join } from "path";
import { Arg, Substitute } from "@fluffy-spoon/substitute";
import { DaprObjectStorageAdapter } from "./dapr-object-storage-adapter";
import { ObjectStoreError } from "./objet-store-api";

describe("External Object Store", () => {
  const sampleFile = join(__dirname, "../../assets/welcome.opus");
  const sampleKey = basename(sampleFile);
  const notAFile = join(__dirname, "../../assets/idonotexist.opus");

  describe("Check if file exists", () => {
    const objStore = getObjStore();

    it("Ok", async () => {
      await expect(
        objStore.assertFileExists(sampleFile, sampleFile)
      ).resolves.not.toThrow();
    });
    it("Ko", async () => {
      await expect(objStore.assertFileExists(notAFile)).rejects.toThrow();
    });
    it("Mixed, one ok, one ko", async () => {
      await expect(
        objStore.assertFileExists(sampleFile, notAFile)
      ).rejects.toThrow();
    });
  });

  describe("Saving...", () => {
    it("a file that doesn't exists", async () => {
      const objStore = getObjStore();
      await expect(objStore.create(notAFile)).rejects.toThrow();
    });
    it("an existing file", async () => {
      const objStore = getObjStore();
      await expect(objStore.create(sampleFile)).resolves.not.toThrow();
    });
    it("an existing file but failing", async () => {
      const objStore = getObjStore({ create: true });
      await expect(objStore.create(sampleFile)).rejects.toThrowError(
        ObjectStoreError
      );
    });
  });

  describe("Retrieving...", () => {
    it("with ok key", async () => {
      const objStore = getObjStore();
      await expect(objStore.retrieve()).resolves.not.toThrow();
    });
    it("an existing file but failing", async () => {
      const objStore = getObjStore({ retrieve: true });
      await expect(objStore.retrieve(sampleKey)).rejects.toThrowError(
        ObjectStoreError
      );
    });
  });

  describe("Deleting...", () => {
    it("with ok key", async () => {
      const objStore = getObjStore();
      await expect(objStore.delete()).resolves.not.toThrow();
    });
    it("an existing file but failing", async () => {
      const objStore = getObjStore({ delete: true });
      await expect(objStore.delete(sampleKey)).rejects.toThrowError(
        ObjectStoreError
      );
    });
  });

  describe("Listing...", () => {
    it("with ok key", async () => {
      const objStore = getObjStore();
      await expect(objStore.list()).resolves.not.toThrow();
    });
    it("an existing file but failing", async () => {
      const objStore = getObjStore({ list: true });
      await expect(objStore.list()).rejects.toThrowError(ObjectStoreError);
    });
  });
});

/**
 * Return a object store with optionnaly failing methods for testing
 * @param fails
 */
function getObjStore(
  fails?: Partial<{
    create: boolean;
    retrieve: boolean;
    list: boolean;
    delete: boolean;
  }>
) {
  const methods = Object.assign(
    {},
    {
      create: false,
      retrieve: false,
      list: false,
      delete: false,
    },
    fails
  );

  const adapter = Substitute.for<DaprObjectStorageAdapter>();
  if (methods.create) adapter.create(Arg.all()).rejects("Test");
  if (methods.retrieve) adapter.retrieve(Arg.all()).rejects("Test");
  if (methods.list) adapter.list(Arg.all()).rejects("Test");
  if (methods.delete) adapter.delete(Arg.all()).rejects("Test");
  return new ExternalObjectStore(adapter);
}
