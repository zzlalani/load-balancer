FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose the port the app runs on
EXPOSE 9000

# Start the application with docker env file
CMD ["sh", "-c", "npx dotenvx run --env-file=.env.docker -- node src/server.js"]
