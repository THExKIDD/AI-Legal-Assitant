# AI Legal Assistant for Common Laws

## About the Project
AI Legal Assistant for Common Laws is an AI-powered chatbot that helps users understand common Indian legal topics in simple language. It provides general legal information and helps users explore relevant legal documents.

## Features
- User signup and login
- AI-powered legal question answering
- Concise and detailed answers
- Legal document search using ChromaDB
- Chat history
- Save legal answers
- Feedback system
- Error handling when backend services are unavailable

## Technologies Used
- **Frontend:** React.js, HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **AI Service:** Python, FastAPI, Ollama
- **AI Model:** Qwen3 4B
- **Database:** MongoDB
- **Vector Database:** ChromaDB

## Project Architecture
1. Users submit legal questions through the React frontend.
2. The Node.js backend forwards questions to the Python AI service.
3. ChromaDB retrieves relevant legal document information.
4. Ollama generates an answer using the available context.
5. Answers and chat records are stored in MongoDB.

## Installation and Setup

### Prerequisites
- Node.js and npm
- Python
- MongoDB
- Ollama
- Git

### 1. Clone the Repository
```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd YOUR_PROJECT_FOLDER
```

### 2. Start the Node.js Backend
Open a terminal in the backend folder:
```bash
npm install
node server.js
```

### 3. Start the Python AI Service
Open another terminal in the folder containing `main.py`:
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Start the React Frontend
Open another terminal in the frontend folder:
```bash
npm install
npm run dev
```

Ensure MongoDB and Ollama are running and the environment variables are configured before starting the services.

## Environment Variables
Configure the required environment variables in local `.env` files or your deployment platform. Never commit passwords, database credentials, or API secrets to GitHub.

## Legal Disclaimer
This chatbot provides general legal information for educational purposes. Its responses are not a substitute for advice from a qualified lawyer. Verify important legal matters with reliable legal sources or a qualified legal professional.
