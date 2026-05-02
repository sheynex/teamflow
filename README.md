# ARCAD Project Flow

A modern web application for project management, document storage, and employee time tracking.

## Setup Instructions

### Firebase Setup
1. Run the `set_up_firebase` tool to initialize Firestore and Authentication.
2. **Note on Storage Rules**: If you experience "permission-denied" errors when uploading files, you must manually set the Storage rules in your Firebase Console:
   - Go to the **Storage** section in the [Firebase Console](https://console.firebase.google.com/).
   - Click on the **Rules** tab.
   - Copy the contents of the `storage.rules` file in this project and paste them into the console.
   - Click **Publish**.

## Features

- **User Authentication**: Secure login and signup via Firebase Auth.
- **Dashboard**: Overview of active tasks, documents, and team status.
- **Task Management**: Create, assign, and track tasks with priority and status.
- **Document Management**: Upload and organize project files via Firebase Storage.
- **Time Tracking**: Clock in/out with real-time timer and weekly summaries in Firestore.
- **Activity Log**: Audit trail of all system actions.

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Lucide Icons, Date-fns.
- **Backend**: Firebase (Auth, Firestore, Storage).
- **Styling**: Tailwind CSS with custom theme.

## Setup Instructions

1. **Firebase Setup**:
   - Create a new project at [Firebase Console](https://console.firebase.google.com/).
   - Enable Authentication (Email/Password, Google).
   - Create a Firestore Database.
   - Create a Storage Bucket named `documents`.

2. **Environment Variables**:
   - Fill in your Firebase configuration in the AI Studio Secrets panel.

3. **Installation**:
   ```bash
   npm install
   ```

4. **Run Locally**:
   ```bash
   npm run dev
   ```

## Project Structure

- `/src/components`: Reusable UI components.
- `/src/pages`: Main application pages.
- `/src/contexts`: React contexts (Auth).
- `/src/lib`: Utility functions and Supabase client.
- `/src/types`: TypeScript interfaces.
