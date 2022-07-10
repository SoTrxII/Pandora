import { injectable } from "inversify";
import { readFile } from "fs/promises";
import IClientBinding from "@dapr/dapr/interfaces/Client/IClientBinding";
import { IObjectStoreProxy } from "./objet-store-api";

@injectable()
export class DaprObjectStorageAdapter implements IObjectStoreProxy {
  constructor(private client: IClientBinding, private objStoreName: string) {}

  /**
   * Create a file on the chosen backend
   * /!\ Dapr doesn't support streaming right now, so the uploaded files have
   * to be buffered in memory as a B64 string (1.37 size of the file). /!\
   * @see https://github.com/dapr/components-contrib/issues/1487
   * @param filePath path to the file to upload
   * @param fileName name of the file to upload
   */
  async create(
    filePath: string,
    key: string
  ): Promise<Record<string, unknown>> {
    const b64 = await readFile(filePath, { encoding: "base64" });
    return (await this.client.send(this.objStoreName, "create", b64, {
      key: key,
    })) as Record<string, unknown>;
  }

  /**
   * Retrieve a file from the chosen backend
   * /!\ All files data will have to be buffered into memory as a base 64 string /!\
   * @see https://github.com/dapr/components-contrib/issues/1487
   * @param key
   */
  async retrieve(key: string): Promise<Buffer> {
    const file = (await this.client.send(this.objStoreName, "get", undefined, {
      key: key,
    })) as unknown as string;
    return Buffer.from(file, "base64");
  }

  /**
   * Delete a file from the chosen backend
   * Attempting to delete a non-existing file will just ignore the deletion
   * @param key
   */
  async delete(key: string): Promise<void> {
    await this.client.send(this.objStoreName, "delete", undefined, {
      key: key,
    });
  }

  /**
   * List all files on the chosen backend
   * @param opt
   */
  async list(opt?: Record<string, unknown>): Promise<Record<string, any>> {
    // Note, we can't assign types here because the actual type depend on the backend object storage used
    return (await this.client.send(this.objStoreName, "list", opt)) as Record<
      string,
      any
    >;
  }
}
