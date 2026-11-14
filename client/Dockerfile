
# Stage 1: Build the React application
FROM node:24-alpine AS build

WORKDIR /app

# Copy dependency files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the React source code
COPY . .

# Generate production files inside dist/
RUN npm run build


# Stage 2: Run the production application
FROM node:24-alpine

WORKDIR /app

# Copy only the production files from the build stage
COPY --from=build /app/dist ./dist

# Copy our Node.js production server
COPY frontend-server.js ./frontend-server.js

# The application listens on port 3000
EXPOSE 3000

# Start the production server
CMD ["node", "frontend-server.js"]
