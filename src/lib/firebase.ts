import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your actual Firebase configuration
// You can get this from the Firebase Console specific to your project
const firebaseConfig = {
    apiKey: "AIzaSyArXwWHTEhgCvinhUQCH91IucRIPBjYS4A",
    authDomain: "mass-volunteer-scheduler.firebaseapp.com",
    projectId: "mass-volunteer-scheduler",
    storageBucket: "mass-volunteer-scheduler.firebasestorage.app",
    messagingSenderId: "721776905440",
    appId: "1:721776905440:web:9f1181eba0191f4af35485"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
