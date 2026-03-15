# CELTIC - Collaborative Environment for Learning and Teaching with Integrated Coding

**The project's goal is to create a collaborative programming tool that allows students to do programming on a shared whiteboard. Students connect to a live session using their own isolated Docker-backed coding environment, complete programming exercises, and let teachers monitor progress in real time.**

This repository contains both sides of the application:
- A React frontend for teacher and student workflows
- An Express and Socket.IO backend for session management, real-time updates, and Docker-based code execution

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Client Side](#client-side)
  - [Technologies Used](#technologies-used-client)
  - [Getting Started](#getting-started-client)
- [Server Side](#server-side)
  - [Technologies Used](#technologies-used-server)
  - [Getting Started](#getting-started-server)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Getting Started

### Prerequisites

Before running the project locally, make sure you have the following installed:

- Node.js and npm
- Docker Desktop
- MongoDB locally, or a MongoDB Atlas connection string
- A modern web browser such as Chrome, Edge, or Firefox

Docker is required because each student session uses an isolated Python container for running code.

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd CELTIC-II

# Install client-side dependencies
cd client
npm install

# Install server-side dependencies
cd ../server
npm install
```

### Environment Setup

Create a `.env` file inside the `server` folder.

Example:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/celtic
JWT_SECRET=replace-with-a-secure-secret
PORT=8000
```

Notes:
- `MONGODB_URI` is used for teachers, sessions, tasks, templates, and saved progress.
- `JWT_SECRET` is used for teacher authentication.
- `PORT` is optional. If it is not provided, the backend runs on port `8000`.

If MongoDB is not configured, the server can still start, but database-backed features will not work properly.

### Running the Application

Run the backend and frontend in separate terminals.

```bash
# Terminal 1
cd server
npm run dev
```

```bash
# Terminal 2
cd client
npm start
```

The application will then be available at:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

The first code execution may take a little longer because Docker may need to pull the `python:3.9` image.

## Project Structure

```text
client/   React frontend for teacher and student interfaces
server/   Express backend, Socket.IO events, MongoDB models, and Docker execution
README.md Project overview and setup guide
```

## Client Side

The client is responsible for the teacher dashboard, student workspace, authentication pages, and real-time session views.

### Technologies Used Client

- React
- TypeScript
- React Router
- PrimeReact and PrimeIcons
- Monaco Editor
- Axios
- Socket.IO Client

### Getting Started Client

From the `client` directory:

```bash
npm install
npm start
```

This starts the frontend development server on `http://localhost:3000`.

## Server Side

The server handles authentication, session creation, task and template management, leaderboard logic, Docker container lifecycle, and all real-time communication between teachers and students.

### Technologies Used Server

- Node.js
- Express
- TypeScript
- Socket.IO
- Dockerode
- MongoDB and Mongoose
- JSON Web Tokens

### Getting Started Server

From the `server` directory:

```bash
npm install
npm run dev
```

Available scripts:
- `npm run dev` starts the server with Nodemon
- `npm start` runs the server with `ts-node`

By default, the backend accepts requests on port `8000` and allows the frontend running on `http://localhost:3000`.

## Usage

Once the frontend and backend are running, the normal flow is:

1. A teacher registers or logs in.
2. The teacher creates tasks and, if needed, reusable session templates.
3. The teacher creates a session and shares the generated session code.
4. Students join using their name and the session code.
5. Students write and run Python code in their own containerised environment.
6. Teachers can monitor student code, view terminal output, and manage the session in real time.
7. At the end of a session, the teacher can close it and review the session summary.

The application currently supports:
- Empty sessions with a simple task description
- Template-based sessions
- Teaching mode
- Game mode with task progression and scoring

## Contributing

If you are extending the project, keep changes small and focused where possible.

Useful guidelines:
- Document any new setup steps
- Keep frontend and backend changes in sync when adding new features
- Test session flows from both the teacher and student side before merging

## License

No license file is currently included in this repository. If this project is going to be shared or distributed, adding a license would be a good next step.

## Acknowledgements

This project builds on a number of tools and libraries that made development easier:

- React
- Create React App
- PrimeReact
- Monaco Editor
- Socket.IO
- Docker
- MongoDB and Mongoose
