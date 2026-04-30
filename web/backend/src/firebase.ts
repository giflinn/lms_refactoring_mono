import admin from "firebase-admin";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set");
}

export const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

export const firebaseAuth = firebaseApp.auth();
