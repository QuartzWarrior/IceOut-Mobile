package com.iceout.app;

import android.util.Log;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PushNotifications")
public class SafePushNotificationsPlugin extends PushNotificationsPlugin {
    private static final String TAG = "SafePushNotifications";

    private boolean isFirebaseAvailable() {
        try {
            Class<?> firebaseAppClass = Class.forName("com.google.firebase.FirebaseApp");
            Object firebaseApp = firebaseAppClass.getMethod("getInstance").invoke(null);
            return firebaseApp != null;
        } catch (Exception e) {
            Log.d(TAG, "Firebase not available: " + e.getMessage());
            return false;
        }
    }

    @Override
    @PluginMethod
    public void register(PluginCall call) {
        Log.d(TAG, "SafePushNotificationsPlugin.register() called");

        if (!isFirebaseAvailable()) {
            Log.e(TAG, "❌ Firebase not initialized - cannot register for push notifications");
            call.reject("Firebase not configured. Please add google-services.json to enable push notifications.", "FIREBASE_NOT_CONFIGURED");
            return;
        }

        try {
            Log.d(TAG, "✅ Firebase available, proceeding with registration");
            super.register(call);
        } catch (IllegalStateException e) {
            Log.e(TAG, "❌ IllegalStateException during registration (Firebase error)", e);
            call.reject("Firebase initialization error: " + e.getMessage(), "FIREBASE_ERROR");
        } catch (Exception e) {
            Log.e(TAG, "❌ Error during push notification registration", e);
            call.reject("Failed to register for push notifications: " + e.getMessage(), "REGISTRATION_ERROR");
        }
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        try {
            super.checkPermissions(call);
        } catch (Exception e) {
            Log.e(TAG, "Error checking permissions", e);
            call.reject("Error checking push notification permissions", e);
        }
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        try {
            super.requestPermissions(call);
        } catch (Exception e) {
            Log.e(TAG, "Error requesting permissions", e);
            call.reject("Error requesting push notification permissions", e);
        }
    }
}

