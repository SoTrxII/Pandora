import "reflect-metadata";
import { container } from "./inversify.config";
import { Craig } from "./craig";
import { TYPES } from "./types";

const craig = container.get<Craig>(TYPES.Craig);
craig.bootUp();
