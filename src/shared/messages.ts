import type {
  GetAllMessage,
  SetValueMessage,
  DeleteKeyMessage,
  ImportMessage,
  StorageType,
} from "./types";

export function createGetAllMessage(storageType: StorageType): GetAllMessage {
  return { type: "GET_ALL", storageType };
}

export function createSetValueMessage(
  storageType: StorageType,
  key: string,
  value: string,
): SetValueMessage {
  return { type: "SET_VALUE", storageType, key, value };
}

export function createDeleteKeyMessage(
  storageType: StorageType,
  key: string,
): DeleteKeyMessage {
  return { type: "DELETE_KEY", storageType, key };
}

export function createImportMessage(
  storageType: StorageType,
  entries: Record<string, string>,
  clearFirst: boolean,
): ImportMessage {
  return { type: "IMPORT", storageType, entries, clearFirst };
}
