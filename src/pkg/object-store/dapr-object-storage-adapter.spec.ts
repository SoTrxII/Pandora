import "reflect-metadata";
import { DaprObjectStorageAdapter } from "./dapr-object-storage-adapter";
import { Substitute } from "@fluffy-spoon/substitute";
import IClientBinding from "@dapr/dapr/interfaces/Client/IClientBinding";
import { join } from "path";

describe("Dapr Object storage adapter", () => {
  const sampleFile = join(__dirname, "../../assets/welcome.opus");

  const adapter = new DaprObjectStorageAdapter(
    Substitute.for<IClientBinding>(),
    "test"
  );

  // These are pass through methods, only checking if they are throwing

  it("Create", async () => {
    await expect(adapter.create(sampleFile, "test")).resolves.not.toThrow();
  });

  it("Delete", async () => {
    await expect(adapter.delete("test")).resolves.not.toThrow();
  });

  it("Retrieve", async () => {
    // It won't be able to create he buffer from the mock object
    await expect(adapter.retrieve("test")).rejects.toThrowError(
      "The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received function [class SubstituteJS] -> name"
    );
  });

  it("List", async () => {
    await expect(adapter.list()).resolves.not.toThrow();
  });
});
