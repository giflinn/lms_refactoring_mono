import admin from "firebase-admin";
import { config } from "./config";

export const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(config.firebaseServiceAccountPath),
});

export const firebaseAuth = firebaseApp.auth();
export const firebaseMessaging = firebaseApp.messaging();
