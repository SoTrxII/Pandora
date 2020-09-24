import "reflect-metadata";
import { container } from "./inversify.config";
import { Pandora } from "./Pandora";
import { TYPES } from "./types";

const pandora = container.get<Pandora>(TYPES.Pandora);
pandora.bootUp();
