import { Capacitor } from '@capacitor/core';

/** Running inside the Android app (rather than a browser). */
export const isNativeApp = Capacitor.isNativePlatform();

/** Where changes are kept when they can't be saved anywhere else. */
export const KEPT_HERE = isNativeApp ? 'in this app' : 'in this browser';

/** The hosted website, for links that have to open outside the app (e.g. confirming your email). */
export const SITE_URL = 'https://kairos-xelisce.vercel.app';

/**
 * Save a text file. In a browser it downloads; in the Android app (where downloads don't work)
 * it opens the share sheet, so you can save it to Files or Drive, or send it somewhere.
 */
export async function saveTextFile(name: string, text: string, type = 'application/json') {
  if (!isNativeApp) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri] });
  } catch {
    // Closing the share sheet without picking anything isn't an error.
  }
}
