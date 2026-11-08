import type { CaptureMetadata } from "../shared/types";
export type RecordingDraft = CaptureMetadata & {
  sessionId: string;
  mimeType: string;
  status: "recording" | "paused" | "ready" | "interrupted";
  bytes: number;
  chunkCount: number;
  elapsed: number;
};
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("talkweave-recordings", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("drafts", { keyPath: "sessionId" });
      const chunks = db.createObjectStore("chunks", {
        keyPath: ["sessionId", "index"],
      });
      chunks.createIndex("session", "sessionId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error("Close other TalkWeave tabs to open recording storage."),
      );
  });
}
async function transaction(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => void,
) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      work(tx);
    });
  } finally {
    db.close();
  }
}
export async function readRecording(
  sessionId: string,
): Promise<{ draft?: RecordingDraft; chunks: Blob[] }> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["drafts", "chunks"], "readonly");
      const meta = tx.objectStore("drafts").get(sessionId);
      const parts = tx.objectStore("chunks").index("session").getAll(sessionId);
      tx.oncomplete = () =>
        resolve({
          draft: meta.result,
          chunks: parts.result
            .sort(
              (a: { index: number }, b: { index: number }) => a.index - b.index,
            )
            .map((v: { blob: Blob }) => v.blob),
        });
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const createRecording = (draft: RecordingDraft) =>
  transaction(["drafts"], "readwrite", (tx) => {
    tx.objectStore("drafts").add(draft);
  });
export const saveRecording = (
  draft: RecordingDraft,
  chunk?: { index: number; blob: Blob },
) =>
  transaction(["drafts", "chunks"], "readwrite", (tx) => {
    tx.objectStore("drafts").put(draft);
    if (chunk)
      tx.objectStore("chunks").put({ sessionId: draft.sessionId, ...chunk });
  });
export const deleteRecording = (sessionId: string) =>
  transaction(["drafts", "chunks"], "readwrite", (tx) => {
    tx.objectStore("drafts").delete(sessionId);
    const request = tx
      .objectStore("chunks")
      .index("session")
      .openKeyCursor(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        tx.objectStore("chunks").delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  });
