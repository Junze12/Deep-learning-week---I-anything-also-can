# Adaptive Learning Platform

## Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: SQLite (using `better-sqlite3`)
- **Authentication**: JWT

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at the App URL.

3. **Database**
   The SQLite database file `learning_platform.db` will be automatically created in the root directory upon server start.

## API Documentation & Postman Testing

### Authentication

**Register**
- POST `/api/auth/register`
- Body:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "learning_profile": {
      "preferred_study_time_per_day": 60,
      "target_grade": "A"
    }
  }
  ```

**Login**
- POST `/api/auth/login`
- Body:
  ```json
  {
    "email": "john@example.com",
    "password": "password123"
  }
  ```
- Response: Returns `token`. Use this token in the `Authorization` header for subsequent requests: `Bearer <token>`.

### Subjects

**Get Subjects**
- GET `/api/subjects`
- Headers: `Authorization: Bearer <token>`

**Create Subject**
- POST `/api/subjects`
- Headers: `Authorization: Bearer <token>`
- Body:
  ```json
  {
    "subject_name": "Mathematics",
    "exam_date": "2023-12-31"
  }
  ```

### Topics

**Get Topics**
- GET `/api/topics?subject_id=1`
- Headers: `Authorization: Bearer <token>`

**Create Topic**
- POST `/api/topics`
- Headers: `Authorization: Bearer <token>`
- Body:
  ```json
  {
    "subject_id": 1,
    "topic_name": "Algebra",
    "weight": 2
  }
  ```

### Questions

**Create Question**
- POST `/api/questions`
- Headers: `Authorization: Bearer <token>`
- Body:
  ```json
  {
    "topic_id": 1,
    "question_text": "What is 2 + 2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": "4",
    "difficulty": 1
  }
  ```

### Quiz

**Start Quiz**
- GET `/api/quiz?topic_id=1`
- Headers: `Authorization: Bearer <token>`

**Submit Quiz**
- POST `/api/quiz/submit`
- Headers: `Authorization: Bearer <token>`
- Body:
  ```json
  {
    "topic_id": 1,
    "answers": [
      {
        "question_id": 1,
        "selected_answer": "4",
        "time_spent_seconds": 5,
        "confidence_level": "high"
      }
    ]
  }
  ```

## Data Models (SQLite Schema)

**Users**
- `id`: INTEGER PK
- `name`: TEXT
- `email`: TEXT UNIQUE
- `password_hash`: TEXT
- `learning_profile`: Stored as individual columns (`preferred_study_time_per_day`, `target_grade`)

**Subjects**
- `id`: INTEGER PK
- `user_id`: INTEGER FK
- `subject_name`: TEXT

**Topics**
- `id`: INTEGER PK
- `subject_id`: INTEGER FK
- `topic_name`: TEXT

**Questions**
- `id`: INTEGER PK
- `topic_id`: INTEGER FK
- `question_text`: TEXT
- `options`: JSON TEXT
- `correct_answer`: TEXT
- `difficulty`: INTEGER

**Attempts**
- `id`: INTEGER PK
- `user_id`: INTEGER FK
- `question_id`: INTEGER FK
- `correct`: BOOLEAN
