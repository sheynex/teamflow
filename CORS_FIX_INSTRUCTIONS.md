# Instructions to Fix Firebase Storage Uploads

The "Max retry time exceeded" and blocked uploads are almost always caused by **CORS (Cross-Origin Resource Sharing)** policies on your Firebase Storage bucket.

## Step 1: Create the CORS configuration file
In your Cloud Shell or terminal, create a file named `cors.json` with this exact content:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

## Step 2: Identify your bucket name
Based on your configuration, your bucket name is likely:
`arcad-55475.firebasestorage.app`

However, if that gives a "Not Found" error, it might be:
`arcad-55475.appspot.com`

## Step 3: Run the command to apply CORS
Run this command in your terminal (replace `{BUCKET_NAME}` with one of the names above):

```bash
gcloud storage buckets update gs://{BUCKET_NAME} --cors-file=cors.json
```

**Example:**
`gcloud storage buckets update gs://arcad-55475.firebasestorage.app --cors-file=cors.json`

## Step 4: Update Security Rules
The "User does not have permission" error means your **Security Rules** are blocking the upload.

1. Go to your **Firebase Console** -> **Storage** -> **Rules** tab.
2. Replace the existing rules with these:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
3. Click **"Publish"**.

---

## Technical Summary of Changes
I have updated the application to:
1. Use direct `uploadBytes` for better compatibility.
2. Explicitly reference your bucket in the initialization.
3. Added better console logging to track the upload progress.
