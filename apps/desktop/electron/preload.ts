import { contextBridge, ipcRenderer } from "electron";
import type { IpcInvoke, IpcEvents, AppState } from "./types";

const api = {
  invoke<K extends keyof IpcInvoke>(channel: K, ...args: Parameters<IpcInvoke[K]>) {
    return ipcRenderer.invoke(channel as string, ...args) as Promise<ReturnType<IpcInvoke[K]>>;
  },
  on<K extends keyof IpcEvents>(channel: K, listener: IpcEvents[K]) {
    const wrapped = (_: unknown, payload: AppState) => (listener as (s: AppState) => void)(payload);
    ipcRenderer.on(channel as string, wrapped);
    return () => ipcRenderer.removeListener(channel as string, wrapped);
  },
};

contextBridge.exposeInMainWorld("openStory", api);
export type OpenStoryApi = typeof api;
