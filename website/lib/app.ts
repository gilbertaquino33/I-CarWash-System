// Where customers download the I-CarWash Android app.
//
// The app isn't on Google Play yet, so this is the APK from the latest EAS
// build (`eas build:list` -> "Application Archive URL"). After a new
// `eas build`, set NEXT_PUBLIC_APP_DOWNLOAD_URL on the host (e.g. Vercel ->
// Settings -> Environment Variables) or replace the fallback below.
export const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ||
  "https://expo.dev/artifacts/eas/axcpg2nksJbLVORNRskXjUxOUXJJm7l8H74RLo0hVvY.apk";
