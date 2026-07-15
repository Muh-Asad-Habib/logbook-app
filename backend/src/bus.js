/**
 * Bus peristiwa internal — dipakai untuk siaran "ada perubahan data"
 * ke panel pemeliharaan (SSE), tanpa polling.
 */
import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(100); // banyak tab panel boleh mendengarkan bersamaan

/** Umumkan perubahan. jenis: "audit" | "aktivitas" | "data" */
export function siarkan(jenis) {
  bus.emit("live", jenis);
}

