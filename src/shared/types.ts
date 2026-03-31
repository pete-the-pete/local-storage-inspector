export type StorageType = "localStorage" | "sessionStorage";

export interface StorageEntry {
  key: string;
  value: string;
}

export interface GetAllMessage {
  type: "GET_ALL";
  storageType: StorageType;
}

export interface SetValueMessage {
  type: "SET_VALUE";
  storageType: StorageType;
  key: string;
  value: string;
}

export interface DeleteKeyMessage {
  type: "DELETE_KEY";
  storageType: StorageType;
  key: string;
}

export interface ImportMessage {
  type: "IMPORT";
  storageType: StorageType;
  entries: Record<string, string>;
  clearFirst: boolean;
}

export type StorageMessage = GetAllMessage | SetValueMessage | DeleteKeyMessage | ImportMessage;

export interface GetAllResponse {
  type: "GET_ALL_RESPONSE";
  entries: StorageEntry[];
}

export interface SetValueResponse {
  type: "SET_VALUE_RESPONSE";
  success: boolean;
}

export interface DeleteKeyResponse {
  type: "DELETE_KEY_RESPONSE";
  success: boolean;
}

export interface ImportResponse {
  type: "IMPORT_RESPONSE";
  success: boolean;
  count: number;
}

export type StorageResponse = GetAllResponse | SetValueResponse | DeleteKeyResponse | ImportResponse;

// --- Change Monitoring ---

export type StorageOperation = "setItem" | "removeItem" | "clear";
export type ChangeSource = "page" | "extension" | "unknown";

export interface StorageChangeEvent {
  storageType: StorageType;
  operation: StorageOperation;
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  timestamp: number;
  source: ChangeSource;
}

export interface StartRecordingMessage {
  type: "START_RECORDING";
}

export interface StopRecordingMessage {
  type: "STOP_RECORDING";
}

export interface SetExtensionFlagMessage {
  type: "SET_EXTENSION_FLAG";
}

export interface SetExtensionFlagResponse {
  type: "SET_EXTENSION_FLAG_RESPONSE";
  success: boolean;
}

export interface StorageChangePortMessage {
  type: "STORAGE_CHANGE";
  changes: StorageChangeEvent[];
}

export type MonitorMessage = StartRecordingMessage | StopRecordingMessage | SetExtensionFlagMessage;
export type MonitorResponse = SetExtensionFlagResponse;
