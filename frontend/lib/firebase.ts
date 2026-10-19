import { getApp, getApps, initializeApp } from "firebase/app";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Google sign-in only appears when the Firebase web config is present in the environment. */
export const firebaseEnabled = !!(config.apiKey && config.projectId && config.appId);

/**
 * Opens Google's popup and returns a Firebase ID token for our API to verify.
 * Firebase is loaded on demand so it never weighs down pages that don't sign anyone in.
 */
export async function googleIdToken(): Promise<string> {
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import("firebase/auth");
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  const token = await result.user.getIdToken();
  await signOut(auth); // our own session takes over; keep no second login state in the browser
  return token;
}
