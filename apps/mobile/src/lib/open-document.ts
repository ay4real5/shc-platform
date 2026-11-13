import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_URL, ApiError, OfflineError } from './api';

/**
 * Opens a document the person was asked to sign (S3-06). The API needs the session token, so the app downloads the
 * file into its private cache and hands it to the phone's own viewer. The copy is replaced on the next open and the
 * cache folder is cleared when the person signs out (the OS may also clear it at any time).
 */
export async function openSignatureDocument(requestId: string, token: string | null): Promise<void> {
  if (!token) throw new ApiError(401, 'Your session has ended. Sign in again.');
  const folder = documentsFolder();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  let file: File;
  try {
    file = await File.downloadFileAsync(`${API_URL}/signature-requests/${requestId}/file`, folder, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true,
    });
  } catch (e) {
    const status = Number(/\b([45]\d\d)\b/.exec(String(e))?.[1] ?? 0);
    if (status) throw new ApiError(status, status === 404 ? 'This document is no longer available.' : 'Couldn’t open the document.');
    throw new OfflineError();
  }
  if (!(await Sharing.isAvailableAsync())) throw new ApiError(0, 'This phone can’t open documents from the app.');
  await Sharing.shareAsync(file.uri, { mimeType: file.type || undefined, dialogTitle: 'Open the document' });
}

function documentsFolder(): Directory {
  return new Directory(Paths.cache, 'shc-documents');
}

/** Removes downloaded documents (called on sign-out). Never throws. */
export function clearDownloadedDocuments(): void {
  try {
    const folder = documentsFolder();
    if (folder.exists) folder.delete();
  } catch {
    // Nothing to clear, or the OS already did.
  }
}
