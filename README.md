# Backend for CampusOS App

This is the Node.js backend for the CampusOS mobile application, handling user authentication (signup/login) and post management.

## Technologies Used

- Node.js
- Express.js (for API routes)
- SQLite3 (file-based database)
- bcryptjs (for password hashing)
- CORS (for cross-origin requests)

## Getting Started

Follow these steps to set up and run the backend locally:

1.  **Navigate to the backend directory:**

    ```bash
    cd campusOS/backend
    ```

2.  **Install dependencies:**

    If you haven't already, install the necessary Node.js packages:

    ```bash
    npm install
    ```

3.  **Run the server:**

    Start the Express server:

    ```bash
    node server.js
    ```

    You should see a message in your terminal indicating that the server is running, usually on `http://localhost:3000`.

## Database

The backend uses SQLite, a lightweight, file-based database. The database file (`database.db`) will be automatically created in the `backend` directory when you run the server for the first time.

It contains two tables:
-   `users`: Stores user information (username, email, hashed password).
-   `posts`: Stores content uploaded/posted by users (userId, username, content, timestamp).

## API Endpoints

-   `POST /signup`: Register a new user.
    -   Request Body: `{ "username": "string", "email": "string", "password": "string" }`
    -   Response: `{ "message": "User registered successfully!", "userId": number }`

-   `POST /login`: Authenticate a user.
    -   Request Body: `{ "email": "string", "password": "string" }`
    -   Response: `{ "message": "Logged in successfully!", "userId": number, "username": "string" }`

-   `POST /posts`: Create a new post.
    -   Request Body: `{ "userId": number, "username": "string", "content": "string" }`
    -   Response: `{ "message": "Post created successfully!", "postId": number }`

-   `GET /posts`: Retrieve all posts.
    -   Response: `[ { "id": number, "userId": number, "username": "string", "content": "string", "timestamp": "datetime" } ]` 