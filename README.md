# DIXAZ Backend

Node.js + Express backend with MongoDB database and private GridFS file uploads.

## Structure

- `models/`: Database connection, GridFS setup, schema validation, and DB initializer (`init-db.js`).
- `routes/`: Auth (Google OAuth2 & sessions), office, files, and documents routes.
- `services/`: Workspace state management, office business logic, workforce tracking, and operations.
- `utils/`: Access control, Google token verification, file validation, error handlers, and config.
- `tests/`: Automated unit and integration test suites.
- `uploads/`: Uploads directory.
- `server.js`: Main Express application server.

## Scripts

- `npm run dev`: Start backend in watch mode (`node --watch server.js`).
- `npm start`: Start backend server.
- `npm run db:init`: Initialize MongoDB collections and indexes.
- `npm test`: Run backend unit tests.
- `npm run test:integration`: Run MongoDB integration tests.

